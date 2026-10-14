import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {batchResponseSpellIds} from '../src/spell-response-targets.mjs';
import {batchFixture,assertBatchResult} from './helpers/spell-batch-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-batch-http-'));process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const fixtures=batchResponseSpellIds.map((cardId,index)=>{
 const f=batchFixture(I,cardId);f.r.code='B'+String(index).padStart(5,'0');return {...f,cardId};
});
const storage=path.join(dir,'rooms.json');fs.writeFileSync(storage,JSON.stringify(Object.fromEntries(fixtures.map(f=>[f.r.code,f.r]))));
let server,base,seq=0;
async function restart(){
 if(server?.listening)await new Promise(ok=>server.close(ok));
 const {createApp}=await import(`../server.mjs?batch=${++seq}`);server=createApp();
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`;
}
async function call(code,who,body){
 const res=await fetch(base+'/api/rooms/'+code+(body?'/actions':''),{method:body?'POST':'GET',
 headers:{authorization:'Bearer '+(who===0?'a':'b').repeat(64),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 return {status:res.status,state:await res.json()};
}
test.after(async()=>{if(server?.listening)await new Promise(ok=>server.close(ok));fs.rmSync(dir,{recursive:true,force:true});});
test('batch HTTP: all 23 declarations survive restart and resolve once without leaking private hands',async t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?0:min);
 await restart();const saved=new Map();
 for(const f of fixtures){
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
  f.r=JSON.parse(fs.readFileSync(storage,'utf8'))[code];assertBatchResult(f,f.cardId);
  assert.equal((await call(code,1,{type:'spellResponse',choice:'pass',expectedVersion:2})).status,409);
 }
});
