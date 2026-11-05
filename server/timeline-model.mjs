export const round = n => Math.round(n * 100) / 100;
export const shotIds = ['T01','T03','T04','T05','T07','T08','T09','T10','T11','T12','T13','T15'];
export const phaseIds = {T01:['T01','T02'],T05:['T05','T06'],T13:['T13','T14']};
export const totalDuration = state => round(state.shots.reduce((n,s)=>n+s.duration,0));
export function shotStart(state,id){let t=0;for(const s of state.shots){if(s.id===id)return round(t);t+=s.duration;}return 0;}
export function defaultTimeline(episode){
  const clip=(id,source,start,duration,track,gain=1,offset=0)=>({id,source,start,duration,offset,track,gain,muted:false});
  return {schema:1,shots:episode.shots.map(s=>({id:s.id,duration:s.duration,...(s.phases?{phases:s.phases.map(p=>({id:p.id,duration:p.duration}))}:{})})),sounds:[
    clip('rain-bed','rain',0,19.3,0,.8),
    clip('exit-steps','steps',.25,1.6,1,.65),
    clip('door-slam','door',2.55,.46,1),
    clip('phone-drop','phone',4.12,.55,1,.9),
    clip('walk-steps','steps',6.2,1.4,1,.7,1.5),
    clip('horn-warning','horn-long',8.65,5.15,3,.65),
    clip('truck-pass','truck',9.15,6.94,2,.9),
    clip('jump-splash','steps',11.55,.6,1,.85,3.7)
  ]};
}
export function validateTimeline(state,library){
  const fail=()=>{throw new Error('Некорректные параметры монтажа');};
  const num=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
  if(!state||state.schema!==1||!Array.isArray(state.shots)||state.shots.length!==shotIds.length||!Array.isArray(state.sounds)||state.sounds.length>80)fail();
  const shots=state.shots.map((s,i)=>{
    if(s.id!==shotIds[i]||!num(s.duration,.2,30))fail();
    const shot={id:s.id,duration:round(s.duration)},ids=phaseIds[s.id];
    if(ids){
      if(!Array.isArray(s.phases)||s.phases.length!==ids.length)fail();
      shot.phases=s.phases.map((p,j)=>{if(p.id!==ids[j]||!num(p.duration,.1,30))fail();return {id:p.id,duration:round(p.duration)};});
      if(Math.abs(shot.phases.reduce((n,p)=>n+p.duration,0)-shot.duration)>.011)fail();
    }
    return shot;
  });
  const total=totalDuration({shots});if(total>300)fail();
  const seen=new Set();
  const sounds=state.sounds.map(c=>{
    const source=library.find(s=>s.id===c.source);
    if(typeof c.id!=='string'||!/^[a-z0-9-]{1,64}$/.test(c.id)||seen.has(c.id)||!source||!num(c.start,0,total)||!num(c.duration,.05,total)||c.start+c.duration>total+.011||!num(c.offset,0,source.duration)||!num(c.gain,0,2)||!Number.isInteger(c.track)||c.track<0||c.track>3||typeof c.muted!=='boolean')fail();
    if(!source.loop&&c.offset+c.duration>source.duration+.011)fail();
    seen.add(c.id);return {id:c.id,source:c.source,start:round(c.start),duration:round(c.duration),offset:round(c.offset),gain:round(c.gain),track:c.track,muted:c.muted};
  });
  return {schema:1,shots,sounds};
}
export function resizeShot(state,id,duration,ripple=true){
  const s=state.shots.find(s=>s.id===id),oldEnd=round(shotStart(state,id)+s.duration),oldTotal=totalDuration(state);
  duration=round(Math.min(30,Math.max(.2,duration)));const delta=round(duration-s.duration);
  if(oldTotal+delta>300)throw new Error('Максимальная длительность сцены — 300 с');
  if(s.phases){
    const first=round(Math.max(.1,Math.min(duration-.1,s.phases[0].duration/s.duration*duration)));
    s.phases[0].duration=first;s.phases[1].duration=round(duration-first);
  }
  s.duration=duration;
  for(const c of state.sounds){
    if(c.id==='rain-bed'&&c.start===0&&Math.abs(c.duration-oldTotal)<.02)c.duration=round(oldTotal+delta);
    else if(ripple&&c.start>=oldEnd-.001)c.start=round(Math.max(0,c.start+delta));
  }
  const end=totalDuration(state);
  state.sounds=state.sounds.filter(c=>c.start<end-.049);
  for(const c of state.sounds)c.duration=round(Math.min(c.duration,end-c.start));
  return state;
}
