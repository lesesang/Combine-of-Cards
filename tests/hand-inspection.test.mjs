import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-hand-inspect-'));
process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const tokens=['a'.repeat(64),'b'.repeat(64)];
const r={code:'HAND17',players:[],units:{},logs:[],effects:[],mode:'pvp',
 status:'active',turn:0,turnNumber:3,phase:'MAIN',version:1,
 pendingAttack:null,pendingExtraSummon:null,pendingManual:null};
I.createPlayer(r,'13','Thief',tokens[0]);I.createPlayer(r,'03','Victim',tokens[1]);
r.players[0].turnsTaken=1;r.players[1].turnsTaken=1;
const pick=(who,cardId)=>{
 const id=r.players[who].deck.find(id=>r.units[id].cardId===cardId);
 assert.ok(id,cardId);
 I.move(r,id,'hand',who);return id;
};
const thief=pick(0,'COC-13-008');
const target=pick(1,'COC-03-002'),other=pick(1,'COC-03-005');
fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify({HAND17:r}));
const {createApp}=await import('../server.mjs?handR17=api');
const server=createApp();let base;
test.before(async()=>{await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base='http://127.0.0.1:'+server.address().port});
test.after(async()=>{await new Promise(ok=>server.close(ok));fs.rmSync(dir,{recursive:true,force:true})});
async function api(pathname,{who=0,method='GET',body,auth=true}={}){
 const headers={'content-type':'application/json'};
 if(auth)headers.authorization='Bearer '+tokens[who];
 const response=await fetch(base+pathname,{method,headers,body:body?JSON.stringify(body):undefined});
 return {status:response.status,json:await response.json()};
}
const room='/api/rooms/HAND17',preview=room+'/hand-preview';
test('R17: only the current legal card holder can view all opposing hand cards',async()=>{
 const missing=await api(preview,{auth:false});assert.equal(missing.status,401);
 const opponent=await api(preview,{who:1});assert.equal(opponent.status,403);
 const own=await api(preview);assert.equal(own.status,200);
 assert.deepEqual(new Set(own.json.cards.map(c=>c.id)),new Set([target,other]));
 assert.ok(own.json.cards.every(c=>typeof c.name==='string'));
 const view=await api(room,{who:0});assert.equal(view.status,200);
 assert.equal(view.json.players[1].hand,null);
 assert.ok(!JSON.stringify(view.json).includes(target));
 assert.ok(!JSON.stringify(view.json).includes(other));
});
test('R17: invalid choice fails atomically, explicit legitimate choice moves exactly one',async()=>{
 const illegal=await api(room+'/actions',{method:'POST',body:{type:'play',unitId:thief,
  target:{type:'unit',id:'forged'},expectedVersion:1}});
 assert.equal(illegal.status,409);
 const intact=await api(room);assert.equal(intact.json.version,1);
 assert.equal(intact.json.players[1].handCount,2);
 const chosen=await api(room+'/actions',{method:'POST',body:{type:'play',unitId:thief,
  target:{type:'unit',id:target},expectedVersion:1}});
 assert.equal(chosen.status,200,JSON.stringify(chosen.json));
 assert.equal(chosen.json.players[1].hand,null);
 assert.ok(chosen.json.players[1].grave.some(u=>u.id===target));
 assert.equal(chosen.json.players[1].handCount,1);
 assert.ok(!JSON.stringify(chosen.json).includes(other));
 const afterwards=await api(preview);assert.equal(afterwards.status,403,'preview closes after the source was used');
});
