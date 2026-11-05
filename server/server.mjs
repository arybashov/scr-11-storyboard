import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHmac, timingSafeEqual, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const MAX_FILE = 15 * 1024 * 1024;
const MAX_STORAGE = Number(process.env.MAX_STORAGE_BYTES || 1024 * 1024 * 1024);
const TTL = 7 * 24 * 60 * 60 * 1000;
const validShots = new Set(['T01','T02','T03','T04','T05','T06','A01','A02','A03','A04','A05','B01','B02','B03','B04','B05','C01','C02','C03','C04','C05','C06']);
const formats = {jpeg:'jpg',png:'png',webp:'webp'};
const mime = {jpg:'image/jpeg',png:'image/png',webp:'image/webp'};
sharp.cache({memory:24,files:0,items:10});sharp.concurrency(1);

export function createBoardServer(options = {}) {
  const directory = options.dataDir || process.env.DATA_DIR;
  const secret = options.secret || process.env.SESSION_SECRET;
  const accessCode = options.accessCode || process.env.TEAM_ACCESS_CODE;
  const origins = new Set((options.origins || process.env.ALLOWED_ORIGINS || 'https://arybashov.github.io').split(','));
  if(!directory || !secret || secret.length < 32 || !accessCode || accessCode.length < 12) throw new Error('Set DATA_DIR, SESSION_SECRET (32+ chars), TEAM_ACCESS_CODE (12+ chars)');
  fs.mkdirSync(path.join(directory,'media'),{recursive:true,mode:0o750});
  const indexPath=path.join(directory,'index.json');
  let index=fs.existsSync(indexPath)?JSON.parse(fs.readFileSync(indexPath,'utf8')):{revision:0,shots:{}};
  if(!Number.isInteger(index.revision) || !index.shots)throw new Error('Invalid gallery index: refusing to overwrite');
  let storedBytes=fs.readdirSync(path.join(directory,'media')).reduce((n,f)=>n+fs.statSync(path.join(directory,'media',f)).size,0);
  let activeUpload=false;
  const attempts=new Map();
  const sign=value=>createHmac('sha256',secret).update(value).digest('base64url');
  const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
  function save(){
    index.revision++;
    const temporary=indexPath+'.tmp', fd=fs.openSync(temporary,'w',0o640);
    try{fs.writeFileSync(fd,JSON.stringify(index));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(temporary,indexPath);
  }
  function authenticate(req){
    const token=(req.headers.authorization||'').replace(/^Bearer /,''),parts=token.split('.');
    if(parts.length!==2||!equal(sign(parts[0]),parts[1]))return null;
    try{const data=JSON.parse(Buffer.from(parts[0],'base64url'));return data.expiresAt>Date.now()&&typeof data.name==='string'?data:null;}catch{return null;}
  }
  function body(req,limit){
    return new Promise((resolve,reject)=>{
      const length=Number(req.headers['content-length']);
      if(!Number.isSafeInteger(length)||length<0||length>limit){req.resume();reject(Object.assign(new Error('Превышен размер файла'),{status:413}));return;}
      let size=0;const chunks=[];
      req.on('data',chunk=>{size+=chunk.length;if(size>limit){chunks.length=0;reject(Object.assign(new Error('Превышен размер файла'),{status:413}));}else chunks.push(chunk);});
      req.on('end',()=>size>limit?null:size!==length?reject(Object.assign(new Error('Файл передан не полностью'),{status:400})):resolve(Buffer.concat(chunks)));
      req.on('aborted',()=>reject(Object.assign(new Error('Загрузка прервана'),{status:400})));
      req.on('error',reject);
    });
  }
  async function jsonBody(req){try{return JSON.parse(await body(req,8192));}catch(error){if(error.status)throw error;throw Object.assign(new Error('Некорректный JSON'),{status:400});}}
  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin;
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    if(origin&&origins.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    const reply=(status,data)=>{if(!res.headersSent){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}};
    if(origin&&!origins.has(origin)){req.resume();reply(403,{error:'Этот адрес сайта не разрешён'});return;}
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, X-File-Name, X-Image-Note','Access-Control-Max-Age':'600'});res.end();return;}
    const url=new URL(req.url,'http://localhost');
    try{
      if(req.method==='GET'&&url.pathname==='/health'){reply(200,{ok:true,service:'kino-storyboard',revision:index.revision});return;}
      if(req.method==='GET'&&url.pathname==='/gallery'){reply(200,index);return;}
      if(req.method==='GET'&&/^\/media\/[a-f0-9-]+(?:-thumb)?\.(jpg|png|webp)$/.test(url.pathname)){
        const filename=path.basename(url.pathname),file=path.join(directory,'media',filename);
        if(!fs.existsSync(file)){reply(404,{error:'Изображение не найдено'});return;}
        res.writeHead(200,{'Content-Type':mime[filename.split('.').pop()],'Content-Length':fs.statSync(file).size,'Cache-Control':'public, max-age=31536000, immutable'});
        const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);return;
      }
      if(req.method==='POST'&&url.pathname==='/session'){
        const ip=req.headers['x-real-ip']||req.socket.remoteAddress,now=Date.now();
        if(attempts.size>10000)for(const[k,v]of attempts)if(v.until<now)attempts.delete(k);
        const attempt=attempts.get(ip)||{count:0,until:now+900000};
        if(attempt.until<now){attempt.count=0;attempt.until=now+900000;}
        if(attempt.count>=10){req.resume();reply(429,{error:'Слишком много попыток. Повторите через 15 минут.'});return;}
        const data=await jsonBody(req);
        if(typeof data.code!=='string'||!equal(sign(data.code),sign(accessCode))){attempt.count++;attempts.set(ip,attempt);reply(401,{error:'Неверный код проекта'});return;}
        if(typeof data.name!=='string'||data.name.trim().length<2||data.name.trim().length>60){reply(400,{error:'Введите имя от 2 до 60 символов'});return;}
        attempts.delete(ip);const payload={name:data.name.trim(),expiresAt:now+TTL};
        const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
        reply(200,{...payload,token:encoded+'.'+sign(encoded)});return;
      }
      const route=url.pathname.match(/^\/shots\/([A-C]\d{2})\/(images|current)$/);
      if(route&&validShots.has(route[1])){
        const auth=authenticate(req);
        if(!auth){req.resume();reply(401,{error:'Войдите в команду по коду проекта'});return;}
        const shot=route[1];
        if(req.method==='PATCH'&&route[2]==='current'){
          const data=await jsonBody(req),record=index.shots[shot];
          if(!record?.images.some(i=>i.id===data.id)){reply(404,{error:'Версия не найдена'});return;}
          const previous=record.current;record.current=data.id;
          try{save();}catch(error){record.current=previous;throw error;}
          reply(200,{ok:true,revision:index.revision});return;
        }
        if(req.method==='POST'&&route[2]==='images'){
          if(activeUpload){req.resume();reply(429,{error:'Сейчас загружается другой файл. Повторите через несколько секунд.'});return;}
          const length=Number(req.headers['content-length']);
          if(!Number.isSafeInteger(length)||length<=0||length>MAX_FILE){req.resume();reply(413,{error:'Файл должен быть не больше 15 МБ'});return;}
          if(storedBytes+length+5*1024*1024>MAX_STORAGE){req.resume();reply(507,{error:'Хранилище заполнено. Обратитесь к владельцу проекта.'});return;}
          if(!['image/jpeg','image/png','image/webp'].includes(req.headers['content-type'])){req.resume();reply(415,{error:'Поддерживаются JPG, PNG и WebP'});return;}
          let name,note;
          try{name=decodeURIComponent(req.headers['x-file-name']||'image').slice(0,180);note=decodeURIComponent(req.headers['x-image-note']||'').slice(0,500);}catch{req.resume();reply(400,{error:'Некорректное имя файла'});return;}
          activeUpload=true;const created=[];
          try{
            const buffer=await body(req,MAX_FILE),image=sharp(buffer,{limitInputPixels:20_000_000,failOn:'error'});
            let meta,thumbnail;
            try{
              meta=await image.metadata();
              if(!formats[meta.format]||!meta.width||!meta.height||(meta.pages||1)>1)throw new Error('Unsupported');
              thumbnail=await image.rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer();
            }catch{reply(415,{error:'Нужна корректная неподвижная картинка JPG, PNG или WebP до 20 мегапикселей'});return;}
            const id=randomUUID(),original=`media/${id}.${formats[meta.format]}`,thumb=`media/${id}-thumb.webp`;
            if(storedBytes+buffer.length+thumbnail.length>MAX_STORAGE){reply(507,{error:'Хранилище заполнено'});return;}
            for(const[file,bytes]of[[original,buffer],[thumb,thumbnail]]){const full=path.join(directory,file);fs.writeFileSync(full,bytes,{flag:'wx',mode:0o640});created.push(full);}
            const entry={id,author:auth.name,note,originalName:name,createdAt:new Date().toISOString(),width:meta.width,height:meta.height,bytes:buffer.length,original,thumbnail:thumb};
            const record=index.shots[shot]||{images:[],current:null};const previous=record.current;
            record.images.push(entry);if(!record.current)record.current=id;index.shots[shot]=record;
            try{save();}catch(error){record.images.pop();record.current=previous;throw error;}
            storedBytes+=buffer.length+thumbnail.length;created.length=0;
            reply(201,{ok:true,image:entry,revision:index.revision});return;
          }finally{for(const file of created)fs.rmSync(file,{force:true});activeUpload=false;}
        }
      }
      req.resume();reply(404,{error:'Не найдено'});
    }catch(error){console.error('request_failed',req.method,url.pathname,error.code||error.status||'internal');reply(error.status||500,{error:error.status?error.message:'Не удалось сохранить. Повторите загрузку.'});}
  });
  server.requestTimeout=120000;server.headersTimeout=20000;server.keepAliveTimeout=5000;
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=createBoardServer();server.listen(Number(process.env.PORT||8792),'127.0.0.1',()=>console.log('KINO API listening on loopback'));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
