import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createBoardServer} from './server.mjs';
import {defaultTimeline,validateTimeline,resizeShot,totalDuration,shotStart,extendSequence} from './timeline-model.mjs';
const context={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../episodes.js',import.meta.url),'utf8'),context);
const library=JSON.parse(fs.readFileSync(new URL('./sound-library.json',import.meta.url),'utf8'));
const fresh=()=>defaultTimeline(context.window.EPISODES[0]);
const archive=JSON.parse(fs.readFileSync(new URL('../data/edits/20261108-80s.json',import.meta.url),'utf8'));
test('duration edits preserve compound phases, shift later sounds and keep the rain bed',()=>{
 const s=fresh(),before=totalDuration(s),horn=s.sounds.find(c=>c.id==='horn-warning').start;
 const old=s.shots.find(s=>s.id==='T01').duration;
 resizeShot(s,'T01',old+1,true);assert.equal(totalDuration(s),before+1);assert.equal(s.sounds.find(c=>c.id==='horn-warning').start,horn+1);
 assert.equal(s.shots.find(s=>s.id==='T01').phases.reduce((n,p)=>n+p.duration,0),old+1);validateTimeline(s,library);
 resizeShot(s,'T15',.2,true);validateTimeline(s,library);
 const bad=fresh();bad.sounds[0].source='https://evil.invalid/a.mp3';assert.throws(()=>validateTimeline(bad,library));
 const badTrim=fresh();badTrim.sounds.find(c=>c.id==='exit-steps').offset=6.9;assert.throws(()=>validateTimeline(badTrim,library));
 const dupe=fresh();dupe.sounds.push({...dupe.sounds[0]});assert.throws(()=>validateTimeline(dupe,library));
});
test('shared timeline requires login, rejects conflicts and survives restart without losing gallery',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'kino-timeline-'));
 fs.writeFileSync(path.join(dataDir,'index.json'),JSON.stringify({revision:4,shots:{T02:{images:[],current:null}},timeline:{revision:7,state:{schema:1,marker:'legacy'}}}));
 const opts={dataDir,secret:'timeline-test-secret'.repeat(4),accessCode:'test-project-code'};
 let server=createBoardServer(opts);await new Promise(r=>server.listen(0,'127.0.0.1',r));let base=`http://127.0.0.1:${server.address().port}`;
 const call=(p,o={})=>fetch(base+p,o);const state=fresh();
 try {
  assert.equal((await call('/timeline/sequence',{method:'PATCH',body:'{}'})).status,401);
  const {token}=await(await call('/session',{method:'POST',body:JSON.stringify({name:'Монтажёр',code:opts.accessCode})})).json();
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  let response=await call('/timeline/sequence',{method:'PATCH',headers,body:JSON.stringify({revision:0,state})});assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
  response=await call('/timeline/sequence',{method:'PATCH',headers,body:JSON.stringify({revision:0,state})});assert.equal(response.status,409);
  const invalid=structuredClone(state);invalid.shots[0].duration=-1;assert.equal((await call('/timeline/sequence',{method:'PATCH',headers,body:JSON.stringify({revision:1,state:invalid})})).status,400);
  resizeShot(state,'T07',1.5);assert.equal((await call('/timeline/sequence',{method:'PATCH',headers,body:JSON.stringify({revision:1,state})})).status,200);
  await new Promise(r=>server.close(r));server=createBoardServer(opts);await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
  const saved=await(await call('/timeline/sequence')).json();assert.equal(saved.revision,2);assert.equal(saved.state.shots.find(s=>s.id==='T07').duration,1.5);
  const gallery=await(await call('/gallery')).json();assert.ok(gallery.shots.T02);assert.equal(gallery.timeline.revision,7);assert.equal(gallery.timeline.state.marker,'legacy');assert.equal(gallery.sequenceTimeline.revision,2);
  assert.equal((await call('/shots/I01/images',{method:'POST',body:'invalid'})).status,401);assert.equal((await call('/shots/U05/images',{method:'POST',body:'invalid'})).status,401);
  assert.equal((await call('/timeline/taxi',{method:'PATCH',headers,body:JSON.stringify({revision:7,state})})).status,400);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dataDir,{recursive:true,force:true});}
});

test('sequence sound cues follow picture edits and legacy states still validate',()=>{
 const s=fresh();assert.equal(s.schema,2);validateTimeline(s,library);
 assert.equal(s.sounds.find(c=>c.id==='phone-drop').start,shotStart(s,'T03'));
 const oldStart=s.sounds.find(c=>c.id==='rain-bed').start;
 const delta=5-s.shots[0].duration;
 resizeShot(s,s.shots[0].id,5);assert.equal(s.sounds.find(c=>c.id==='rain-bed').start,oldStart+delta);assert.equal(s.sounds.find(c=>c.id==='rain-cabin').duration,oldStart+delta);validateTimeline(s,library);
 const oldShots=context.window.EPISODES[0].shots.filter(s=>s.id.startsWith('T')).map(s=>({...s}));
 oldShots.find(s=>s.id==='T01').duration=6;
 oldShots.find(s=>s.id==='T01').phases=[{id:'T01',duration:3},{id:'T02',duration:3}];
 const legacy=defaultTimeline({shots:oldShots});assert.equal(legacy.schema,1);validateTimeline(legacy,library);
});

test('underpass extension preserves edited picture and audio and is idempotent',()=>{
 const old=defaultTimeline(archive.episode);old.shots=old.shots.slice(0,26);old.sounds=old.sounds.filter(c=>!c.id.startsWith('underpass-'));
 resizeShot(old,'I04',4.25);old.sounds.find(c=>c.id==='door-slam').gain=.42;
 validateTimeline(old,library);
 const before=structuredClone(old),next=extendSequence(old,context.window.EPISODES[0]);
 assert.deepEqual(old,before);assert.deepEqual(next.shots.slice(0,26),old.shots);assert.deepEqual(next.sounds.slice(0,old.sounds.length),old.sounds);
 assert.equal(next.shots.length,34);assert.equal(next.sounds.find(c=>c.id==='underpass-rain-distant').start,totalDuration(old));
 assert.deepEqual(extendSequence(next,context.window.EPISODES[0]),next);validateTimeline(next,library);
 const bad=structuredClone(old);bad.shots[0].id='U99';assert.throws(()=>extendSequence(bad,context.window.EPISODES[0]));
});

test('short edit omits repeats, retains legacy edits and anchors cues after the ellipses',()=>{
 const s=defaultTimeline(JSON.parse(fs.readFileSync(new URL('../data/edits/20261110-55s.json',import.meta.url),'utf8')).episode);assert.equal(totalDuration(s),55.1);assert.equal(s.shots.length,30);validateTimeline(s,library);
 assert.equal(s.shots.filter(s=>['I07','I09','U02','U03'].includes(s.id)).length,0);
 assert.equal(s.shots.find(s=>s.id==='T03').duration,1.5);
 assert.equal(s.sounds.find(s=>s.id==='to-stairs').start,shotStart(s,'U04'));
 assert.equal(s.sounds.find(s=>s.id==='underpass-run').start+s.sounds.find(s=>s.id==='underpass-run').duration,shotStart(s,'U12'));
 validateTimeline(archive.timeline.state,library);
 assert.deepEqual(extendSequence(s,context.window.EPISODES[0]),structuredClone(s));
 const bad=structuredClone(s);bad.shots[0].id='I07';assert.throws(()=>validateTimeline(bad,library));
 const dupe=structuredClone(s);dupe.shots[1].id=dupe.shots[0].id;assert.throws(()=>validateTimeline(dupe,library));
});

test('subjective cut keeps the roadway, shortens cabin and leaves no stray footsteps during the POV',()=>{
 const s=fresh();assert.equal(totalDuration(s),37.1);assert.equal(s.shots.length,24);validateTimeline(s,library);
 assert.equal(shotStart(s,'T01'),6);assert.equal(shotStart(s,'U01'),25.5);
 assert.equal(s.sounds.find(c=>c.id==='underpass-run').start,shotStart(s,'U11'));
 assert.equal(s.sounds.find(c=>c.id==='rain-stairs').duration,3.2);
 assert.equal(s.sounds.some(c=>c.id==='underpass-walk'),false);
 assert.equal(s.sounds.find(c=>c.id==='underpass-rain-distant').gain,.05);
 assert.deepEqual(extendSequence(s,context.window.EPISODES[0]),structuredClone(s));
});
