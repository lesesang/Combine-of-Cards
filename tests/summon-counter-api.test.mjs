import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SUPPORTED_EXTRA_IDS} from '../src/extra-summons.mjs';
import {extraCounterFixture as fixture} from './helpers/extra-counter-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-extra-counter-http-'));process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const fixtures=SUPPORTED_EXTRA_IDS.map((cid,i)=>{const f=fixture(I,cid);f.r.code='S'+String(i).padStart(5,'0');return f;});
const failed=fixture(I,'COC-22-014');failed.r.code='FAIL01';failed.r.effectSequence=Number.MAX_SAFE_INTEGER;
const storage=path.join(dir,'rooms.json');fs.writeFileSync(storage,JSON.stringify(Object.fromEntries([...fixtures,failed].map(f=>[f.r.code,f.r]))));
let server,base,seq=0;
async function restart(){if(server?.listening)await new Promise(ok=>server.close(ok));const {createApp}=await import(`../server.mjs?summoncounter=${++seq}`);server=createApp();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`;}
async function call(code,who,body){const res=await fetch(base+'/api/rooms/'+code+(body?'/actions':''),{method:body?'POST':'GET',headers:{authorization:'Bearer '+(who===0?'a':who===1?'b':'c').repeat(64),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,state:await res.json()};}
test.after(async()=>{if(server?.listening)await new Promise(ok=>server.close(ok));fs.rmSync(dir,{recursive:true,force:true});});
test('summon HTTP: all 21 paid declarations and counters restore without leaking private data or refunding costs',async()=>{
 await restart();const before=fs.readFileSync(storage,'utf8');
 const rollback=await call(failed.r.code,0,{type:'extraSummon',...failed.body,expectedVersion:1});assert.equal(rollback.status,500);assert.match(rollback.state.details,/overflow/);assert.equal(fs.readFileSync(storage,'utf8'),before);
 const declarations=new Map(),counters=new Map();
 for(const f of fixtures){const x=await call(f.r.code,0,{type:'extraSummon',...f.body,expectedVersion:1});assert.equal(x.status,200);assert.equal(x.state.pendingExtraSummon.awaiting,1);declarations.set(f.r.code,x.state);}
 await restart();
 for(const f of fixtures){
  assert.deepEqual((await call(f.r.code,0)).state,declarations.get(f.r.code));
  const before=fs.readFileSync(storage,'utf8'),choice={type:'extraResponse',choice:'counter',sourceUnitId:f.counter,expectedVersion:2};
  assert.equal((await call(f.r.code,2,choice)).status,403);assert.equal((await call(f.r.code,0,choice)).status,403);
  assert.equal((await call(f.r.code,1,{...choice,expectedVersion:1})).status,409);
  assert.equal((await call(f.r.code,1,{...choice,sourceUnitId:f.extra})).status,409);assert.equal(fs.readFileSync(storage,'utf8'),before);
  const x=await call(f.r.code,1,choice);assert.equal(x.status,200);assert.equal(x.state.pendingExtraSummon.awaiting,0);
  assert.equal(x.state.pendingExtraSummon.extraUnitId,undefined);assert.equal(x.state.effectStack,undefined);
  assert.equal(x.state.players[0].hand,null);assert.equal(x.state.players[0].extra,null);counters.set(f.r.code,x.state);
 }
 await restart();
 for(const f of fixtures){
  assert.deepEqual((await call(f.r.code,1)).state,counters.get(f.r.code));
  assert.equal((await call(f.r.code,1,{type:'extraResponse',choice:'pass',expectedVersion:3})).status,403);
  const x=await call(f.r.code,0,{type:'extraResponse',choice:'pass',expectedVersion:3});assert.equal(x.status,200);
  assert.equal(x.state.pendingExtraSummon,null);assert.ok(x.state.players[0].extra.some(u=>u.id===f.extra));
  assert.ok(f.materials.every(id=>x.state.players[0].grave.some(u=>u.id===id)));
  if(f.spell)assert.ok(x.state.players[0].grave.some(u=>u.id===f.spell));
  assert.equal(x.state.players[1].integration.spellCounterGameUsed,true);
  assert.equal((await call(f.r.code,0,{type:'extraResponse',choice:'pass',expectedVersion:3})).status,409);
 }
});
