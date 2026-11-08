'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const episodes = window.EPISODES;
const apiBase = window.KINO_CONFIG.apiBase.replace(/\/$/, '');
let screenplay, currentEpisode = episodes[0], currentShot = 0, currentPhase = 0, selectedVersion = null;
let gallery = {revision: -1, shots: {}}, pendingUpload = null, uploadTarget = null, galleryRequest = false;
let session = null;
let lastView = null;
let assetFilter='Все', currentAsset=null, assetVersion=null;
const assets=window.ASSETS;
const assetData=id=>gallery.assets?.[id] || {images:[],current:null};
const uploadPath=id=>assets.some(a=>a.id===id)?'assets':'shots';
const animatic = {time:0,playing:false,last:0,frame:null,episode:null,shown:null,generation:0,loading:false};
try { session = JSON.parse(sessionStorage.getItem('kino-session')); } catch {}
if (session && session.expiresAt < Date.now()) session = null;

// Code-native schematic panels, intentionally not presented as finished artwork.
function sketch(type, label = '') {
  if(type.startsWith('seq-'))return sequenceSketch(type.slice(4),label);
  if(type.startsWith('pilot-'))return pilotSketch(type.slice(6),label);
  const line = '#9eaf9a', light = '#d5ec8c';
  const person = (x,y,s=1,pose='still') => `<g transform="translate(${x} ${y}) scale(${s})" fill="#101813" stroke="#bac5ac" stroke-width="1.5"><ellipse cx="0" cy="-83" rx="10" ry="13"/><path d="M-10-69 Q-19-46-21-20 L19-20 Q18-47 10-69Z"/><path d="M-12-20 L-15 12 L-21 39 L-15 41 L-2 14 L3-19 M10-20 L19 8 L28 31 L34 28 L28 3 L19-20"/><path fill="none" stroke-width="5" d="${pose==='reach'?'M-12-61 L-35-42 L-53-56 M12-61 L35-48 L52-68':pose==='up'?'M-12-61 L-32-90 L-31-112 M12-61 L32-90 L34-112':'M-12-61 L-26-35 L-24-12 M12-61 L27-35 L31-14'}"/></g>`;
  const corridor = `<path fill="#29372e" d="M0 0H640L390 108H250Z"/><path fill="#202c23" d="M0 0L250 108V245L0 360Z"/><path fill="#344332" d="M640 0L390 108V245L640 360Z"/><path fill="#3c4937" d="M0 360L250 245H390L640 360Z"/><path fill="#172119" d="M250 108H390V245H250Z"/><g stroke="${line}" stroke-width="1" opacity=".65" fill="none"><path d="M0 0L250 108V245L0 360 M640 0L390 108V245L640 360 M250 108H390 M250 245H390 M0 102L250 143 M0 203L250 186 M640 102L390 143 M640 203L390 186 M0 304L250 230 M640 304L390 230 M126 0L278 108 M514 0L362 108 M84 360L278 245 M556 360L362 245 M0 312H640 M135 277H505 M218 255H422"/><path d="M87 39V320 M179 77V278 M553 39V320 M461 77V278"/></g><g fill="${light}" opacity=".85"><path d="M28 68L110 91V101L28 80Z"/><path d="M160 111L208 121V127L160 119Z"/><path d="M612 68L530 91V101L612 80Z"/><path d="M480 111L432 121V127L480 119Z"/></g><path d="M348 147H390V245H348Z" fill="#bdcba4"/><path d="M352 234H390M356 224H390M360 214H390M364 204H390M368 194H390M372 184H390M376 174H390" stroke="#485a42" stroke-width="2"/>`;
  const rain = `<g stroke="#b2c8b2" opacity=".35" stroke-width="1">${Array.from({length:24},(_,i)=>`<path d="M${i*29-20} 0l-32 86m28 25l-45 120m30 25l-40 100"/>`).join('')}</g>`;
  const arrow = (x,y,dir='left') => `<g transform="translate(${x} ${y}) ${dir==='right'?'scale(-1 1)':''}" stroke="${light}" fill="none" stroke-width="3"><path d="M45 0H0L12-9M0 0l12 9"/></g>`;
  let scene = corridor + person(306,263,.7);
  const car = `<path d="M75 250V205L150 187L208 125H385L455 180L548 194V252Z" fill="#58684b" stroke="#c5d0b2" stroke-width="2"/><path d="M220 140H298V181H179Z M310 140H375L427 181H310Z" fill="#1a2a20" stroke="#a7b89a"/><path d="M303 192V250M432 191L450 244" stroke="#a7b89a"/><path d="M328 199H353" stroke="#d5ec8c" stroke-width="3"/><circle cx="164" cy="249" r="34" fill="#0e1812" stroke="#8b9e7c" stroke-width="3"/><circle cx="458" cy="249" r="34" fill="#0e1812" stroke="#8b9e7c" stroke-width="3"/><rect x="273" y="110" width="58" height="15" fill="#d5ec8c"/>`;
  if(type==='taxi-open'||type==='taxi-slam')scene=`<rect width="640" height="360" fill="#1b2a21"/><path d="M0 275H640V360H0Z" fill="#344433"/><path d="M0 325H640" stroke="#b3c29b" stroke-dasharray="55 35"/>${car}${type==='taxi-open'?'<path d="M310 180L385 153L408 265L310 245Z" fill="#748264" stroke="#c5d0b2"/>':''}${person(363,262,1.35,'reach')}${type==='taxi-slam'?`<path d="M461 172L472 190M480 168L480 190M494 178L488 194" stroke="${light}" stroke-width="3"/><rect x="444" y="271" width="16" height="28" rx="2" transform="rotate(28 452 285)" fill="#bad2a1"/>`:''}`;
  if(type==='phone-road')scene=`<rect width="640" height="360" fill="#19271f"/><path d="M0 140H640V360H0Z" fill="#3a4836"/><path d="M0 300L640 208 M0 320L640 228" stroke="#c2caac" stroke-width="4"/><rect x="280" y="215" width="40" height="70" rx="5" transform="rotate(62 300 250)" fill="#18261c" stroke="#d5ec8c" stroke-width="3"/><path d="M210 258L265 248" stroke="#c5d0ae" stroke-dasharray="4 6"/><circle cx="510" cy="112" r="13" fill="#d5ec8c"/><circle cx="576" cy="112" r="13" fill="#d5ec8c"/><path d="M510 126L362 360H455L576 126" fill="#d5ec8c" opacity=".08"/>`;
  if(type==='truck')scene=`<rect width="640" height="360" fill="#203025"/><path d="M0 280H640V360H0Z" fill="#3a4934"/><path d="M350 0H640V230H350Z" fill="#516344" stroke="#aab99a"/><circle cx="470" cy="234" r="88" fill="#101b13" stroke="#aab99a" stroke-width="3"/><circle cx="470" cy="234" r="43" fill="#35482d" stroke="#8da37b"/><path d="M80 50L182 139L244 274L325 283" stroke="#a5b88c" stroke-width="25" fill="none"/><rect x="304" y="290" width="48" height="16" rx="3" fill="#d5ec8c"/><path d="M565 70H619M565 89H631" stroke="#d5ec8c" stroke-width="3"/>`;
  if(type==='phone-cracked')scene=`<rect width="640" height="360" fill="#253729"/><path d="M190 360L223 198Q230 177 249 195L264 219L419 191L449 232L421 360" fill="#788866" stroke="#b7c6a6"/><g transform="rotate(12 322 180)"><rect x="245" y="47" width="143" height="254" rx="15" fill="#111d15" stroke="#bbc9ab" stroke-width="3"/><rect x="257" y="64" width="119" height="215" fill="#617955"/><path d="M326 69L311 123L341 160L302 204L325 278M311 123L260 145M341 160L372 190M302 204L263 247M318 185L363 236" stroke="#d6e8bb" stroke-width="2"/></g>`+rain;
  if(type==='moving') scene=corridor+`<path d="M195 77L428 77V282H195Z" fill="#3c4d3a" stroke="${line}"/><path d="M211 119H410M211 165H410M211 211H410M211 257H410M254 77V282M360 77V282" stroke="${line}" opacity=".5"/>`+arrow(442,192)+`<path d="M180 77V282" stroke="${light}" stroke-dasharray="5 5"/>`;
  if(type==='reverse') scene=corridor+`<path d="M0 0H120V360H0Z" fill="#42513b" stroke="${line}"/>`+person(370,285,1.05)+arrow(144,187,'right');
  if(type==='closing') scene=corridor+`<path d="M272 96H379V255H272Z" fill="#536345" stroke="${line}"/><path d="M283 144H374M283 192H374M323 96V255" stroke="${line}" opacity=".5"/>`+person(321,267,.8,'reach')+arrow(413,201);
  if(['stairs','escape','watch'].includes(type)) scene=`<path fill="#32432f" d="M0 0H640V360H0Z"/><path fill="#adbca0" d="M214 0H426V114H214Z"/><path fill="#16261a" d="M0 0H150L240 130V360H0Z M640 0H490L400 130V360H640Z"/><path d="M150 360L258 114H382L490 360Z" fill="#4b5f40"/><g stroke="${line}" fill="none"><path d="M214 0V114L114 360 M426 0V114L526 360 M150 0L240 130 M490 0L400 130"/>${Array.from({length:10},(_,i)=>{const y=122+i*i*2.5;const dx=(y-114)*.44;return `<path d="M${258-dx} ${y}H${382+dx}"/>`;}).join('')}<path d="M188 350L277 111M452 350L363 111" stroke-width="4"/></g>`+rain+person(type==='watch'?350:315,type==='escape'?130:190,type==='watch'?1:.7);
  if(type==='rail') scene=`<path fill="#26382a" d="M0 0H640V360H0Z"/><g fill="none" stroke="${line}" opacity=".65"><path d="M0 340L640 40M0 280L640 10M0 220L550 0M0 160L400 0M0 100L250 0"/><path d="M0 230L640 25" stroke-width="15"/></g><path d="M450 360L338 185Q335 173 310 180L275 193Q252 207 247 185Q246 171 265 164L331 140Q351 137 362 161L529 360" fill="#88977a" stroke="#c4cfb2" stroke-width="2"/>`+rain;
  if(type==='corner') scene=corridor+`<path d="M0 0H418V360H0Z" fill="#37482f"/><path d="M418 0V360M0 92H418M0 191H418M0 288H418M138 0V360M280 0V360" fill="none" stroke="${line}" opacity=".5"/>`+arrow(444,280,'right');
  if(type==='encounter') scene=corridor+person(260,295,1.5,'reach')+`<g transform="translate(420 0)"><ellipse cx="0" cy="139" rx="22" ry="26" fill="#101813" stroke="${line}"/><path d="M-26 164Q-42 185-39 271L-26 325H-8L0 265L9 325H26L35 265Q42 182 26 164Z" fill="#172019" stroke="${line}"/><path d="M-32 196L-56 225M32 196L55 227" stroke="${line}" stroke-width="7"/></g>`;
  if(type==='two-exits') scene=`<rect width="640" height="360" fill="#223429"/><path d="M0 260H640V360H0Z" fill="#3d4a39"/><path d="M75 260V206L235 206V260M405 260V206H565V260" fill="#101b14" stroke="${line}"/><path d="M75 206L105 170H265L235 206 M405 206L375 170H535L565 206" fill="none" stroke="${line}"/><path d="M0 320H640" stroke="#c6cdb1" stroke-dasharray="50 24"/>`+person(188,216,.75)+person(460,216,.75)+rain;
  if(type==='door') scene=`<rect width="640" height="360" fill="#33422f"/><g stroke="${line}" opacity=".5"><path d="M0 70H640M0 145H640M0 220H640M0 295H640M90 0V360M210 0V360M430 0V360M550 0V360"/></g><path d="M270 28H434V346H270Z" fill="#6b7963" stroke="#b8c7a8" stroke-width="3"/><path d="M287 43H418V334H287Z" fill="none" stroke="#35482f"/><path d="M406 178H378V188" fill="none" stroke="#e0e9ce" stroke-width="5"/>`+person(265,276,1.7,'reach')+`<path d="M580 0H640V360H580Z" fill="#162419"/>`+arrow(515,245);
  if(type==='handle') scene=`<rect width="640" height="360" fill="#73836b"/><path d="M64 0V360M82 0V360M490 0V360" stroke="#374b32" stroke-width="3"/><rect x="346" y="120" width="39" height="112" rx="4" fill="#293b25" stroke="#b1c3a0"/><path d="M365 145V178H244" stroke="#e0e5d0" stroke-width="14" fill="none"/><path d="M282 104Q243 119 245 151" stroke="${light}" stroke-width="3" fill="none"/><path d="M237 140L245 153L257 141" fill="none" stroke="${light}" stroke-width="3"/><path d="M533 0H640V360H533Z" fill="#2e402b" stroke="${line}"/>`+arrow(462,271);
  if(type==='ceiling') scene=corridor+person(323,285,1.5,'up')+`<path d="M0 0H640V95L390 149H250L0 95Z" fill="#4b5c40" stroke="${line}"/><path d="M0 95L250 149H390L640 95" fill="none" stroke="#d5ec8c" stroke-width="2"/><g stroke="${light}" stroke-width="3" fill="none"><path d="M165 118V161L155 149M165 161L175 149M475 118V161L465 149M475 161L485 149"/></g>`;
  // Each panel has one explicit framing; direction of traffic stays right to left.
  if(type==='taxi-slam')scene=`<rect width="640" height="360" fill="#1d2b21"/><path d="M-10-10H360L396 370H-10Z" fill="#617054" stroke="#bac8a8" stroke-width="3"/><path d="M38 0H304L320 108H38Z" fill="#17261d" stroke="#9eaf9a"/><path d="M366 0L401 360" stroke="#d5ec8c" stroke-width="4"/><path d="M280 155H337" stroke="#cbd6ba" stroke-width="8"/><path d="M640 84L497 126L435 173L379 179L354 163L359 142L391 152L422 139L470 92L640 30" fill="#8a9c76" stroke="#cfddbd" stroke-width="2"/><g transform="rotate(30 451 248)"><rect x="415" y="190" width="72" height="121" rx="8" fill="#101a13" stroke="#d5ec8c" stroke-width="3"/><rect x="423" y="201" width="56" height="94" fill="#627956"/></g><path d="M452 174L471 159M468 186L494 179M431 175L433 149M488 261L523 279" stroke="#d5ec8c" stroke-width="3"/>`;
  if(type==='phone-road')scene=`<rect width="640" height="360" fill="#1b2a21"/><path d="M0 120H640V360H0Z" fill="#3b4937"/><path d="M0 320L640 184" stroke="#b9c5a7" stroke-width="8"/><g transform="rotate(64 290 235)"><rect x="230" y="130" width="120" height="208" rx="12" fill="#101a13" stroke="#d5ec8c" stroke-width="4"/><rect x="240" y="144" width="100" height="176" fill="#59704e"/></g><path d="M80 271L177 251M115 288L198 271" stroke="#b3c69d" stroke-dasharray="6 8"/><ellipse cx="490" cy="91" rx="23" ry="15" fill="#d5ec8c" opacity=".7"/><ellipse cx="585" cy="91" rx="23" ry="15" fill="#d5ec8c" opacity=".7"/>${arrow(430,60)}`;
  if(type==='truck')scene=`<rect width="640" height="360" fill="#203025"/><path d="M380 0H640V229H380Z" fill="#526447" stroke="#aab99a"/><path d="M0 320H640V360H0Z" fill="#3b4a36"/><circle cx="520" cy="235" r="94" fill="#101b13" stroke="#aab99a" stroke-width="3"/><circle cx="520" cy="235" r="45" fill="#35482d" stroke="#8da37b"/><path d="M0 360V187Q44 146 96 163L202 227L160 310L135 360Z" fill="#172219" stroke="#bac5ac" stroke-width="2"/><ellipse cx="198" cy="153" rx="35" ry="43" transform="rotate(-35 198 153)" fill="#788a67" stroke="#bdc9ac" stroke-width="2"/><path d="M169 119Q191 82 221 112L235 143L208 128L179 150Z" fill="#111a13"/><path d="M130 217L239 259L288 310L335 313" fill="none" stroke="#9daf8b" stroke-width="21" stroke-linecap="round"/><rect x="321" y="317" width="56" height="17" rx="4" fill="#d5ec8c"/>${arrow(480,60)}`;
  if(type==='underpass-entry')scene=`<rect width="640" height="360" fill="#24362a"/><path d="M0 272H640V360H0Z" fill="#4a5840"/><path d="M0 326H640" stroke="#b4c49f" stroke-width="3" stroke-dasharray="70 34"/><path d="M276 178H510L580 274H235Z" fill="#101a14" stroke="#adbf99" stroke-width="2"/><g stroke="#829774" fill="none"><path d="M260 253H562M271 235H550M283 218H537M294 203H526M305 190H516"/><path d="M235 274V178L276 109H510L580 178V274M276 109V178M510 109V178" stroke-width="4"/></g>${person(178,235,1.2)}${rain}`;
  return `<svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label || 'Схема композиции кадра')}"><rect width="640" height="360" fill="#1f2b22"/>${scene}<path d="M16 30V16H30M610 16H624V30M16 330V344H30M610 344H624V330" stroke="#c2d1b1" opacity=".4" fill="none"/><path d="M0 342H640" stroke="#121b12" opacity=".5"/></svg>`;
}

function highlighted(text, query) {
  if (!query) return esc(text);
  const low = text.toLocaleLowerCase('ru'), needle = query.toLocaleLowerCase('ru');
  let result = '', offset = 0, pos;
  while ((pos = low.indexOf(needle, offset)) !== -1) {
    result += esc(text.slice(offset,pos)) + '<mark>' + esc(text.slice(pos,pos+query.length)) + '</mark>';
    offset = pos + query.length;
  }
  return result + esc(text.slice(offset));
}
function sceneName(scene) { return scene.title.replace(/^(ИНТ\.|ЭКСТ\.)\s*/, '').replace(/\.$/,'').toLocaleLowerCase('ru'); }
function renderScript(query = '') {
  const beats=window.PILOT_BEATS.map((text,index)=>({text,number:index+1})).filter(b=>b.text.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
  $('#search-result').textContent=query?`Найдено событий: ${beats.length}`:`1 эпизод · ${window.PILOT_BEATS.length} событий · ${currentEpisode.shots.length} кадров`;
  $('#scene-nav').innerHTML=beats.map(b=>`<a href="#script/beat-${b.number}"><span>${String(b.number).padStart(2,'0')}</span>${esc(b.text.slice(0,58))}…</a>`).join('');
  $('#script-content').innerHTML=`<section id="scene-12"><div class="script-title"><h3>ТАКСИ И ПОДЗЕМНЫЙ ПЕРЕХОД</h3><p>САЛОН ТАКСИ → ШОССЕ → ПЕРЕХОД. НОЧЬ, ЛИВЕНЬ.<br>Постановочная версия по сценам 12–14 и новым вводным · 08.11.2026. Начинаем с поездки после посадки и спора об адресе. Ответ Романа остаётся нераскрытым; продолжение включает первую ловушку и побег наверх. Плащ убран: она ехала на свидание в платье.</p></div>${beats.map(b=>`<section class="script-scene" id="beat-${b.number}"><span class="scene-number">СОБЫТИЕ ${String(b.number).padStart(2,'0')}</span><p>${highlighted(b.text,query)}</p></section>`).join('')||'<p class="no-results">Ничего не найдено.</p>'}</section>`;
}
function renderEpisodes() {
  $('#episode-list').innerHTML=episodes.map(ep=>`<article class="episode-card"><div class="episode-art"><div class="episode-art-header"><span class="episode-code">${ep.code}</span><span>ЭПИЗОД / ${ep.scenes}</span></div>${sketch(ep.shots[2].art,ep.title)}<div class="episode-art-footer"><span>~ ${ep.duration.toLocaleString('ru-RU')} СЕК</span><span>${ep.shots.length} КАДРОВ</span><span>16:9</span></div></div><div class="episode-copy"><span class="tag">${esc(ep.tag)}</span><h3>${esc(ep.title)}</h3><p>${esc(ep.logline)}</p><dl><dt>Почему он</dt><dd>${esc(ep.why)}</dd><dt>В работе</dt><dd>${esc(ep.challenge)}</dd></dl><div class="episode-actions"><a class="button-primary" href="#board/${ep.id}">Открыть кадры <span>↗</span></a><a href="#script/${ep.sourceScene}">Читать сцену →</a></div></div></article>`).join('');
}
const shotData=id=>gallery.shots[id] || {images:[],current:null};
const mediaUrl=path=>`${apiBase}/${path.replace(/^\//,'')}`;
function shotSourceMarkup(shot){
  return `<section class="shot-source" aria-label="Текст сценария для кадра ${shot.id}">${(shot.phases||[shot]).filter((p,i,all)=>all.findIndex(other=>other.step===p.step)===i).map(p=>`<div class="source-heading"><span class="source-label">Сценарий · рабочая постановочная версия</span><a href="#script/beat-${p.step}">Событие ${p.step} / ${window.PILOT_BEATS.length} ↗</a></div><blockquote><p>${esc(p.script)}</p></blockquote><small class="source-origin">${esc(p.sourceNote||shot.sourceNote||'')}</small>`).join('')}</section>`;
}
function phaseAt(shot,elapsed){
  const phases=shot.phases||[shot];let start=0;
  for(let index=0;index<phases.length;index++){
    const phase=phases[index],end=Math.round((start+phase.duration)*100)/100;
    if(elapsed<end||index===phases.length-1)return {phase,index,start};start=end;
  }
}
function dialogPhase(){const shot=currentEpisode.shots[currentShot];return shot.phases?.[currentPhase]||shot;}
function currentImage(shot){const record=shotData(shot.id);return imageMarkup(shot,record.images.find(v=>v.id===record.current));}
function boardImage(shot){
  if(!shot.phases)return currentImage(shot);
  let start=0;
  return `<span class="compound-pictures">${shot.phases.map(p=>{const from=start;start=Math.round((start+p.duration)*100)/100;return `<span class="phase-picture">${currentImage(p)}<span class="phase-caption">${p.label} · ${esc(p.size)} · ${from.toLocaleString('ru-RU')}–${start.toLocaleString('ru-RU')} с</span></span>`;}).join('')}</span>`;
}
function imageMarkup(shot, version) { return version ? `<img src="${esc(mediaUrl(version.thumbnail))}" alt="${esc(shot.id+' — '+shot.title)}" loading="lazy">` : sketch(shot.art,shot.title); }
function renderBoard() {
  $('#board-title').textContent=currentEpisode.title;
  $('#board-total').textContent=`${currentEpisode.shots.length} кадров / ~ ${currentEpisode.duration.toLocaleString('ru-RU')} сек`;
  $('#board-summary').textContent=currentEpisode.adaptation;
  $('#board-source').href=`#script/${currentEpisode.sourceScene}`;
  $('#episode-selector').innerHTML=episodes.map(ep=>`<button data-episode="${ep.id}" class="${ep.id===currentEpisode.id?'active':''}" aria-pressed="${ep.id===currentEpisode.id}"><span>${ep.code}</span>${esc(ep.title)}</button>`).join('');
  let time=0;
  $('#shot-grid').innerHTML=currentEpisode.shots.map((shot,index)=>{
    const start=time;time=Math.round((time+shot.duration)*100)/100;
    const record=shotData(shot.id), active=record.images.find(i=>i.id===record.current);
    return `${index===0||currentEpisode.shots[index-1].block!==shot.block?`<div class="sequence-block"><span>${esc(shot.block)}</span><small>${shot.block==='В такси'?'Надежда → удар → теснота':shot.block==='На шоссе'?'Гнев → потеря → опасность':shot.block==='В переходе'?'Стены сходятся → паника → побег':'Нет связи → нет пути поверху → спуск'}</small></div>`:''}<article class="shot-card ${shot.phases?'compound-shot':''}" data-shot="${shot.id}" style="--phase-count:${shot.phases?.length||1}"><button class="shot-image" data-open-shot="${index}" aria-label="Открыть кадр ${shot.id}: ${esc(shot.title)}">${boardImage(shot)}<span class="shot-id">${shot.id}</span><span class="shot-expand">↗</span></button><div class="shot-body"><div class="shot-meta"><span>${start.toLocaleString('ru-RU')}–${time.toLocaleString('ru-RU')} СЕК</span><span>${esc(shot.size.toUpperCase())}</span></div><h3>${esc(shot.title)}</h3>${shot.phases?`<p class="continuous-note">ОДИН КАДР · ${shot.phases.length===3?'ТРИ':'ДВЕ'} ФАЗЫ · БЕЗ СКЛЕЙКИ</p>`:''}<p class="shot-purpose"><span>ЗАДАЧА</span> ${esc(shot.purpose)}</p>${shotSourceMarkup(shot)}<details class="shot-staging"><summary>Постановка, камера и звук</summary><p>${esc(shot.action)}</p><dl><dt>Крупность</dt><dd>${esc(shot.size)}</dd><dt>Камера</dt><dd>${esc(shot.camera)}</dd><dt>Звук</dt><dd>${esc(shot.sound)}</dd></dl></details></div><div class="shot-actions">${shot.phases?shot.phases.map((p,i)=>`<div class="phase-action"><button data-open-phase="${i}" data-shot-index="${index}">${p.label} · версии: ${shotData(p.id).images.length}</button><button data-upload="${p.id}">+ Загрузить фазу ${i+1}</button></div>`).join(''):`<span class="version-count">${record.images.length ? `ВЕРСИЙ: ${record.images.length}` : 'СХЕМА · НЕТ ЗАГРУЗОК'}</span><button data-upload="${shot.id}">+ Загрузить</button>`}</div></article>`;
  }).join('');
  renderTimeline();
}
function route() {
  const [view='script',id] = location.hash.slice(1).split('/');
  const valid = ['script','episodes','board','assets'].includes(view) ? view : 'script';
  const changedView = lastView !== valid; lastView = valid;
  document.body.classList.toggle('board-open',valid==='board');
  pauseAnimatic();
  if(valid!=='board')for(const dialog of [$('#shot-dialog'),$('#animatic-dialog')])if(dialog.open)dialog.close();
  $$('.view').forEach(el=>{el.hidden=el.id!==`view-${valid}`;});
  $$('.main-nav a').forEach(a=>{a.classList.toggle('active',a.dataset.view===valid);if(a.dataset.view===valid)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  if(valid!=='assets' && $('#asset-dialog').open)$('#asset-dialog').close();
  if(valid==='assets'){renderAssets();refreshGallery();}
  if(valid==='board') { currentEpisode=episodes.find(e=>e.id===id)||episodes[0];renderBoard();refreshGallery(); }
  if(changedView && valid!=='script')requestAnimationFrame(()=>$('#main').scrollIntoView({behavior:'instant'}));
  if(valid==='script'&&id&&screenplay){
    $('#script-search').value='';renderScript();
    $$('#scene-nav a').forEach(a=>a.classList.toggle('active',a.hash===`#script/${id}`));
    requestAnimationFrame(()=>document.getElementById(id.startsWith('beat-')?id:`scene-${id}`)?.scrollIntoView({behavior:'instant'}));
  }
}
function timecode(seconds){const ticks=Math.floor((seconds+1e-8)*10),whole=Math.floor(ticks/10);return `${String(Math.floor(whole/60)).padStart(2,'0')}:${String(whole%60).padStart(2,'0')}${ticks%10?','+ticks%10:''}`;}
function shotAt(time){let start=0;for(let i=0;i<currentEpisode.shots.length;i++){const shot=currentEpisode.shots[i];if(time<start+shot.duration||i===currentEpisode.shots.length-1)return{shot,index:i,start};start=Math.round((start+shot.duration)*100)/100;}}
function renderTimeline(){
  if(animatic.episode!==currentEpisode.id){pauseAnimatic();animatic.time=0;animatic.episode=currentEpisode.id;animatic.shown=null;}
  $('#timeline-episode').textContent=currentEpisode.title;
  $('#animatic-title').textContent=`АНИМАТИК / ${currentEpisode.title}`;
  const total=currentEpisode.duration;
  for(const range of [$('#dock-seek'),$('#player-seek')])range.max=total;
  let start=0;
  const strip=currentEpisode.shots.map(shot=>{
    const pos=start;start=Math.round((start+shot.duration)*100)/100;const record=shotData(shot.id),version=record.images.find(v=>v.id===record.current);
    return `<button class="timeline-clip" data-time="${pos}" data-clip-id="${shot.id}" style="flex:${shot.duration}" aria-label="${shot.id}: ${esc(shot.title)}, с ${pos} секунды, ${shot.duration} секунд"><span class="clip-picture">${boardImage(shot)}</span><span class="clip-label">${shot.id}${shot.phases?' · '+shot.phases.length+' фазы':''}<span>${shot.duration}с</span></span></button>`;
  }).join('');
  $('#dock-strip').innerHTML=strip;$('#player-strip').innerHTML=strip;updateAnimatic(true);
}
function updateAnimatic(force=false){
  const total=currentEpisode.duration,{shot,start}=shotAt(animatic.time),{phase,index:phaseIndex}=phaseAt(shot,Math.round((animatic.time-start)*1000)/1000),record=shotData(phase.id),version=record.images.find(v=>v.id===record.current);
  const clock=`${timecode(animatic.time)} / ${timecode(total)}`;
  $('#dock-time').textContent=clock;$('#player-time').textContent=clock;
  for(const range of [$('#dock-seek'),$('#player-seek')]){range.value=animatic.time;range.style.setProperty('--progress',`${animatic.time/total*100}%`);range.setAttribute('aria-valuetext',`${timecode(animatic.time)}, кадр ${shot.id}`);}
  $$('.timeline-clip').forEach(button=>{const active=button.dataset.clipId===shot.id;button.classList.toggle('current',active);button.setAttribute('aria-pressed',String(active));});
  $('#animatic-play').textContent=animatic.playing?'Ⅱ':'▶';$('#animatic-play').setAttribute('aria-label',animatic.playing?'Пауза':'Воспроизвести');
  window.KinoTimeline?.update(animatic.time);
  const key=shot.id+':'+phase.id+':'+(version?.id||'scheme');
  if(force||animatic.shown!==key){
    $('#animatic-stage').innerHTML=imageMarkup(phase,version);
    $('#animatic-shot-title').textContent=`${shot.id} / ${shot.title}${shot.phases?' · ФАЗА '+(phaseIndex+1)+'/'+shot.phases.length+' · ОДИН КАДР':''}`;
    $('#animatic-shot-size').textContent=`${phase.size} · ${shot.duration} сек${shot.phases?' · опорная фаза без склейки':''}`;
    animatic.shown=key;
  }
}
function pauseAnimatic(){
  animatic.generation++;animatic.loading=false;animatic.playing=false;window.KinoTimeline?.stop();
  if(animatic.frame!==null)cancelAnimationFrame(animatic.frame);animatic.frame=null;
  if($('#animatic-play')){$('#animatic-play').textContent='▶';$('#animatic-play').setAttribute('aria-label','Воспроизвести');}
}
async function playAnimatic(){
  if(animatic.playing||animatic.loading)return;
  const total=currentEpisode.duration;if(animatic.time>=total)animatic.time=0;
  const generation=++animatic.generation;animatic.loading=true;$('#animatic-play').textContent='…';
  if(!window.KinoTimeline){animatic.loading=false;$('#animatic-play').textContent='▶';$$('[data-sound-status]').forEach(el=>el.textContent=window.KinoTimelineError||'Шумы загружаются. Нажмите ▶ ещё раз.');return;}
  const ready=await window.KinoTimeline.start(animatic.time);
  if(generation!==animatic.generation)return;
  animatic.loading=false;if(!ready){$('#animatic-play').textContent='▶';return;}
  animatic.playing=true;
  function step(){
    if(!animatic.playing)return;
    animatic.time=Math.min(total,window.KinoTimeline.position());
    if(animatic.time>=total)pauseAnimatic();
    updateAnimatic();if(animatic.playing)animatic.frame=requestAnimationFrame(step);
  }
  updateAnimatic();animatic.frame=requestAnimationFrame(step);
}
function openAnimatic(play=true){if(!$('#animatic-dialog').open)$('#animatic-dialog').showModal();window.KinoTimeline?.render();updateAnimatic(true);if(play)playAnimatic();}
function seekAnimatic(time){
  const resume=animatic.playing||animatic.loading;pauseAnimatic();
  animatic.time=Math.max(0,Math.min(currentEpisode.duration,Math.round(Number(time)*100)/100));updateAnimatic();if(resume)playAnimatic();
}
function openShot(index, keepVersion=false, phaseIndex=null) {
  currentShot=Math.max(0,Math.min(currentEpisode.shots.length-1,index));
  const shot=currentEpisode.shots[currentShot];
  if(phaseIndex!==null)currentPhase=phaseIndex;else if(!keepVersion)currentPhase=0;
  const phase=dialogPhase(),record=shotData(phase.id);
  if(!keepVersion)selectedVersion=record.current;
  const version=record.images.find(i=>i.id===selectedVersion);
  $('#dialog-counter').textContent=`${shot.id} / ${currentEpisode.title} / ${currentShot+1} ИЗ ${currentEpisode.shots.length}`;
  $('#dialog-phases').innerHTML=shot.phases?`<span>ОДИН КАДР · БЕЗ СКЛЕЙКИ</span>`+shot.phases.map((p,i)=>`<button data-open-phase="${i}" data-shot-index="${currentShot}" aria-pressed="${i===currentPhase}">${p.label} · ${esc(p.title)} · ${p.duration} с</button>`).join(''):'';
  $('#dialog-phases').hidden=!shot.phases;
  $('#dialog-image').innerHTML=imageMarkup(phase,version);
  $('#dialog-title').textContent=shot.title;
  $('#dialog-action').textContent=shot.action;
  $('#dialog-script').innerHTML=shotSourceMarkup(shot);
  $('#dialog-details').innerHTML=`<dt>Крупность</dt><dd>${esc(shot.size)}</dd><dt>Камера</dt><dd>${esc(shot.camera)}</dd><dt>Звук</dt><dd>${esc(shot.sound)}</dd><dt>Задача кадра</dt><dd>${esc(shot.purpose)}</dd><dt>Длительность</dt><dd>~ ${shot.duration} сек</dd>`;
  $('#dialog-versions').innerHTML=`<button class="scheme-version ${!version?'selected':''}" data-version="" aria-label="Показать схему">Схема</button>`+record.images.map((v,i)=>`<button class="${v.id===selectedVersion?'selected':''}" data-version="${v.id}" aria-label="Версия ${i+1}, ${esc(v.author)}"><img src="${esc(mediaUrl(v.thumbnail))}" alt="Версия ${i+1}"></button>`).join('');
  $('#dialog-version-info').innerHTML=version ? `${esc(version.author)} · ${new Date(version.createdAt).toLocaleString('ru-RU')} · ${version.width} × ${version.height}${version.note?'<br>'+esc(version.note):''}<br><a href="${esc(mediaUrl(version.original))}" target="_blank" rel="noopener">Открыть оригинал ↗</a> ${record.current===version.id?'<span> · Основной кадр</span>':`<button id="make-current" ${session?'':'hidden'}>Сделать основным</button>`}` : 'Композиционная схема. Загрузите рисунок или референс через кнопку на карточке.';
  $('#dialog-prev').disabled=currentShot===0;$('#dialog-next').disabled=currentShot===currentEpisode.shots.length-1;
  if(!$('#shot-dialog').open)$('#shot-dialog').showModal();
}
async function request(path,options={}) {
  const headers={...options.headers};
  if(session)headers.Authorization=`Bearer ${session.token}`;
  const response=await fetch(`${apiBase}${path}`,{...options,headers,cache:'no-store',signal:AbortSignal.timeout(options.body instanceof File?120000:20000)});
  const data=await response.json().catch(()=>({error:'Сервер вернул непонятный ответ'}));
  if(!response.ok){
    if(response.status===401){session=null;sessionStorage.removeItem('kino-session');updateTeam();}
    throw new Error(data.error || `Ошибка сервера ${response.status}`);
  }
  return data;
}
async function refreshGallery() {
  if(galleryRequest)return;
  galleryRequest=true;
  try {
    const data=await request('/gallery');
    window.KinoTimeline?.receive(data.sequenceTimeline);
    if(data.revision!==gallery.revision){gallery=data;if(!$('#view-board').hidden)renderBoard();if($('#shot-dialog').open)openShot(currentShot,true);if(!$('#view-assets').hidden)renderAssets();if($('#asset-dialog').open)openAsset(currentAsset,true);}
    $('#sync-status').textContent='● Общая доска подключена · обновление каждые 15 с';
  } catch { $('#sync-status').textContent='Нет связи с сервером · загрузка временно недоступна'; }
  finally{$('#asset-sync').textContent=$('#sync-status').textContent;galleryRequest=false;}
}
function updateTeam(){
  $('#assets-login').textContent=session?`${session.name} · выйти`:'Войти в команду';
  $('#team-login').textContent=session?`${session.name} · выйти`:'Войти в команду';
  $('#team-message').textContent=session?'Перетащите изображение на кадр или нажмите «Загрузить». Версии видит вся команда.':'Для загрузки изображений и сохранения монтажа войдите по коду проекта. Просмотр открыт по ссылке.';
}
function showLogin(){
  $('#login-message').textContent='';$('#team-code').value='';
  try{$('#team-name').value=localStorage.getItem('kino-name')||'';}catch{}
  $('#login-dialog').showModal();
}
function startUpload(id,files=null){
  if(!session){pendingUpload={id,files};showLogin();return;}
  uploadTarget=id;$('#upload-form').reset();$('#upload-message').textContent='';$('#upload-message').classList.remove('error');
  $('#upload-shot-label').textContent=`${uploadPath(id)==='assets'?'АССЕТ '+assets.find(a=>a.id===id).title:'КАДР '+id} / ${session.name}`;
  if(files){const dt=new DataTransfer();[...files].forEach(f=>dt.items.add(f));$('#upload-files').files=dt.files;}
  $('#upload-dialog').showModal();
}
document.addEventListener('click', async event=>{
  const asset=event.target.closest('[data-open-asset]');if(asset)openAsset(asset.dataset.openAsset);
  const filter=event.target.closest('[data-asset-filter]');if(filter){assetFilter=filter.dataset.assetFilter;renderAssets();}
  const av=event.target.closest('[data-asset-version]');if(av){assetVersion=av.dataset.assetVersion;openAsset(currentAsset,true);}
  if(event.target.closest('#asset-dialog-upload'))startUpload(currentAsset);
  if(event.target.closest('#asset-make-current')){
    const button=$('#asset-make-current');button.disabled=true;
    try{await request(`/assets/${currentAsset}/current`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:assetVersion})});await refreshGallery();}
    catch(error){button.disabled=false;$('#asset-version-info').append(document.createTextNode(' · '+error.message));}
  }
  const close=event.target.closest('[data-close]');if(close)document.getElementById(close.dataset.close).close();
  const ep=event.target.closest('[data-episode]');if(ep)location.hash=`board/${ep.dataset.episode}`;
  const phaseButton=event.target.closest('[data-open-phase]');if(phaseButton)openShot(Number(phaseButton.dataset.shotIndex),false,Number(phaseButton.dataset.openPhase));
  const shot=event.target.closest('[data-open-shot]');if(shot)openShot(Number(shot.dataset.openShot));
  const upload=event.target.closest('[data-upload]');if(upload)startUpload(upload.dataset.upload);
  const version=event.target.closest('[data-version]');if(version){selectedVersion=version.dataset.version||null;openShot(currentShot,true);}
  if(event.target.closest('[data-animatic-open]'))openAnimatic();
  if(event.target.closest('[data-edit-open]'))openAnimatic(false);
  const clip=event.target.closest('[data-time]');if(clip){seekAnimatic(clip.dataset.time);if(!$('#animatic-dialog').open)openAnimatic(false);}
  if(event.target.closest('#make-current')){
    const button=$('#make-current');button.disabled=true;
    try{await request(`/shots/${dialogPhase().id}/current`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:selectedVersion})});await refreshGallery();}
    catch(error){button.disabled=false;button.textContent=error.message;}
  }
});
for(const loginButton of [$('#team-login'),$('#assets-login')])loginButton.addEventListener('click',()=>{if(session){session=null;sessionStorage.removeItem('kino-session');updateTeam();}else showLogin();});
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('button[type=submit]',event.target);button.disabled=true;
  $('#login-message').textContent='Подключение…';$('#login-message').classList.remove('error');
  try{
    session=await request('/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('#team-name').value.trim(),code:$('#team-code').value})});
    sessionStorage.setItem('kino-session',JSON.stringify(session));try{localStorage.setItem('kino-name',session.name);}catch{}
    $('#team-code').value='';$('#login-dialog').close();updateTeam();
    if(pendingUpload){const p=pendingUpload;pendingUpload=null;startUpload(p.id,p.files);}
  }catch(error){$('#login-message').textContent=error.message;$('#login-message').classList.add('error');}
  finally{button.disabled=false;}
});
$('#upload-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('button[type=submit]',event.target),files=[...$('#upload-files').files],note=$('#upload-note').value.trim();
  const invalid=files.find(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>15*1024*1024);
  $('#upload-message').classList.remove('error');
  if(invalid){$('#upload-message').textContent=`${invalid.name}: нужен JPG, PNG или WebP до 15 МБ.`;$('#upload-message').classList.add('error');return;}
  button.disabled=true;let completed=0;
  try{
    for(const file of files){$('#upload-message').textContent=`Загружаю ${completed+1} из ${files.length}…`;await request(`/${uploadPath(uploadTarget)}/${uploadTarget}/images`,{method:'POST',headers:{'Content-Type':file.type,'X-File-Name':encodeURIComponent(file.name),'X-Image-Note':encodeURIComponent(note)},body:file});completed++;}
    $('#upload-dialog').close();await refreshGallery();
  }catch(error){$('#upload-message').textContent=`${completed?`Сохранено ${completed} из ${files.length}. `:''}${error.message}`;$('#upload-message').classList.add('error');const dt=new DataTransfer();files.slice(completed).forEach(f=>dt.items.add(f));$('#upload-files').files=dt.files;await refreshGallery();}
  finally{button.disabled=false;}
});
$('#shot-grid').addEventListener('dragover',event=>{const card=event.target.closest('[data-shot]');if(card){event.preventDefault();card.classList.add('upload-drag');}});
$('#shot-grid').addEventListener('dragleave',event=>{const card=event.target.closest('[data-shot]');if(card&&!card.contains(event.relatedTarget))card.classList.remove('upload-drag');});
$('#shot-grid').addEventListener('drop',event=>{const card=event.target.closest('[data-shot]');if(card){event.preventDefault();card.classList.remove('upload-drag');if(event.dataTransfer.files.length)startUpload(card.dataset.shot,event.dataTransfer.files);}});
$('#dialog-close').addEventListener('click',()=>$('#shot-dialog').close());
$('#dialog-prev').addEventListener('click',()=>openShot(currentShot-1));$('#dialog-next').addEventListener('click',()=>openShot(currentShot+1));
$('#shot-dialog').addEventListener('keydown',event=>{if(event.key==='ArrowLeft')openShot(currentShot-1);if(event.key==='ArrowRight')openShot(currentShot+1);});
$$('dialog').forEach(d=>d.addEventListener('click',event=>{if(event.target===d){const r=d.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)d.close();}}));
$('#script-search').addEventListener('input',event=>{if(screenplay)renderScript(event.target.value.trim());});
$('#print-board').addEventListener('click',()=>window.print());
$('#animatic-play').addEventListener('click',()=>{if(animatic.playing||animatic.loading)pauseAnimatic();else playAnimatic();});
$('#animatic-restart').addEventListener('click',()=>seekAnimatic(0));
for(const range of [$('#dock-seek'),$('#player-seek')])range.addEventListener('input',event=>seekAnimatic(event.target.value));
$('#animatic-dialog').addEventListener('close',pauseAnimatic);
$('#animatic-dialog').addEventListener('keydown',event=>{
  if(event.target.matches('input,select,textarea')||event.target.closest('#timeline-editor'))return;
  if(event.code==='Space'){event.preventDefault();if(animatic.playing||animatic.loading)pauseAnimatic();else playAnimatic();}
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const current=shotAt(animatic.time),target=event.key==='ArrowLeft'?Math.max(0,current.index-1):Math.min(currentEpisode.shots.length-1,current.index+1);seekAnimatic(currentEpisode.shots.slice(0,target).reduce((sum,s)=>sum+s.duration,0));}
});
window.addEventListener('hashchange',route);
$('#hero-sketch').innerHTML=sketch('pilot-exit');screenplay=true;renderScript();renderEpisodes();updateTeam();route();
setInterval(()=>{if(!document.hidden&&(!$('#view-board').hidden||!$('#view-assets').hidden))refreshGallery();},15000);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseAnimatic();else if((!$('#view-board').hidden||!$('#view-assets').hidden))refreshGallery();});

function assetImage(asset,version){
  return version?`<img src="${esc(mediaUrl(version.thumbnail))}" alt="${esc(asset.title)} — референс" loading="lazy">`:`<span class="asset-placeholder"><span>${esc(asset.code)}</span><strong>${esc(asset.title)}</strong><small>Референсы ещё не загружены</small></span>`;
}
function renderAssets(){
  $('#asset-filters').innerHTML=['Все',...new Set(assets.map(a=>a.category))].map(c=>`<button data-asset-filter="${esc(c)}" class="${assetFilter===c?'active':''}" aria-pressed="${assetFilter===c}">${esc(c)}</button>`).join('');
  $('#asset-grid').innerHTML=assets.filter(a=>assetFilter==='Все'||a.category===assetFilter).map(a=>{
    const record=assetData(a.id),version=record.images.find(v=>v.id===record.current);
    const links=a.shots.map(id=>{const ep=episodes.find(e=>e.shots.some(s=>s.id===id));return `<a href="#board/${ep.id}" data-linked-shot="${id}">${id}</a>`;}).join('');
    return `${index===0||currentEpisode.shots[index-1].block!==shot.block?`<div class="sequence-block"><span>${esc(shot.block)}</span><small>${shot.block==='В такси'?'Надежда → удар → теснота':shot.block==='На шоссе'?'Гнев → потеря → опасность':shot.block==='В переходе'?'Стены сходятся → паника → побег':'Нет связи → нет пути поверху → спуск'}</small></div>`:''}<article class="shot-card" data-asset="${a.id}"><button class="shot-image asset-image" data-open-asset="${a.id}" aria-label="Открыть ассет: ${esc(a.title)}">${assetImage(a,version)}</button><div class="shot-body"><div class="shot-meta"><span>${esc(a.category)}</span><span>ДИЗАЙН НЕ УТВЕРЖДЁН</span></div><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p><span class="source-label">Задание на разработку</span><p>${esc(a.brief)}</p><div class="asset-shot-links"><span>В кадрах</span>${links}</div><a class="asset-source" href="#script/${a.scene}">Сценарий · сцена ${a.scene} ↗</a></div><div class="shot-actions"><button data-open-asset="${a.id}">Референсы: ${record.images.length}</button><button data-upload="${a.id}">+ Загрузить</button></div></article>`;
  }).join('');
}
function openAsset(id,keepVersion=false){
  currentAsset=id;const asset=assets.find(a=>a.id===id),record=assetData(id);
  if(!keepVersion)assetVersion=record.current;
  const version=record.images.find(v=>v.id===assetVersion);
  $('#asset-dialog-code').textContent=asset.code;
  $('#asset-dialog-title').textContent=asset.title;
  $('#asset-dialog-description').textContent=asset.description;
  $('#asset-dialog-brief').textContent=asset.brief;
  $('#asset-dialog-image').innerHTML=assetImage(asset,version);
  $('#asset-versions').innerHTML=record.images.map((v,i)=>`<button data-asset-version="${v.id}" class="${v.id===assetVersion?'selected':''}" aria-label="Референс ${i+1}, ${esc(v.author)}"><img src="${esc(mediaUrl(v.thumbnail))}" alt="Референс ${i+1}"></button>`).join('');
  $('#asset-version-info').innerHTML=version?`${esc(version.author)} · ${new Date(version.createdAt).toLocaleString('ru-RU')} · ${version.width} × ${version.height}<br>${esc(version.note||'')}<br><a href="${esc(mediaUrl(version.original))}" target="_blank" rel="noopener">Открыть оригинал ↗</a> ${record.current===version.id?' · Основной референс':`<button id="asset-make-current" ${session?'':'hidden'}>Сделать основным</button>`}`:'Добавьте портреты, рисунки или фотографии. Галерея общая для команды.';
  if(!$('#asset-dialog').open)$('#asset-dialog').showModal();
}
for(const type of ['dragover','dragleave','drop'])$('#asset-grid').addEventListener(type,event=>{
  const card=event.target.closest('[data-asset]');if(!card)return;
  if(type==='dragover'){event.preventDefault();card.classList.add('upload-drag');}
  else if(type==='dragleave'){if(!card.contains(event.relatedTarget))card.classList.remove('upload-drag');}
  else{event.preventDefault();card.classList.remove('upload-drag');if(event.dataTransfer.files.length)startUpload(card.dataset.asset,event.dataTransfer.files);}
});
document.addEventListener('click',event=>{
  const link=event.target.closest('[data-linked-shot]');if(!link)return;
  event.preventDefault();location.hash=link.hash;
  // Route synchronously so the linked frame can be focused even when the hash is unchanged.
  route();const index=currentEpisode.shots.findIndex(s=>s.id===link.dataset.linkedShot);if(index>=0)openShot(index);
});
