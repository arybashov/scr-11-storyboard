import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createBoardServer} from './server.mjs';
import {defaultTimeline,validateTimeline,resizeShot,totalDuration} from './timeline-model.mjs';
const context={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../episodes.js',import.meta.url),'utf8'),context);
const library=JSON.parse(fs.readFileSync(new URL('./sound-library.json',import.meta.url),'utf8'));
const fresh=()=>defaultTimeline(context.window.EPISODES[0]);
test('duration edits preserve compound phases, shift later sounds and keep the rain bed',()=>{
 const s=fresh();resizeShot(s,'T01',4,true);assert.equal(totalDuration(s),20.3);assert.equal(s.sounds.find(c=>c.id==='horn-warning').start,9.65);assert.equal(s.sounds[0].duration,20.3);assert.equal(s.shots[0].phases.reduce((n,p)=>n+p.duration,0),4);validateTimeline(s,library);
 resizeShot(s,'T15',.2,true);validateTimeline(s,library);assert.equal(totalDuration(s),18.8);
 const bad=fresh();bad.sounds[0].source='https://evil.invalid/a.mp3';assert.throws(()=>validateTimeline(bad,library));
 const badTrim=fresh();badTrim.sounds[1].offset=6.9;assert.throws(()=>validateTimeline(badTrim,library));
 const dupe=fresh();dupe.sounds.push({...dupe.sounds[0]});assert.throws(()=>validateTimeline(dupe,library));
});
test('shared timeline requires login, rejects conflicts and survives restart without losing gallery',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'kino-timeline-'));
 const opts={dataDir,secret:'timeline-test-secret'.repeat(4),accessCode:'test-project-code'};
 let server=createBoardServer(opts);await new Promise(r=>server.listen(0,'127.0.0.1',r));let base=`http://127.0.0.1:${server.address().port}`;
 const call=(p,o={})=>fetch(base+p,o);const state=fresh();
 try {
  assert.equal((await call('/timeline/taxi',{method:'PATCH',body:'{}'})).status,401);
  const {token}=await(await call('/session',{method:'POST',body:JSON.stringify({name:'Монтажёр',code:opts.accessCode})})).json();
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  let response=await call('/timeline/taxi',{method:'PATCH',headers,body:JSON.stringify({revision:0,state})});assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
  response=await call('/timeline/taxi',{method:'PATCH',headers,body:JSON.stringify({revision:0,state})});assert.equal(response.status,409);
  const invalid=structuredClone(state);invalid.shots[0].duration=-1;assert.equal((await call('/timeline/taxi',{method:'PATCH',headers,body:JSON.stringify({revision:1,state:invalid})})).status,400);
  resizeShot(state,'T07',1.5);assert.equal((await call('/timeline/taxi',{method:'PATCH',headers,body:JSON.stringify({revision:1,state})})).status,200);
  await new Promise(r=>server.close(r));server=createBoardServer(opts);await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
  const saved=await(await call('/timeline/taxi')).json();assert.equal(saved.revision,2);assert.equal(saved.state.shots.find(s=>s.id==='T07').duration,1.5);
  assert.ok((await(await call('/gallery')).json()).shots);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dataDir,{recursive:true,force:true});}
});
