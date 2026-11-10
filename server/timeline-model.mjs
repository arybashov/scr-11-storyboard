export const round = n => Math.round(n * 100) / 100;
export const shotIds = ['T01','T03','T04','T05','T07','T08','T09','T10','T11','T12','T13','T15'];
export const entryShotIds = ['I01','I02','I03','I04','I05','I06','I07','I08','I09',...shotIds,'U01','U02','U03','U04','U05'];
export const sequenceShotIds = [...entryShotIds,'U06','U07','U08','U09','U10','U11','U12','U13'];
// The shorter editorial cut keeps the original IDs and all gallery versions.
export const rhythmShotIds = sequenceShotIds.filter(id=>!['I07','I09','U02','U03'].includes(id));
export const subjectiveShotIds = rhythmShotIds.filter(id=>!['I01','I02','I05','I06','U06','U10'].includes(id));
export const phaseIds = {T01:['T01','T02'],T05:['T05','T06'],T13:['T13','T14']};
export const totalDuration = state => round(state.shots.reduce((n,s)=>n+s.duration,0));
export function shotStart(state,id){let t=0;for(const s of state.shots){if(s.id===id)return round(t);t+=s.duration;}return 0;}
export function defaultTimeline(episode){
  const clip=(id,source,start,duration,track,gain=1,offset=0)=>({id,source,start,duration,offset,track,gain,muted:false});
  if(episode.timelineSchema===2){
    const shots=episode.shots.map(s=>({id:s.id,duration:s.duration,...(s.phases?{phases:s.phases.map(p=>({id:p.id,duration:p.duration}))}:{})}));
    const at=id=>shotStart({shots},id),total=totalDuration({shots}),outside=at('T01'),stairs=at('U05');
    const approach=shots.find(s=>s.id==='U03')||shots.find(s=>s.id==='U04');
    return withUnderpassSounds({schema:2,shots,sounds:[
      clip('rain-cabin','rain',0,outside,0,.16),
      clip('rain-bed','rain',outside,round(stairs-outside),0,.8),
      clip('rain-stairs','rain',stairs,round((shots.some(s=>s.id==='U06')?at('U06'):shots.some(s=>s.id==='U07')?at('U07'):total)-stairs),0,.2),
      clip('exit-steps','steps',round(outside+.2),1.6,1,.65),
      clip('door-slam','door',round(outside+3.65),.46,1),
      clip('phone-drop','phone',at('T03'),.55,1,.9),
      clip('walk-steps','steps',round(at('T05')+.6),1.4,1,.7,1.5),
      clip('horn-warning','horn-long',round(at('T07')+.65),4.15,3,.65),
      clip('truck-pass','truck',at('T07'),5.3,2,.9),
      clip('jump-splash','steps',at('T10'),.6,1,.85,3.7),
      clip('to-stairs','steps',at(approach.id),approach.duration,1,.6),
      clip('down-stairs','steps',at('U05'),shots.find(s=>s.id==='U05').duration,1,.6)
    ]});
  }
  return {schema:1,shots:episode.shots.map(s=>({id:s.id,duration:s.duration,...(s.phases?{phases:s.phases.map(p=>({id:p.id,duration:p.duration}))}:{})})),sounds:[
    clip('rain-bed','rain',0,20.2,0,.8),
    clip('exit-steps','steps',.25,1.6,1,.65),
    clip('door-slam','door',2.55,.46,1),
    clip('phone-drop','phone',3.45,.55,1,.9),
    clip('walk-steps','steps',7.1,1.4,1,.7,1.5),
    clip('horn-warning','horn-long',9.55,5.15,3,.65),
    clip('truck-pass','truck',10.05,6.94,2,.9),
    clip('jump-splash','steps',12.45,.6,1,.85,3.7)
  ]};
}
export function validateTimeline(state,library){
  const fail=()=>{throw new Error('Некорректные параметры монтажа');};
  const num=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
  const expectedIds=state?.schema===2?([entryShotIds,rhythmShotIds,subjectiveShotIds,sequenceShotIds].find(ids=>ids.length===state.shots?.length)||sequenceShotIds):shotIds;
  if(!state||![1,2].includes(state.schema)||!Array.isArray(state.shots)||state.shots.length!==expectedIds.length||!Array.isArray(state.sounds)||state.sounds.length>80)fail();
  const shots=state.shots.map((s,i)=>{
    if(s.id!==expectedIds[i]||!num(s.duration,.2,30))fail();
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
  return {schema:state.schema,shots,sounds};
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
    else if(ripple&&state.schema===2&&c.source==='rain'&&c.start<oldEnd-.001&&c.start+c.duration>=oldEnd-.001)c.duration=round(Math.max(.05,c.duration+delta));
    else if(ripple&&c.start>=oldEnd-.001)c.start=round(Math.max(0,c.start+delta));
  }
  const end=totalDuration(state);
  state.sounds=state.sounds.filter(c=>c.start<end-.049);
  for(const c of state.sounds)c.duration=round(Math.min(c.duration,end-c.start));
  return state;
}

function withUnderpassSounds(state){
 if(!state.shots.some(s=>s.id==='U07'))return state;
 const subjective=!state.shots.some(s=>s.id==='U06');
 const at=id=>shotStart(state,id),total=totalDuration(state),emerge=round(at('U12')+Math.min(1.2,state.shots.find(s=>s.id==='U12').duration));
 const clip=(id,source,start,duration,track,gain)=>({id,source,start:round(start),duration:round(duration),offset:0,track,gain,muted:false});
 const additions=[
  clip('underpass-rain-distant','rain',at(subjective?'U07':'U06'),emerge-at(subjective?'U07':'U06'),0,subjective?.05:.15),
  clip('underpass-rain-return','rain',emerge,total-emerge,0,.8),
  ...(!subjective?[clip('underpass-walk','steps',at('U06'),Math.min(2.1,state.shots.find(s=>s.id==='U06').duration),1,.55)]:[]),
  clip('underpass-run','steps',at(subjective?'U11':'U10'),at('U12')-at(subjective?'U11':'U10'),1,.8),
  clip('underpass-climb','steps',at('U12'),Math.min(1.7,state.shots.find(s=>s.id==='U12').duration),1,.85)
 ];
 for(const c of additions)if(!state.sounds.some(s=>s.id===c.id))state.sounds.push(c);
 return state;
}
// Append the continuation without resetting any of the team's existing trims or sounds.
export function extendSequence(state,episode){
 if(state.schema!==2)return state;
 if([sequenceShotIds.length,rhythmShotIds.length,subjectiveShotIds.length].includes(state.shots.length))return structuredClone(state);
 if(state.shots.length!==entryShotIds.length||state.shots.some((s,i)=>s.id!==entryShotIds[i]))throw new Error('Неизвестная версия монтажа');
 const next=structuredClone(state);
 for(const id of sequenceShotIds.slice(entryShotIds.length)){
  const s=[...episode.shots,...(episode.omittedShots||[])].find(s=>s.id===id);next.shots.push({id:s.id,duration:s.duration});
 }
 return withUnderpassSounds(next);
}
