import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {REMAINING_FIELD_IDS as IDS,remainingFieldFixture as fixture} from './helpers/remaining-field-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-field-six-http-'));process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const fixtures=IDS.flatMap((cid,i)=>['pass','counter'].map((mode,j)=>{
 const f=fixture(I,cid);f.r.code='LATE'+i+j;f.mode=mode;f.hidden=f.add('COC-13-008',0,'hand');
 if(cid==='COC-31-004'){I.move(f.r,f.croix,mode==='pass'?'deck':'hand',0);f.storm=f.add('COC-14-001',1,'integration');}
 return f;
}));
const costFixture=fixture(I,'COC-10-005');costFixture.r.code='COSTAB';costFixture.r.players[0].hp=500;costFixture.r.effects=[{type:'firstDestroyHeal',player:0,turn:5},{type:'firstDestroyHeal',player:0,turn:5}];
const overflow=fixture(I,'COC-10-005');overflow.r.code='OVFLAB';overflow.r.effectSequence=Number.MAX_SAFE_INTEGER;
const storage=path.join(dir,'rooms.json');fs.writeFileSync(storage,JSON.stringify(Object.fromEntries([...fixtures,costFixture,overflow].map(f=>[f.r.code,f.r]))));
let server,base,seq=0;
async function restart(){if(server?.listening)await new Promise(ok=>server.close(ok));const {createApp}=await import(`../server.mjs?fieldSix=${++seq}`);server=createApp();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`;}
async function call(f,who,body){const res=await fetch(base+'/api/rooms/'+f.r.code+(body?'/actions':''),{method:body?'POST':'GET',headers:{authorization:'Bearer '+(who===0?'a':who===1?'b':'c').repeat(64),'content-type':'application/json'},body:typeof body==='string'?body:body?JSON.stringify(body):undefined});return {status:res.status,state:await res.json()};}
async function act(f,who,type,body={}){const current=await call(f,who),res=await call(f,who,{type,...body,expectedVersion:current.state.version});assert.equal(res.status,200,JSON.stringify(res.state));return res.state;}
test.after(async()=>{if(server?.listening)await new Promise(ok=>server.close(ok));fs.rmSync(dir,{recursive:true,force:true});});
test('remaining six HTTP: costs counters private recruit choice and summon response persist with version atomicity',async()=>{
 await restart();
 for(const f of fixtures){const before=fs.readFileSync(storage,'utf8');
  const invalid={type:'ability',...f.body,sourceUnitId:'missing',expectedVersion:1};assert.equal((await call(f,0,invalid)).status,409);assert.equal(fs.readFileSync(storage,'utf8'),before);
  await act(f,0,'ability',f.body);
 }
 await restart();
 for(const f of fixtures){const before=fs.readFileSync(storage,'utf8'),g=(await call(f,1)).state;
  assert.equal(g.pendingAbility.plan,undefined);assert.ok(!JSON.stringify(g).includes(f.hidden));assert.equal(g.players[0].hand,null);
  assert.equal((await call(f,0,{type:'abilityResponse',choice:'pass',expectedVersion:2})).status,403);
  assert.equal((await call(f,1,{type:'abilityResponse',choice:'pass',expectedVersion:1})).status,409);assert.equal(fs.readFileSync(storage,'utf8'),before);
  if(f.mode==='counter'&&!f.integration)await act(f,1,'abilityResponse',{choice:'counter',sourceUnitId:f.wind});
 }
 await restart();
 for(const f of fixtures){const negated=f.mode==='counter'&&!f.integration;await act(f,negated?0:1,'abilityResponse',{choice:'pass'});
  const r=JSON.parse(fs.readFileSync(storage))[f.r.code];
  if(f.cardId==='COC-08-003'){assert.equal(r.players[0].hand.length,negated?1:2);assert.ok(r.units[f.source].effectUsage);}
  if(f.cardId==='COC-10-005'){assert.ok(r.players[0].grave.includes(f.own));assert.ok(r.players[1].grave.includes(f.foe));assert.equal(r.units[f.source].abilityGameCount,1);}
  if(f.cardId==='COC-23-002'){assert.equal(r.units[f.rider].atk,negated?80:130);assert.equal(r.units[f.source].abilityGameUsed,true);}
  if(['COC-24-003','COC-26-003'].includes(f.cardId))assert.equal(r.units[f.own].atk,negated?90:80);
 }
 await restart();
 for(const f of fixtures.filter(f=>f.cardId==='COC-31-004')){const g=(await call(f,1)).state,before=fs.readFileSync(storage,'utf8');assert.equal(g.pendingRecruitChoice.choices,undefined);assert.ok(!JSON.stringify(g).includes(f.croix));
  assert.equal((await call(f,1,{type:'recruitChoice',unitId:f.croix,expectedVersion:g.version})).status,409);
  assert.equal((await call(f,0,{type:'recruitChoice',unitId:f.hidden,expectedVersion:g.version})).status,409);assert.equal(fs.readFileSync(storage,'utf8'),before);
  for(const endpoint of ['evolution-costs','hand-preview']){const res=await fetch(base+'/api/rooms/'+f.r.code+'/'+endpoint,{headers:{authorization:'Bearer '+'a'.repeat(64)}});assert.equal(res.status,endpoint==='hand-preview'?403:409);}
  const selected=await act(f,0,'recruitChoice',{unitId:f.croix});assert.equal(selected.pendingExtraSummon.method,'recruit');
 }
 await restart();for(const f of fixtures.filter(f=>f.cardId==='COC-31-004'&&f.mode==='counter'))await act(f,1,'extraResponse',{choice:'counter',sourceUnitId:f.storm});
 await restart();for(const f of fixtures.filter(f=>f.cardId==='COC-31-004')){await act(f,f.mode==='counter'?0:1,'extraResponse',{choice:'pass'});const r=JSON.parse(fs.readFileSync(storage))[f.r.code];assert.ok(r.players[0][f.mode==='counter'?'hand':'field'].includes(f.croix));const version=r.version;assert.equal((await call(f,1,{type:'extraResponse',choice:'pass',expectedVersion:version-1})).status,409);}
});
test('remaining six HTTP: integration destruction-cost ordering resumes after restart before target destruction',async()=>{
 const f=costFixture;await restart();let g=await act(f,0,'ability',f.body);assert.equal(g.pendingAbility.stage,'cost-triggers');
 await restart();g=(await call(f,0)).state;assert.equal(g.players[0].hp,500);assert.ok(g.players[0].grave.some(u=>u.id===f.own));
 g=await act(f,0,'triggerOrder',{orderedKeys:g.pendingTriggerOrder.options.map(e=>e.key)});assert.equal(g.players[0].hp,660);assert.equal(g.pendingAbility.stage,'response');
 await restart();g=await act(f,1,'abilityResponse',{choice:'pass'});assert.ok(g.players[1].grave.some(u=>u.id===f.foe));assert.equal(g.players[0].integration.abilityGameCount,1);
});

test('remaining six HTTP: stack failure after sacrifice restores costs usage and persisted state',async()=>{
 const f=overflow;await restart();const before=fs.readFileSync(storage,'utf8');
 const failed=await call(f,0,{type:'ability',...f.body,expectedVersion:1});assert.equal(failed.status,500);assert.match(failed.state.details,/overflow/);assert.equal(fs.readFileSync(storage,'utf8'),before);
 const g=(await call(f,0)).state;assert.equal(g.version,1);assert.ok(g.players[0].field.some(u=>u?.id===f.own));assert.equal(g.players[0].integration.abilityGameCount,undefined);
});
