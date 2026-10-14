import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {choiceResponseSpellIds} from '../src/spell-choice-batch.mjs';
import {choiceFixture,assertChoiceResult} from './helpers/spell-choice-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-choice-http-'));process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const fixtures=choiceResponseSpellIds.map((cardId,index)=>{
 const f=choiceFixture(I,cardId);f.r.code='C'+String(index).padStart(5,'0');return {...f,cardId};
});
const storage=path.join(dir,'rooms.json');fs.writeFileSync(storage,JSON.stringify(Object.fromEntries(fixtures.map(f=>[f.r.code,f.r]))));
let server,base,seq=0;
async function restart(){
 if(server?.listening)await new Promise(ok=>server.close(ok));
 const {createApp}=await import(`../server.mjs?choice=${++seq}`);server=createApp();
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`;
}
async function call(code,who,body){
 const res=await fetch(base+'/api/rooms/'+code+(body?'/actions':''),{method:body?'POST':'GET',
 headers:{authorization:'Bearer '+(who===0?'a':'b').repeat(64),'content-type':'application/json'},body:typeof body==='string'?body:body?JSON.stringify(body):undefined});
 return {status:res.status,state:await res.json()};
}
test.after(async()=>{if(server?.listening)await new Promise(ok=>server.close(ok));fs.rmSync(dir,{recursive:true,force:true});});
test('choice HTTP: all 12 paid declarations restore and resolve once with rollback and private hands',async t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?0:min);
 await restart();const saved=new Map();
 for(const f of fixtures){
  const before=fs.readFileSync(storage,'utf8');
  const invalid={...f.body,target:{type:'unit',id:'missing'},targets:[f.target,f.target],option:3};
  if(['COC-05-002','COC-14-002'].includes(f.cardId))invalid.unitId='missing';
  const denied=await call(f.r.code,0,{type:'play',...invalid,expectedVersion:1});
  assert.ok([403,409].includes(denied.status),f.cardId);assert.equal(fs.readFileSync(storage,'utf8'),before);
  const corrupt=JSON.stringify({type:'play',...f.body,expectedVersion:1}).slice(0,-1)+',"extra":1e309}';
  const failed=await call(f.r.code,0,corrupt);assert.equal(failed.status,500);assert.match(failed.state.details,/JSON/);
  assert.equal(fs.readFileSync(storage,'utf8'),before);
  assert.equal((await call(f.r.code,0)).state.version,1);
  const declared=await call(f.r.code,0,{type:'play',...f.body,expectedVersion:1});
  assert.equal(declared.status,200,f.cardId);assert.equal(declared.state.pendingSpell.card.id,f.cardId);
  assert.equal(declared.state.effectStack,undefined);assert.equal(declared.state.players[1].hand,null);
  assert.equal((await call(f.r.code,1)).state.players[0].hand,null);
  saved.set(f.r.code,declared.state);
 }
 await restart();
 for(const f of fixtures){
  const code=f.r.code;assert.deepEqual((await call(code,0)).state,saved.get(code));
  assert.equal((await call(code,0,{type:'spellResponse',choice:'pass',expectedVersion:2})).status,403);
  assert.equal((await call(code,1,{type:'spellResponse',choice:'pass',expectedVersion:1})).status,409);
  const resolved=await call(code,1,{type:'spellResponse',choice:'pass',expectedVersion:2});
  assert.equal(resolved.status,200,f.cardId);assert.equal(resolved.state.pendingSpell,null);
  f.r=JSON.parse(fs.readFileSync(storage,'utf8'))[code];assertChoiceResult(f,f.cardId);
  assert.equal((await call(code,1,{type:'spellResponse',choice:'pass',expectedVersion:2})).status,409);
 }
});
