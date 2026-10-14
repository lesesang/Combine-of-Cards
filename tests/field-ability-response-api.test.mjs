import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {FIELD_RESPONSE_IDS as ALL_FIELD_RESPONSE_IDS} from '../src/field-ability-effects.mjs';
const FIELD_RESPONSE_IDS=ALL_FIELD_RESPONSE_IDS.filter(id=>!id.startsWith('COC-32-'));
import {fieldAbilityFixture} from './helpers/field-ability-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-ability-api-'));process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const fixtures=FIELD_RESPONSE_IDS.flatMap((cid,i)=>['pass','counter'].map((mode,j)=>{const f=fieldAbilityFixture(I,cid);f.r.code='ABL'+i+'0'+j;f.mode=mode;f.add('COC-13-008',0,'hand');return f;}));
const overflow=fieldAbilityFixture(I,'COC-12-013');overflow.r.code='OVERFL';overflow.r.effectSequence=Number.MAX_SAFE_INTEGER;
const copies=fieldAbilityFixture(I,'COC-12-013');copies.r.code='COPY12';copies.second=copies.add('COC-12-013',0,'field');copies.secondCost=copies.add('COC-12-008',0,'hand');copies.secondTarget=copies.add('COC-03-005',1,'field');
const storage=path.join(dir,'rooms.json');fs.writeFileSync(storage,JSON.stringify(Object.fromEntries([...fixtures,overflow,copies].map(f=>[f.r.code,f.r]))));
let server,base,seq=0;
async function restart(){if(server?.listening)await new Promise(ok=>server.close(ok));const {createApp}=await import(`../server.mjs?ability=${++seq}`);server=createApp();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`;}
async function call(code,who,body){const res=await fetch(base+'/api/rooms/'+code+(body?'/actions':''),{method:body?'POST':'GET',headers:{authorization:'Bearer '+(who===0?'a':who===1?'b':'c').repeat(64),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,state:await res.json()};}
test.after(async()=>{if(server?.listening)await new Promise(ok=>server.close(ok));fs.rmSync(dir,{recursive:true,force:true});});
test('field response HTTP: seven abilities persist declaration and counters, hide plans and reject stale or unauthorized actions',async()=>{
 await restart();let prior=fs.readFileSync(storage,'utf8');
 assert.equal((await call('OVERFL',0,{type:'ability',...overflow.body,expectedVersion:1})).status,500);assert.equal(fs.readFileSync(storage,'utf8'),prior);
 for(const f of fixtures){
  const declared=await call(f.r.code,0,{type:'ability',...f.body,expectedVersion:1});assert.equal(declared.status,200);assert.equal(declared.state.pendingAbility.card.id,f.cardId);
  const enemy=(await call(f.r.code,1)).state;assert.equal(enemy.players[0].hand,null);assert.ok(!JSON.stringify(enemy).includes(f.search));assert.equal(enemy.effectStack,undefined);assert.equal(enemy.pendingAbility.sourceRevision,undefined);assert.equal(enemy.pendingAbility.sequence,undefined);
  const preview=await fetch(base+'/api/rooms/'+f.r.code+'/hand-preview',{headers:{authorization:'Bearer '+'a'.repeat(64)}});assert.equal(preview.status,403);
 }
 await restart();
 for(const f of fixtures){
  assert.equal((await call(f.r.code,1)).state.pendingAbility.card.id,f.cardId);prior=fs.readFileSync(storage,'utf8');
  const b={type:'abilityResponse',choice:'pass',expectedVersion:2};assert.equal((await call(f.r.code,2,b)).status,403);assert.equal((await call(f.r.code,0,b)).status,403);assert.equal((await call(f.r.code,1,{...b,expectedVersion:1})).status,409);
  assert.equal((await call(f.r.code,1,{...b,choice:'counter',sourceUnitId:'missing'})).status,409);assert.equal(fs.readFileSync(storage,'utf8'),prior);
  if(f.mode==='counter'&&!f.integration){const c=await call(f.r.code,1,{...b,choice:'counter',sourceUnitId:f.wind});assert.equal(c.status,200);assert.equal(c.state.pendingAbility.awaiting,0);assert.equal(c.state.pendingAbility.countersDeclared,undefined);}
 }
 await restart();
 for(const f of fixtures){const negated=f.mode==='counter'&&!f.integration,version=negated?3:2,who=negated?0:1;
  const result=await call(f.r.code,who,{type:'abilityResponse',choice:'pass',expectedVersion:version});assert.equal(result.status,200);assert.equal(result.state.pendingAbility,null);
  if(negated)assert.ok(result.state.players[1].field.some(u=>u?.id===f.target));
  if(f.cardId==='COC-12-013'){assert.ok(result.state.players[0].grave.some(u=>u.id===f.cost));assert.equal(result.state.players[1].grave.some(u=>u.id===f.target),!negated);}
  assert.equal((await call(f.r.code,who,{type:'abilityResponse',choice:'pass',expectedVersion:version+1})).status,403);
 }
});

test('field response HTTP: a used physical copy stays spent after restart while a second identical card can activate',async()=>{
 await restart();const f=copies;
 assert.equal((await call(f.r.code,0,{type:'ability',...f.body,expectedVersion:1})).status,200);
 assert.equal((await call(f.r.code,1,{type:'abilityResponse',choice:'pass',expectedVersion:2})).status,200);
 await restart();const body={type:'ability',sourceUnitId:f.source,costCardId:f.secondCost,target:{id:f.secondTarget},expectedVersion:3},before=fs.readFileSync(storage,'utf8');
 assert.equal((await call(f.r.code,0,body)).status,409);assert.equal(fs.readFileSync(storage,'utf8'),before);
 assert.equal((await call(f.r.code,0,{...body,sourceUnitId:f.second})).status,200);await restart();
 const result=await call(f.r.code,1,{type:'abilityResponse',choice:'pass',expectedVersion:4});assert.equal(result.status,200);assert.ok(result.state.players[1].grave.some(u=>u.id===f.secondTarget));
});
