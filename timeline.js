import {round,defaultTimeline,validateTimeline,resizeShot,totalDuration,shotStart} from './server/timeline-model.mjs?v=20261107-sequence';
async function initTimeline(){
const library=await fetch('server/sound-library.json?v=20261107-sequence').then(r=>{if(!r.ok)throw new Error('Библиотека звуков недоступна');return r.json();});
const original=structuredClone(currentEpisode),defaults=defaultTimeline(original),draftKey='kino-full-sequence-timeline-v2';
let state=structuredClone(defaults),revision=0,dirty=false,selected={type:'shot',id:'I01'},history=[],future=[],zoom=55,drag=null,saving=false,remote=null,notice=null;
const root=document.getElementById('timeline-editor');
const sourceOf=c=>library.find(s=>s.id===c.source);
const fmt=n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2});
const clone=()=>structuredClone(state);
const audioEngine={context:null,master:null,buffers:new Map(),nodes:[],generation:0,origin:0,startedAt:0,muted:false,volume:.75,
 async prepare(){
  if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.connect(this.context.destination);this.setVolume();}
  await this.context.resume();
  await Promise.all([...new Set(state.sounds.filter(c=>!c.muted).map(c=>c.source))].map(async id=>{
   if(!this.buffers.has(id)){const item=library.find(s=>s.id===id);const res=await fetch(item.src);if(!res.ok)throw new Error('Не загрузился звук: '+item.name);this.buffers.set(id,await this.context.decodeAudioData(await res.arrayBuffer()));}
  }));
 },
 stop(){this.generation++;for(const node of this.nodes){try{node.stop();}catch{}}this.nodes=[];},
 async start(time){
  this.stop();const gen=this.generation;
  try{await this.prepare();if(gen!==this.generation)return false;
   const now=this.context.currentTime+.04;this.origin=now-time;this.startedAt=time;
   for(const c of state.sounds){
    if(c.muted||c.gain===0||c.start+c.duration<=time)continue;
    const data=sourceOf(c),buffer=this.buffers.get(c.source),skip=Math.max(0,time-c.start),remaining=Math.min(c.duration-skip,totalDuration(state)-Math.max(time,c.start));if(remaining<=0)continue;
    const at=now+Math.max(0,c.start-time),node=this.context.createBufferSource(),gain=this.context.createGain();node.buffer=buffer;node.loop=!!data.loop;
    const offset=data.loop?(c.offset+skip)%buffer.duration:Math.min(c.offset+skip,buffer.duration-.001);
    const duration=data.loop?remaining:Math.min(remaining,buffer.duration-offset);if(duration<=0)continue;
    node.connect(gain);gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(c.gain,at+Math.min(.008,duration/4));gain.gain.setValueAtTime(c.gain,at+Math.max(.008,duration-.03));gain.gain.linearRampToValueAtTime(0,at+duration);
    if((c.source==='truck'||c.source==='horn-long')){
     const pan=this.context.createStereoPanner();gain.connect(pan);pan.connect(this.master);pan.pan.setValueAtTime(-.8+1.6*skip/c.duration,at);pan.pan.linearRampToValueAtTime(.8,at+duration);
    }else gain.connect(this.master);
    node.start(at,offset,duration);this.nodes.push(node);
   }
   setSoundStatus('Черновые шумы · реплики, крик, дыхание и музыка ещё не проложены');return true;
  }catch(error){setSoundStatus(error.message,true);return false;}
 },
 position(){return Math.max(this.startedAt,this.context.currentTime-this.origin);},
 setVolume(){if(this.master)this.master.gain.value=this.muted?0:this.volume;}
};
function setSoundStatus(text,error=false){document.querySelectorAll('[data-sound-status]').forEach(el=>{el.textContent=text;el.classList.toggle('error',error);});}
function status(text,error=false,sticky=true){if(sticky)notice={text,error};else if(notice)({text,error}=notice);const el=root.querySelector('[data-edit-status]');if(el){el.textContent=text;el.classList.toggle('error',error);}}
function markDraft(){dirty=JSON.stringify(state)!==JSON.stringify(remote?.state||defaults);if(dirty)remember();else try{localStorage.removeItem(draftKey);}catch{}}
function remember(){try{localStorage.setItem(draftKey,JSON.stringify({revision,state}));}catch{status('Не удалось сохранить черновик в браузере',true);}}
function apply(){
 for(const saved of state.shots){const s=currentEpisode.shots.find(s=>s.id===saved.id);s.duration=saved.duration;if(saved.phases)saved.phases.forEach(p=>{s.phases.find(x=>x.id===p.id).duration=p.duration;});}
 currentEpisode.duration=totalDuration(state);currentEpisode.adaptation=`${window.PILOT_BEATS.length} событий / ${state.shots.length} монтажных кадров / ${fmt(currentEpisode.duration)} с. Длительности редактируются в монтаже. Составные планы сохраняют непрерывность действия. I — салон, T — шоссе, U — переход. Реплики ещё не записаны; диалоговый ритм уточним по прогону.`;
 animatic.time=Math.min(animatic.time,currentEpisode.duration);renderBoard();renderEpisodes();render();updateAnimatic(true);
}
function commit(next){
 try{next=validateTimeline(next,library);}catch(error){status(error.message,true);return;}
 if(JSON.stringify(next)===JSON.stringify(state))return;
 pauseAnimatic();history.push(clone());if(history.length>50)history.shift();future=[];state=next;notice=null;markDraft();apply();
}
function selectedClip(){return (selected.type==='shot'?state.shots:state.sounds).find(c=>c.id===selected.id);}
function wave(c){
 const source=sourceOf(c),peaks=source.peaks,max=Math.max(...peaks,.001),n=64;
 return `<svg class="sound-wave" viewBox="0 0 ${n*3} 32" preserveAspectRatio="none" aria-hidden="true">${Array.from({length:n},(_,i)=>{const time=c.offset+c.duration*i/n,pos=source.loop?time%source.duration:time,p=peaks[Math.min(peaks.length-1,Math.floor(pos/source.duration*peaks.length))]/max,h=Math.max(1,p*26);return `<path d="M${i*3} ${16-h/2}v${h}"/>`;}).join('')}</svg>`;
}
function renderTracks(){
 const total=totalDuration(state),width=Math.max(620,Math.ceil(total*zoom));
 root.style.setProperty('--timeline-width',width+'px');
 const ticks=Array.from({length:Math.floor(total)+1},(_,i)=>`<button class="edit-tick" style="left:${i/total*100}%" data-editor-seek="${i}" aria-label="Позиция ${i} секунд">${i}</button>`).join('');
 let time=0;
 const shots=state.shots.map(s=>{const start=time;time=round(time+s.duration);const originalShot=original.shots.find(x=>x.id===s.id);return `<div class="edit-clip video-clip ${selected.type==='shot'&&selected.id===s.id?'selected':''}" role="button" tabindex="0" data-edit-type="shot" data-edit-id="${s.id}" style="left:${start/total*100}%;width:${s.duration/total*100}%" aria-label="${s.id}, ${esc(originalShot.title)}, ${fmt(s.duration)} секунд"><span>${s.id} · ${fmt(s.duration)}с</span>${s.phases?`<i style="left:${s.phases[0].duration/s.duration*100}%"></i>`:''}<span class="trim-handle right" data-edge="end" title="Изменить длительность плана" aria-hidden="true"></span></div>`;}).join('');
 const rows=['Дождь','Действия','Машина','Гудок'].map((label,track)=>`<div class="edit-lane sound-lane"><span class="lane-name">${label}</span>${state.sounds.filter(c=>c.track===track).map(c=>`<div class="edit-clip audio-clip ${c.muted?'muted':''} ${selected.type==='sound'&&selected.id===c.id?'selected':''}" role="button" tabindex="0" data-edit-type="sound" data-edit-id="${c.id}" style="left:${c.start/total*100}%;width:${c.duration/total*100}%" aria-label="${esc(sourceOf(c).name)}, начало ${fmt(c.start)} с, длительность ${fmt(c.duration)} с">${wave(c)}<span>${esc(sourceOf(c).name)}</span><span class="trim-handle left" data-edge="start" aria-hidden="true"></span><span class="trim-handle right" data-edge="end" aria-hidden="true"></span></div>`).join('')}</div>`).join('');
 root.querySelector('.edit-canvas').innerHTML=`<div class="edit-ruler">${ticks}</div><div class="edit-lane video-lane"><span class="lane-name">Планы</span>${shots}</div>${rows}<div class="edit-playhead" style="left:${animatic.time/total*100}%"></div>`;
}
function inspector(){
 const item=selectedClip(),el=root.querySelector('.edit-inspector');if(!item){el.innerHTML='<p>Выберите план или звук.</p>';return;}
 const field=(label,key,value,min,max,step=.05)=>`<label>${label}<input data-edit-field="${key}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
 if(selected.type==='shot')el.innerHTML=`<strong>${item.id} · ${esc(original.shots.find(s=>s.id===item.id).title)}</strong>${field('Длительность, с','duration',item.duration,.2,30)}${item.phases?item.phases.map((p,i)=>field(`Фаза ${i+1}, с`,'phase-'+i,p.duration,.1,item.duration-.1)).join(''):''}<small>Правый край меняет длительность; следующие планы сдвигаются.</small>`;
 else el.innerHTML=`<strong>${esc(sourceOf(item).name)}</strong>${field('Начало, с','start',item.start,0,totalDuration(state)-.05)}${field('Длина, с','duration',item.duration,.05,totalDuration(state))}${field('Срез начала, с','offset',item.offset,0,sourceOf(item).duration-.05)}${field('Громкость, %','gain',Math.round(item.gain*100),0,200,5)}<label>Дорожка<select data-edit-field="track">${['Дождь','Действия','Машина','Гудок'].map((v,i)=>`<option value="${i}" ${item.track===i?'selected':''}>${v}</option>`).join('')}</select></label><button data-edit-mute>${item.muted?'Включить клип':'Заглушить клип'}</button><button data-edit-remove>Убрать клип</button>`;
}
function render(){
 if(!root.querySelector('.edit-canvas'))return;
 renderTracks();inspector();
 root.querySelector('[data-edit-undo]').disabled=!history.length;root.querySelector('[data-edit-redo]').disabled=!future.length;root.querySelector('[data-edit-save]').disabled=saving||!dirty;
 status(dirty?'Черновик в этом браузере · сохраните для команды':revision?`Общий монтаж · версия ${revision}`:'Стартовая шумовая раскладка',false,false);
}
root.innerHTML=`<div class="edit-toolbar"><strong>МОНТАЖ</strong><button data-edit-undo aria-label="Отменить изменение монтажа">↶</button><button data-edit-redo aria-label="Повторить изменение монтажа">↷</button><label class="ripple-option"><input id="edit-ripple" type="checkbox" checked> Сдвигать звуки за склейкой</label><label class="zoom-option">Масштаб <input id="edit-zoom" type="range" min="32" max="120" step="4" value="55" aria-label="Масштаб таймлайна"></label><button class="primary" data-edit-save>Сохранить для команды</button><button data-edit-shared>Общая версия</button></div><p class="edit-status" data-edit-status role="status"></p><p class="edit-help">Тяните правый край плана. Звуки передвигайте целиком, края — подрезайте. Шаг: 0,05 с. Точные значения — в полях ниже.</p><div class="edit-scroll"><div class="edit-canvas"></div></div><div class="edit-inspector"></div><div class="sound-library"><label>Добавить шум <select id="sound-add">${library.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><button data-edit-add>+ В текущую позицию</button><details><summary>Источники и лицензии</summary><p>Черновые шумы. Реплики, звонок, дыхание, крик и музыка пока только в описаниях планов; их предстоит записать или подобрать.</p>${library.map(s=>`<p><a href="${esc(s.source)}" target="_blank" rel="noopener">${esc(s.name)}</a> — ${esc(s.author)}, <a href="${esc(s.licenseUrl)}" target="_blank" rel="noopener">${esc(s.license)}</a>. ${s.id==='horn-long'?'Синтезированный библиотечный эскиз; растяжение и короткий хвост.':'Фрагмент, нормализация уровня, плавные края.'}</p>`).join('')}<a href="audio/CREDITS.md" target="_blank">Полный список источников ↗</a></details></div>`;
root.addEventListener('pointerdown',e=>{
 const clip=e.target.closest('[data-edit-id]');if(!clip||e.button!==0||saving)return;
 pauseAnimatic();selected={type:clip.dataset.editType,id:clip.dataset.editId};inspector();root.querySelectorAll('.edit-clip').forEach(n=>n.classList.toggle('selected',n===clip));
 const edge=e.target.dataset.edge||'move';if(selected.type==='shot'&&edge==='move')return;
 const canvas=root.querySelector('.edit-canvas'),before=clone();drag={pointer:e.pointerId,x:e.clientX,before,edge,...selected,scale:canvas.getBoundingClientRect().width/totalDuration(state)};root.setPointerCapture(e.pointerId);e.preventDefault();
});
root.addEventListener('pointermove',e=>{
 if(!drag||e.pointerId!==drag.pointer)return;
 const delta=Math.round((e.clientX-drag.x)/drag.scale*20)/20,next=structuredClone(drag.before);
 if(drag.type==='shot')resizeShot(next,drag.id,next.shots.find(s=>s.id===drag.id).duration+delta,root.querySelector('#edit-ripple').checked);
 else {
  const c=next.sounds.find(c=>c.id===drag.id),src=sourceOf(c),total=totalDuration(next),old=drag.before.sounds.find(c=>c.id===drag.id);
  if(drag.edge==='move')c.start=round(Math.max(0,Math.min(total-c.duration,old.start+delta)));
  if(drag.edge==='end')c.duration=round(Math.max(.05,Math.min(total-c.start,src.loop?300:src.duration-c.offset,old.duration+delta)));
  if(drag.edge==='start'){
   const shift=round(Math.max(-old.start,-old.offset,Math.min(old.duration-.05,delta)));
   c.start=round(old.start+shift);c.offset=round(old.offset+shift);c.duration=round(old.duration-shift);
  }
 }
 try{state=validateTimeline(next,library);renderTracks();inspector();}catch{}
});
function endDrag(e,cancel=false){if(!drag||e.pointerId!==drag.pointer)return;const next=clone();state=drag.before;drag=null;if(root.hasPointerCapture(e.pointerId))root.releasePointerCapture(e.pointerId);if(cancel)render();else commit(next);}
root.addEventListener('pointerup',e=>endDrag(e));root.addEventListener('pointercancel',e=>endDrag(e,true));
root.addEventListener('keydown',e=>{
 if(e.target.matches('input,select'))return;
 const clip=e.target.closest('[data-edit-id]');
 if(clip&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();selected={type:clip.dataset.editType,id:clip.dataset.editId};render();}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();undo(e.shiftKey);}
});
root.addEventListener('change',e=>{
 if(!e.target.dataset.editField||saving)return;
 const key=e.target.dataset.editField,value=Number(e.target.value);if(!Number.isFinite(value)){render();return;}
 const next=clone(),item=(selected.type==='shot'?next.shots:next.sounds).find(s=>s.id===selected.id);
 if(selected.type==='shot'){
  if(key==='duration')resizeShot(next,item.id,value,root.querySelector('#edit-ripple').checked);
  else{const i=Number(key.split('-')[1]);if(value<.1||value>item.duration-.1){render();return;}item.phases[i].duration=round(value);item.phases[1-i].duration=round(item.duration-value);}
 }else item[key]=key==='gain'?value/100:value;
 commit(next);
});
root.querySelector('#edit-zoom').addEventListener('input',e=>{zoom=Number(e.target.value);renderTracks();});
function undo(redo=false){if(saving)return;const from=redo?future:history,to=redo?history:future;if(!from.length)return;pauseAnimatic();to.push(clone());state=from.pop();notice=null;markDraft();apply();}
async function save(){
 if(saving||!dirty)return;
 if(!session){showLogin();status('Войдите по коду проекта, затем нажмите «Сохранить для команды»');return;}
 saving=true;render();status('Сохраняю…');
 try{
  const saved=await request('/timeline/sequence',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,state})});
  revision=saved.revision;remote=saved;dirty=false;try{localStorage.removeItem(draftKey);}catch{}status(`Сохранено для команды · версия ${revision}`);
 }catch(error){status(error.message,true);}finally{saving=false;root.querySelector('[data-edit-save]').disabled=!dirty;}
}
root.addEventListener('click',async e=>{
 if(saving)return;
 if(e.target.closest('[data-edit-undo]'))undo();if(e.target.closest('[data-edit-redo]'))undo(true);
 if(e.target.closest('[data-edit-save]'))save();
 if(e.target.closest('[data-edit-shared]')){
  try{const saved=await request('/timeline/sequence');pauseAnimatic();history.push(clone());future=[];state=saved.state?validateTimeline(saved.state,library):structuredClone(defaults);revision=saved.revision;dirty=false;remote=saved;notice=null;try{localStorage.removeItem(draftKey);}catch{}apply();status('Общая версия загружена. Предыдущий черновик можно вернуть кнопкой ↶.');}catch(error){status(error.message,true);}
 }
 if(e.target.closest('[data-editor-seek]'))seekAnimatic(Number(e.target.closest('[data-editor-seek]').dataset.editorSeek));
 if(e.target.closest('[data-edit-add]')){
  const src=library.find(s=>s.id===root.querySelector('#sound-add').value),start=Math.min(animatic.time,totalDuration(state)-.05),duration=round(Math.min(src.loop?totalDuration(state)-start:src.duration,totalDuration(state)-start)),next=clone();
  const id='s-'+crypto.randomUUID();next.sounds.push({id,source:src.id,start:round(start),duration,offset:0,gain:.7,track:src.id==='rain'?0:src.id.startsWith('horn')?3:src.id==='truck'?2:1,muted:false});selected={type:'sound',id};commit(next);
 }
 if(e.target.closest('[data-edit-mute]')){const next=clone(),c=next.sounds.find(c=>c.id===selected.id);c.muted=!c.muted;commit(next);}
 if(e.target.closest('[data-edit-remove]')){const next=clone();next.sounds=next.sounds.filter(c=>c.id!==selected.id);selected={type:'shot',id:'I01'};commit(next);}
});
for(const b of document.querySelectorAll('[data-sound-toggle]'))b.addEventListener('click',()=>{
 audioEngine.muted=!audioEngine.muted;audioEngine.setVolume();document.querySelectorAll('[data-sound-toggle]').forEach(el=>{el.textContent=audioEngine.muted?'Звук выключен':'Звук включён';el.setAttribute('aria-pressed',String(!audioEngine.muted));});
});
document.getElementById('sound-master-volume').addEventListener('input',e=>{audioEngine.volume=Number(e.target.value)/100;audioEngine.setVolume();});
window.KinoTimeline={
 start:time=>audioEngine.start(time),stop:()=>audioEngine.stop(),position:()=>audioEngine.position(),
 seek(time){if(animatic.playing){pauseAnimatic();animatic.time=time;playAnimatic();}},
 update(time){const p=root.querySelector('.edit-playhead');if(p)p.style.left=Math.min(100,time/totalDuration(state)*100)+'%';},
 receive(saved){if(!saved||saved.revision<=revision||drag)return;remote=saved;if(dirty){status('Есть новая общая версия. Ваш черновик сохранён в браузере.',true);return;}if(animatic.playing||root.contains(document.activeElement))return;try{state=validateTimeline(saved.state,library);revision=saved.revision;apply();}catch{}},
 render
};
try{
 remote=await request('/timeline/sequence');revision=remote.revision;if(remote.state)state=validateTimeline(remote.state,library);
 }catch(error){status('Общий монтаж пока недоступен. Правки сохраняются в браузере.',true);}
try{const draft=JSON.parse(localStorage.getItem(draftKey)||'null');if(draft){state=validateTimeline(draft.state,library);revision=draft.revision;markDraft();}}catch{status('Не удалось восстановить черновик браузера.',true);}
apply();if(dirty&&remote&&remote.revision!==revision)status('Есть новая общая версия. Ваш черновик сохранён в браузере.',true);
setSoundStatus('Шумовая раскладка · нажмите ▶');

}
initTimeline().catch(error=>{window.KinoTimelineError=error.message;document.querySelectorAll("[data-sound-status]").forEach(el=>{el.textContent="Не удалось загрузить монтаж: "+error.message+". Обновите страницу.";el.classList.add("error");});});
