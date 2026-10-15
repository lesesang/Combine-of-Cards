import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {elementalDragonFixture as fixture,matureTerra} from './helpers/elemental-dragon-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-dragon-http-'));process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const fixtures=['COC-32-012','COC-32-014'].flatMap((cid,i)=>['pass','counter'].map((mode,j)=>{
 const f=fixture(I,cid);f.r.code='DRAG'+i+j;f.mode=mode;f.wind=f.add('COC-12-002',1);f.hidden=f.add('COC-13-008',0,'hand');
 if(cid==='COC-32-014')matureTerra(I,f);return f;
}));
const fresh=fixture(I,'COC-32-014');fresh.r.code='FRESHX';
const broken=fixture(I,'COC-32-012');broken.r.code='BROKEN';broken.r.effectSequence=Number.MAX_SAFE_INTEGER;
const storage=path.join(dir,'rooms.json');fs.writeFileSync(storage,JSON.stringify(Object.fromEntries([...fixtures,fresh,broken].map(f=>[f.r.code,f.r]))));
let server,base,seq=0;
async function restart(){if(server?.listening)await new Promise(ok=>server.close(ok));const {createApp}=await import(`../server.mjs?dragon=${++seq}`);server=createApp();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`;}
async function call(f,who,body){const res=await fetch(base+'/api/rooms/'+f.r.code+(body?'/actions':''),{method:body?'POST':'GET',headers:{authorization:'Bearer '+(who===0?'a':who===1?'b':'c').repeat(64),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,state:await res.json()};}
async function act(f,who,type,body={}){const current=await call(f,who),res=await call(f,who,{type,...body,expectedVersion:current.state.version});assert.equal(res.status,200,JSON.stringify(res.state));return res.state;}
test.after(async()=>{if(server?.listening)await new Promise(ok=>server.close(ok));fs.rmSync(dir,{recursive:true,force:true});});
test('elemental dragon HTTP: both effect-two declarations counters and limits persist without hidden information',async()=>{
 await restart();for(const f of fixtures){await act(f,0,'ability',f.body);}
 await restart();for(const f of fixtures){const g=(await call(f,1)).state,before=fs.readFileSync(storage,'utf8');
  assert.equal(g.pendingAbility.card.id,f.cid);assert.equal(g.pendingAbility.plan,undefined);assert.ok(!JSON.stringify(g).includes(f.hidden));assert.equal(g.players[0].hand,null);assert.equal(g.automation.fieldAbilityEffects[f.cid],2);
  assert.equal((await call(f,2)).status,403);
  assert.equal((await call(f,0,{type:'abilityResponse',choice:'pass',expectedVersion:g.version})).status,403);
  assert.equal((await call(f,1,{type:'abilityResponse',choice:'pass',expectedVersion:g.version-1})).status,409);
  assert.equal((await call(f,0,{type:'phase',expectedVersion:g.version})).status,409);assert.equal(fs.readFileSync(storage,'utf8'),before);
  if(f.mode==='counter')await act(f,1,'abilityResponse',{choice:'counter',sourceUnitId:f.wind});
 }
 await restart();for(const f of fixtures){const g=await act(f,f.mode==='counter'?0:1,'abilityResponse',{choice:'pass'}),r=JSON.parse(fs.readFileSync(storage))[f.r.code];
  if(f.cid==='COC-32-012')assert.equal(r.players[1].grave.includes(f.foe),f.mode==='pass');else assert.equal(r.players[1].hp,f.mode==='pass'?850:1000);
  assert.equal(r.units[f.source].effectUsage[f.cid+':2'],r.turnNumber);assert.equal(r.units[f.source].effectUsage[f.cid+':1'],undefined);
  assert.equal((await call(f,0,{type:'ability',...f.body,expectedVersion:g.version})).status,409);
  assert.equal((await call(f,1,{type:'abilityResponse',choice:'pass',expectedVersion:g.version-1})).status,409);
 }
});
test('elemental dragon HTTP: Terra residence matures across real phase actions and multiple restarts',async()=>{
 await restart();let g=(await call(fresh,0)).state;
 assert.equal((await call(fresh,0,{type:'ability',...fresh.body,expectedVersion:g.version})).status,409);
 for(let n=0;n<4;n++){
  const who=n%2;g=(await call(fresh,who)).state;
  if(g.phase==='DRAW')await act(fresh,who,'draw');await act(fresh,who,'phase',{skipAttack:true});await act(fresh,who,'phase');
  await restart();g=(await call(fresh,0)).state;assert.equal(g.players[0].field.find(u=>u?.id===fresh.source).dragonResidence.ownTurnStarts,Math.floor((n+1)/2));
 }
 await act(fresh,0,'draw');await act(fresh,0,'ability',fresh.body);await restart();g=await act(fresh,1,'abilityResponse',{choice:'pass'});assert.equal(g.players[1].hp,850);
});
test('elemental dragon HTTP: failed declaration preserves persisted room and effect usage',async()=>{
 await restart();const g=(await call(broken,0)).state,before=fs.readFileSync(storage,'utf8');
 const failed=await call(broken,0,{type:'ability',...broken.body,expectedVersion:g.version});assert.equal(failed.status,500);assert.match(failed.state.details,/overflow/);assert.equal(fs.readFileSync(storage,'utf8'),before);
 await restart();const after=(await call(broken,0)).state;assert.equal(after.version,g.version);assert.equal(after.players[0].field.find(u=>u?.id===broken.source).effectUsage,undefined);
});
