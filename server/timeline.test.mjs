import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createBoardServer} from './server.mjs';
import {defaultTimeline,validateTimeline,resizeShot,totalDuration,shotStart} from './timeline-model.mjs';
const context={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../episodes.js',import.meta.url),'utf8'),context);
const library=JSON.parse(fs.readFileSync(new URL('./sound-library.json',import.meta.url),'utf8'));
const fresh=()=>defaultTimeline(context.window.EPISODES[0]);
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
 resizeShot(s,'I01',5);assert.equal(s.sounds.find(c=>c.id==='rain-bed').start,oldStart+1.5);assert.equal(s.sounds.find(c=>c.id==='rain-cabin').duration,oldStart+1.5);validateTimeline(s,library);
 const oldShots=context.window.EPISODES[0].shots.filter(s=>s.id.startsWith('T')).map(s=>({...s}));
 oldShots.find(s=>s.id==='T01').duration=6;
 oldShots.find(s=>s.id==='T01').phases=[{id:'T01',duration:3},{id:'T02',duration:3}];
 const legacy=defaultTimeline({shots:oldShots});assert.equal(legacy.schema,1);validateTimeline(legacy,library);
});
