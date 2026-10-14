import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-protect-barrier-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
function make(){
 const r={code:'BARRIER',status:'active',turn:0,turnNumber:1,phase:'MAIN',version:1,players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,'01','A','a');I.createPlayer(r,'27','B','b');
 r.players[0].turnsTaken=1;
 const place=(who,cardId,to)=>{
  const id=r.players[who].deck.find(x=>r.units[x].cardId===cardId);
  assert.ok(id,'missing '+cardId);I.move(r,id,to,who);return id;
 };
 return {r,place};
}
function activateBarrier(r,place){
 const barrier=place(0,'COC-01-009','hand');
 place(0,'COC-01-002','integration');
 I.apply(r,0,'play',{unitId:barrier});
 I.apply(r,1,'spellResponse',{choice:'pass'});
 assert.ok(r.players[0].grave.includes(barrier));
 return barrier;
}
test('barrier cannot be used when not integrated',()=>{
 const {r,place}=make(),spell=place(0,'COC-01-009','hand');
 assert.throws(()=>I.apply(r,0,'play',{unitId:spell}),/일체화/);
 assert.ok(r.players[0].hand.includes(spell));
});
test('barrier stops next-turn direct attacks without blocking attacks on monsters',()=>{
 const {r,place}=make();
 const own=place(0,'COC-01-001','field'),enemy=place(1,'COC-27-001','field');
 activateBarrier(r,place);
 r.turn=1;r.phase='ATTACK';r.turnNumber=2;r.players[1].turnsTaken=1;
 assert.throws(()=>I.apply(r,1,'attack',{attackerId:enemy,target:{type:'player',player:0}}),/직접 공격/);
 I.apply(r,1,'attack',{attackerId:enemy,target:{type:'unit',id:own}});
 assert.equal(r.pendingAttack?.target?.id,own);
});
test('barrier stops explicit enemy spell targets then expires on later opponent turn',()=>{
 const {r,place}=make();
 const enemySpell=place(1,'COC-27-006','hand');
 activateBarrier(r,place);
 r.turn=1;r.phase='MAIN';r.turnNumber=2;r.players[1].turnsTaken=1;
 assert.throws(()=>I.apply(r,1,'play',{unitId:enemySpell,target:{type:'player',player:0}}),/보호막/);
 assert.ok(r.players[1].hand.includes(enemySpell));
 r.turnNumber=4;r.players[1].turnsTaken=2;
 I.apply(r,1,'play',{unitId:enemySpell,target:{type:'player',player:0}});
 I.apply(r,0,'spellResponse',{choice:'pass'});
 assert.equal(r.players[0].hp,900);
});
test('when opponent removed the target, blocked direct attacks may legally terminate retarget',()=>{
 const {r,place}=make();
 const own=place(0,'COC-01-001','field'),enemy=place(1,'COC-27-001','field');
 activateBarrier(r,place);
 r.turn=1;r.phase='ATTACK';r.turnNumber=2;r.players[1].turnsTaken=1;
 I.apply(r,1,'attack',{attackerId:enemy,target:{type:'unit',id:own}});
 I.move(r,own,'grave',0);
 I.apply(r,0,'defend',{});
 assert.equal(r.pendingAttack?.stage,'retarget');
 I.apply(r,1,'retarget',{target:null});
 assert.equal(r.pendingAttack,null);
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
