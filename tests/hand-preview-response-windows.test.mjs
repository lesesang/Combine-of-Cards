import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-hand-preview-window-'));
process.env.DATA_DIR=tmp;
process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const tokens=['a'.repeat(64),'b'.repeat(64)];

function fixture(code){
 const r={code,status:'active',turn:0,turnNumber:3,phase:'MAIN',version:1,
  players:[],units:{},logs:[],effects:[],mode:'pvp',
  pendingAttack:null,pendingExtraSummon:null,pendingSpell:null,
  pendingTriggerOrder:null,pendingManual:null};
 I.createPlayer(r,'13','Thief',tokens[0]);I.createPlayer(r,'03','Opponent',tokens[1]);
 r.players[0].turnsTaken=2;r.players[1].turnsTaken=2;
 const take=(who,card,to)=>{
  const id=r.players[who].deck.find(uid=>r.units[uid].cardId===card);
  assert.ok(id,'test deck does not contain '+card);
  I.move(r,id,to,who);
  return id;
 };
 const thief=take(0,'COC-13-008','hand');
 const hidden=take(1,'COC-03-002','hand');
 return {r,take,thief,hidden};
}
const queued=fixture('PREV01');
const spell=queued.take(0,'COC-13-007','hand');
const triggered=fixture('PREV02');
const victim=triggered.take(1,'COC-03-005','field');
triggered.r.units[victim].hp=120;
for(let i=0;i<2;i++)triggered.r.effects.push({type:'firstDestroyHeal',player:0,turn:3});
I.H.destroyBatch(triggered.r,[victim]);
assert.equal(triggered.r.pendingTriggerOrder?.awaiting[0],0);
fs.writeFileSync(path.join(tmp,'rooms.json'),JSON.stringify({PREV01:queued.r,PREV02:triggered.r}));
const {createApp}=await import('../server.mjs?handWindowValidation=api');
const server=createApp();let base;
test.before(async()=>{await new Promise(done=>server.listen(0,'127.0.0.1',done));base='http://127.0.0.1:'+server.address().port});
test.after(async()=>{await new Promise(done=>server.close(done));fs.rmSync(tmp,{recursive:true,force:true})});
async function get(route,who=0){
 const response=await fetch(base+route,{headers:{authorization:'Bearer '+tokens[who]}});
 return {status:response.status,data:await response.json()};
}
async function act(code,who,type,payload={}){
 const snapshot=await get('/api/rooms/'+code,who);
 const response=await fetch(base+'/api/rooms/'+code+'/actions',{
  method:'POST',headers:{authorization:'Bearer '+tokens[who],'content-type':'application/json'},
  body:JSON.stringify({type,expectedVersion:snapshot.data.version,...payload})
 });
 return {status:response.status,data:await response.json()};
}
test('R17/R01: legal preview closes during a spell response and reopens after pass',async()=>{
 const preview='/api/rooms/PREV01/hand-preview';
 const initial=await get(preview);
 assert.equal(initial.status,200);
 assert.deepEqual(initial.data.cards.map(c=>c.id),[queued.hidden]);
 const played=await act('PREV01',0,'play',{unitId:spell});
 assert.equal(played.status,200,JSON.stringify(played.data));
 assert.equal(played.data.pendingSpell.card.id,'COC-13-007');
 const blocked=await get(preview);
 assert.equal(blocked.status,403);
 assert.equal(JSON.stringify(blocked.data).includes(queued.hidden),false);
 const publicState=await get('/api/rooms/PREV01');
 assert.equal(publicState.data.players[1].hand,null);
 assert.equal(JSON.stringify(publicState.data).includes(queued.hidden),false);
 const passed=await act('PREV01',1,'spellResponse',{choice:'pass'});
 assert.equal(passed.status,200,JSON.stringify(passed.data));
 assert.equal(passed.data.pendingSpell,null);
 const after=await get(preview);
 assert.equal(after.status,200);
 assert.deepEqual(after.data.cards.map(c=>c.id),[queued.hidden]);
});
test('R17/R02: concurrent trigger ordering never grants permission to inspect private hand',async()=>{
 const preview='/api/rooms/PREV02/hand-preview';
 const protectedState=await get(preview);
 assert.equal(protectedState.status,403);
 assert.equal(JSON.stringify(protectedState.data).includes(triggered.hidden),false);
 const visible=await get('/api/rooms/PREV02');
 assert.equal(visible.status,200);
 assert.equal(visible.data.pendingTriggerOrder.awaiting,0);
 assert.equal(visible.data.players[1].hand,null);
 const keys=visible.data.pendingTriggerOrder.options.map(x=>x.key);
 assert.equal(keys.length,2);
 const completed=await act('PREV02',0,'triggerOrder',{orderedKeys:keys});
 assert.equal(completed.status,200,JSON.stringify(completed.data));
 assert.equal(completed.data.pendingTriggerOrder,null);
 const legal=await get(preview);
 assert.equal(legal.status,200);
 assert.deepEqual(legal.data.cards.map(c=>c.id),[triggered.hidden]);
});
