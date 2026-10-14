import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ELEMENTAL_MAGICIAN_IDS} from '../src/effect-usage.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-elemental-api-'));process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const fixtures=ELEMENTAL_MAGICIAN_IDS.flatMap((cid,i)=>['hand','deck','grave'].flatMap((zone,j)=>['pass','wind','storm'].map((mode,k)=>{
 const r={code:'ELM'+i+j+k,status:'active',version:1,turn:0,turnNumber:5,phase:'MAIN',mode:'pvp',players:[],units:{},logs:[],effects:[]};
 I.createPlayer(r,'32','A','a'.repeat(64));I.createPlayer(r,'32','B','b'.repeat(64));r.players.forEach(p=>p.turnsTaken=3);
 const add=(id,who,zone)=>{const uid=I.instantiate(r,id,who);I.move(r,uid,zone,who);return uid;};
 const source=add(cid,0,'field'),target=add(ELEMENTAL_MAGICIAN_IDS[(i+1)%4],0,zone),hidden=add('COC-13-008',0,'hand'),wind=add('COC-12-002',1,'field'),storm=add('COC-14-001',1,'integration');add('COC-32-005',0,'hand');
 return {r,source,target,hidden,wind,storm,zone,mode};
})));
const costFixture=structuredClone(fixtures[0]);costFixture.r.code='ELMCST';costFixture.r.players[0].hp=500;costFixture.r.effects=[{type:'firstDestroyHeal',player:0,turn:5},{type:'firstDestroyHeal',player:0,turn:5}];
const storage=path.join(dir,'rooms.json');fs.writeFileSync(storage,JSON.stringify(Object.fromEntries([...fixtures,costFixture].map(f=>[f.r.code,f.r]))));
let server,base,seq=0;
async function restart(){if(server?.listening)await new Promise(ok=>server.close(ok));const {createApp}=await import(`../server.mjs?elemental=${++seq}`);server=createApp();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`;}
async function call(f,who,body){const res=await fetch(base+'/api/rooms/'+f.r.code+(body?'/actions':''),{method:body?'POST':'GET',headers:{authorization:'Bearer '+(who===0?'a':who===1?'b':'c').repeat(64),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,state:await res.json()};}
async function act(f,who,type,body={}){const g=await call(f,who);const result=await call(f,who,{type,...body,expectedVersion:g.state.version});assert.equal(result.status,200,JSON.stringify(result.state));return result.state;}
test.after(async()=>{if(server?.listening)await new Promise(ok=>server.close(ok));fs.rmSync(dir,{recursive:true,force:true});});
test('elemental HTTP: four forms three origins and both negations persist without secret choices or repeated costs',async()=>{
 await restart();for(const f of fixtures)await act(f,0,'ability',{sourceUnitId:f.source});
 await restart();for(const f of fixtures){
  const before=fs.readFileSync(storage,'utf8'),state=(await call(f,1)).state;
  assert.ok(!JSON.stringify(state).includes(f.hidden));assert.equal(state.pendingAbility.plan,undefined);
  assert.equal((await call(f,0,{type:'abilityResponse',choice:'pass',expectedVersion:2})).status,403);
  assert.equal((await call(f,1,{type:'abilityResponse',choice:'pass',expectedVersion:1})).status,409);assert.equal(fs.readFileSync(storage,'utf8'),before);
  if(f.mode==='wind')await act(f,1,'abilityResponse',{choice:'counter',sourceUnitId:f.wind});
 }
 await restart();for(const f of fixtures){
  await act(f,f.mode==='wind'?0:1,'abilityResponse',{choice:'pass'});
  const state=(await call(f,1)).state;if(f.mode==='wind'){assert.equal(state.pendingElementalChoice,null);continue;}
  assert.equal(state.pendingElementalChoice.choices,undefined);assert.ok(!JSON.stringify(state).includes(f.hidden));if(f.zone==='deck'||f.zone==='hand')assert.ok(!JSON.stringify(state).includes(f.target));
 }
 await restart();for(const f of fixtures.filter(f=>f.mode!=='wind')){
  const before=fs.readFileSync(storage,'utf8'),version=(await call(f,0)).state.version;
  assert.equal((await call(f,1,{type:'elementalChoice',unitId:f.target,expectedVersion:version})).status,409);
  assert.equal((await call(f,0,{type:'elementalChoice',unitId:f.hidden,expectedVersion:version})).status,409);assert.equal(fs.readFileSync(storage,'utf8'),before);
  const state=await act(f,0,'elementalChoice',{unitId:f.target});assert.equal(state.pendingExtraSummon.method,'elemental');
 }
 await restart();for(const f of fixtures.filter(f=>f.mode==='storm'))await act(f,1,'extraResponse',{choice:'counter',sourceUnitId:f.storm});
 await restart();for(const f of fixtures.filter(f=>f.mode!=='wind')){
  const state=await act(f,f.mode==='storm'?0:1,'extraResponse',{choice:'pass'});assert.equal(state.pendingExtraSummon,null);assert.ok(state.players[0].grave.some(u=>u.id===f.source));
  const saved=JSON.parse(fs.readFileSync(storage,'utf8'))[f.r.code];assert.ok(saved.players[0][f.mode==='pass'?'field':f.zone].includes(f.target));
  assert.equal(saved.players[0].sharedEffectUsage['elemental-magicians:1'],5);
 }
 await restart();for(const f of fixtures.filter(f=>f.mode==='pass')){const version=(await call(f,0)).state.version;assert.equal((await call(f,0,{type:'ability',sourceUnitId:f.target,expectedVersion:version})).status,409);}
});

test('elemental HTTP: pending self-cost trigger ordering survives restart before the response opens',async()=>{
 const f=costFixture;await restart();let state=await act(f,0,'ability',{sourceUnitId:f.source});assert.equal(state.pendingAbility.stage,'cost-triggers');
 await restart();state=(await call(f,0)).state;assert.equal(state.players[0].hp,500);assert.ok(state.players[0].grave.some(u=>u.id===f.source));
 state=await act(f,0,'triggerOrder',{orderedKeys:state.pendingTriggerOrder.options.map(e=>e.key)});assert.equal(state.players[0].hp,800);assert.equal(state.pendingAbility.stage,'response');
 await restart();await act(f,1,'abilityResponse',{choice:'pass'});await act(f,0,'elementalChoice',{unitId:f.source});
 await restart();state=await act(f,1,'extraResponse',{choice:'pass'});assert.ok(state.players[0].field.some(u=>u?.id===f.source));assert.equal(state.players[0].hp,800);
});
