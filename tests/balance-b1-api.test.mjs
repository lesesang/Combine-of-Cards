import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {batchFixture} from './helpers/spell-batch-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-balance-http-'));process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const fixtures=['COC-11-011','COC-21-004','COC-21-005'].map((cid,n)=>{
 const f=batchFixture(I,cid);f.r.code='B'+String(n).padStart(5,'0');f.body.target={type:'unit',id:cid==='COC-21-005'?f.ally:f.target};
 if(cid==='COC-21-004'){f.body.costUnitIds=[f.ally];f.r.units[f.ally].atk=100;f.r.units[f.ally].hp=100;f.r.units[f.target].effectDestructionImmune=true;}
 return {...f,cid};
});
const storage=path.join(dir,'rooms.json');fs.writeFileSync(storage,JSON.stringify(Object.fromEntries(fixtures.map(f=>[f.r.code,f.r]))));
let server,base,seq=0;
async function restart(){if(server?.listening)await new Promise(ok=>server.close(ok));const {createApp}=await import(`../server.mjs?balance=${++seq}`);server=createApp();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`;}
async function call(code,who,body){const res=await fetch(base+'/api/rooms/'+code+(body?'/actions':''),{method:body?'POST':'GET',headers:{authorization:'Bearer '+(who===0?'a':'b').repeat(64),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,state:await res.json()};}
test.after(async()=>{if(server?.listening)await new Promise(ok=>server.close(ok));fs.rmSync(dir,{recursive:true,force:true});});
test('B1 HTTP: three new spell windows restore, reject stale actions, preserve privacy and resolve once',async()=>{
 await restart();const saved=new Map();
 for(const f of fixtures){const code=f.r.code,before=fs.readFileSync(storage,'utf8');
  const invalid=await call(code,0,{type:'play',...f.body,unitId:'missing',expectedVersion:1});assert.equal(invalid.status,403);assert.equal(fs.readFileSync(storage,'utf8'),before);
  const result=await call(code,0,{type:'play',...f.body,expectedVersion:1});assert.equal(result.status,200);assert.equal(result.state.balanceRevision,'1.3-balance-b1');assert.equal(result.state.pendingSpell.card.id,f.cid);
  assert.equal(result.state.players[1].hand,null);assert.equal(result.state.effectStack,undefined);assert.equal((await call(code,1)).state.players[0].hand,null);saved.set(code,result.state);
 }
 await restart();
 for(const f of fixtures){const code=f.r.code;assert.deepEqual((await call(code,0)).state,saved.get(code));
  assert.equal((await call(code,0,{type:'spellResponse',choice:'pass',expectedVersion:2})).status,403);
  assert.equal((await call(code,1,{type:'spellResponse',choice:'pass',expectedVersion:1})).status,409);
  const done=await call(code,1,{type:'spellResponse',choice:'pass',expectedVersion:2});assert.equal(done.status,200);assert.equal(done.state.pendingSpell,null);
  const actual=JSON.parse(fs.readFileSync(storage))[code];
  if(f.cid==='COC-11-011'){assert.equal(actual.units[f.ally].atk,80);assert.equal(actual.units[f.ally].hp,1030);}
  if(f.cid==='COC-21-004'){assert.ok(actual.players[0].grave.includes(f.ally));assert.ok(actual.players[1].grave.includes(f.target));}
  if(f.cid==='COC-21-005'){assert.equal(actual.players[0].hp,2000);assert.ok(actual.players[0].grave.includes(f.ally));}
  assert.equal((await call(code,1,{type:'spellResponse',choice:'pass',expectedVersion:2})).status,409);
 }
});
