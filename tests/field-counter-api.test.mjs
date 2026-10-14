import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-field-chain-api-'));process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const fixtures=['COC-12-001','COC-24-005'].map((cid,index)=>{
 const r={code:'CHAIN'+index,status:'active',version:1,turn:0,turnNumber:5,phase:'MAIN',mode:'pvp',players:[],units:{},logs:[],effects:[]};
 I.createPlayer(r,'12','A','a'.repeat(64));I.createPlayer(r,cid.slice(4,6),'B','b'.repeat(64));r.players.forEach(p=>p.turnsTaken=3);
 const put=(cid,who,to)=>{const id=I.instantiate(r,cid,who);I.move(r,id,to,who);return id;};
 const spell=put('COC-30-007',0,'hand'),first=put(cid,1,'field'),second=put('COC-12-002',0,'field'),third=put('COC-12-002',1,'field');r.players[0].hp=100;
 return {r,spell,first,second,third};
});
const broken=structuredClone(fixtures[0]);broken.r.code='BROKEN';I.apply(broken.r,0,'play',{unitId:broken.spell});broken.r.effectSequence=Number.MAX_SAFE_INTEGER;
const storage=path.join(dir,'rooms.json');fs.writeFileSync(storage,JSON.stringify(Object.fromEntries([...fixtures,broken].map(f=>[f.r.code,f.r]))));
let server,base,seq=0;
async function restart(){if(server?.listening)await new Promise(ok=>server.close(ok));const {createApp}=await import(`../server.mjs?fieldchain=${++seq}`);server=createApp();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`;}
async function call(code,who,body){const res=await fetch(base+'/api/rooms/'+code+(body?'/actions':''),{method:body?'POST':'GET',headers:{authorization:'Bearer '+(who===0?'a':who===1?'b':'c').repeat(64),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,state:await res.json()};}
test.after(async()=>{if(server?.listening)await new Promise(ok=>server.close(ok));fs.rmSync(dir,{recursive:true,force:true});});
test('field counter HTTP: three nested declarations survive restarts and invalid requests preserve usage and disk',async()=>{
 await restart();const before=fs.readFileSync(storage,'utf8');
 const fail=await call('BROKEN',1,{type:'spellResponse',choice:'counter',sourceUnitId:broken.first,expectedVersion:2});assert.equal(fail.status,500);assert.equal(fs.readFileSync(storage,'utf8'),before);
 for(const f of fixtures)assert.equal((await call(f.r.code,0,{type:'play',unitId:f.spell,expectedVersion:1})).status,200);
 for(const f of fixtures){const prior=fs.readFileSync(storage,'utf8'),state=(await call(f.r.code,1)).state;
  assert.ok(!state.pendingSpell.counters.some(c=>c.sourceUnitId===f.third));
  assert.equal((await call(f.r.code,1,{type:'spellResponse',choice:'counter',sourceUnitId:f.third,expectedVersion:2})).status,409);
  assert.equal(fs.readFileSync(storage,'utf8'),prior);
 }
 for(const [key,who,version] of [['first',1,2],['second',0,3],['third',1,4]]){
  const saved=new Map();
  for(const f of fixtures){
   const body={type:'spellResponse',choice:'counter',sourceUnitId:f[key],expectedVersion:version},prior=fs.readFileSync(storage,'utf8');
   assert.equal((await call(f.r.code,2,body)).status,403);assert.equal((await call(f.r.code,1-who,body)).status,403);
   assert.equal((await call(f.r.code,who,{...body,expectedVersion:version-1})).status,409);
   assert.equal((await call(f.r.code,who,{...body,sourceUnitId:'missing'})).status,409);assert.equal(fs.readFileSync(storage,'utf8'),prior);
   const result=await call(f.r.code,who,body);assert.equal(result.status,200);assert.equal(result.state.pendingSpell.awaiting,1-who);
   assert.equal(result.state.players[1-who].hand,null);assert.equal(result.state.effectStack,undefined);assert.equal(result.state.pendingSpell.countersDeclared,undefined);
   saved.set(f.r.code,result.state);
  }
  await restart();for(const f of fixtures)assert.deepEqual((await call(f.r.code,who)).state,saved.get(f.r.code));
 }
 for(const f of fixtures){const result=await call(f.r.code,0,{type:'spellResponse',choice:'pass',expectedVersion:5});assert.equal(result.status,200);assert.equal(result.state.pendingSpell,null);assert.equal(result.state.players[0].hp,100);assert.ok(result.state.players[0].grave.some(u=>u.id===f.spell));
  assert.equal((await call(f.r.code,0,{type:'spellResponse',choice:'pass',expectedVersion:5})).status,409);
 }
});
