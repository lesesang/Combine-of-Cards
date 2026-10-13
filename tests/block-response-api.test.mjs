import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-block-api-'));
process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const tokens=['a'.repeat(64),'b'.repeat(64)],fixtures=[];
for(const code of ['BLKYES','BLKNOT']){
 const r={code,status:'active',version:1,turn:0,turnNumber:3,phase:'MAIN',mode:'pvp',players:[],units:{},logs:[],effects:[]};
 I.createPlayer(r,'31','Caster',tokens[0]);I.createPlayer(r,'14','Opponent',tokens[1]);
 r.players.forEach(p=>p.turnsTaken=2);
 const take=(who,card,to)=>{const id=r.players[who].deck.find(id=>r.units[id].cardId===card);I.move(r,id,to,who);return id;};
 fixtures.push({r,code,spell:take(0,'COC-31-009','hand'),cost:take(0,'COC-31-004','hand'),
  counter:take(1,'COC-14-001','integration'),target:take(1,'COC-14-008','field')});
}
const storage=path.join(dir,'rooms.json');
fs.writeFileSync(storage,JSON.stringify(Object.fromEntries(fixtures.map(f=>[f.code,f.r]))));
let server,base,sequence=0;
async function restart(){
 if(server?.listening)await new Promise(ok=>server.close(ok));
 const {createApp}=await import(`../server.mjs?block=${++sequence}`);
 server=createApp();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 base=`http://127.0.0.1:${server.address().port}`;
}
async function call(code,who,body){
 const response=await fetch(base+'/api/rooms/'+code+(body?'/actions':''),{
  method:body?'POST':'GET',headers:{authorization:'Bearer '+tokens[who],'content-type':'application/json'},
  body:typeof body==='string'?body:body?JSON.stringify(body):undefined});
 return {status:response.status,state:await response.json()};
}
test.after(async()=>{if(server?.listening)await new Promise(ok=>server.close(ok));fs.rmSync(dir,{recursive:true,force:true});});

test('BLOCK HTTP: failed registration rolls back both costs; restart preserves pass and counter outcomes',async()=>{
 await restart();
 for(const [index,{code,spell,cost,counter,target}] of fixtures.entries()){
  const before=(await call(code,0)).state;
  const diskBefore=JSON.parse(fs.readFileSync(storage,'utf8'));
  const invalid=await call(code,0,`{"type":"play","unitId":"${spell}","costCardId":"${cost}","expectedVersion":1,"extra":1e309}`);
  assert.equal(invalid.status,500);assert.match(invalid.state.details,/JSON/);
  assert.deepEqual((await call(code,0)).state,before);
  assert.deepEqual(JSON.parse(fs.readFileSync(storage,'utf8')),diskBefore);
  const declared=await call(code,0,{type:'play',unitId:spell,costCardId:cost,expectedVersion:1});
  assert.equal(declared.status,200);
  assert.equal(declared.state.pendingSpell.card.id,'COC-31-009');
  assert.deepEqual(declared.state.players[0].grave.map(u=>u.id),[cost,spell]);
  assert.ok(!declared.state.players[1].field.find(u=>u?.id===target).effectsNegated);
  assert.equal((await call(code,1)).state.players[0].hand,null);
  await restart();assert.deepEqual((await call(code,0)).state,declared.state);
  let who=1,expectedVersion=2;
  if(index===1){
   const negated=await call(code,1,{type:'spellResponse',choice:'counter',sourceUnitId:counter,expectedVersion});
   assert.equal(negated.status,200);who=0;expectedVersion=3;
   await restart();assert.deepEqual((await call(code,1)).state,negated.state);
  }
  const resolved=await call(code,who,{type:'spellResponse',choice:'pass',expectedVersion});
  assert.equal(resolved.status,200);assert.equal(resolved.state.pendingSpell,null);
  assert.equal(Boolean(resolved.state.players[1].field.find(u=>u?.id===target).effectsNegated),index===0);
  assert.deepEqual(resolved.state.players[0].grave.map(u=>u.id),[cost,spell]);
  assert.equal((await call(code,who,{type:'spellResponse',choice:'pass',expectedVersion})).status,409);
  await restart();assert.deepEqual((await call(code,who)).state,resolved.state);
 }
});
