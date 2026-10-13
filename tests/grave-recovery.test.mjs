import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'coc-grave-'));
process.env.DATA_DIR=temporary;
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
function setup(who=0){
 const r={players:[],units:{},logs:[],effects:[],turn:who,turnNumber:3,phase:'MAIN',status:'active',version:1};
 I.createPlayer(r,'22','A','a');I.createPlayer(r,'22','B','b');
 for(const p of r.players)p.turnsTaken=1;
 const take=(cardId,zone,side=who)=>{
  const id=Object.keys(r.units).find(id=>r.units[id].owner===side&&r.units[id].cardId===cardId);
  assert.ok(id,cardId);if(zone)I.move(r,id,zone,side);return id;
 };
 const sourceUnitId=take('COC-22-008','grave'),costUnitId=take('COC-22-001','field');
 const use=(body={})=>I.apply(r,who,'graveAbility',{sourceUnitId,costUnitId,...body});
 return {r,who,take,sourceUnitId,costUnitId,use};
}
test('fusion-up recovery spends exactly one attack, returns the same UID and logs its cost',()=>{
 const {r,sourceUnitId,costUnitId,use}=setup();
 const state=use();
 assert.ok(r.players[0].hand.includes(sourceUnitId));
 assert.ok(!r.players[0].grave.includes(sourceUnitId));
 assert.equal(r.units[costUnitId].attackCount,1);
 assert.equal(r.units[costUnitId].attackCountTurn,3);
 assert.equal(I.attackAvailable(r.units[costUnitId],3),false);
 assert.equal(state.players[1].hand,null);
 assert.match(r.logs.map(x=>x.text).join('\n'),/공격 기회 1회/);
});
test('recovery validates source, controller, monster type and available attack before spending anything',()=>{
 for(const change of [
  s=>I.move(s.r,s.sourceUnitId,'hand',0),
  s=>I.move(s.r,s.sourceUnitId,'grave',1),
  s=>I.move(s.r,s.costUnitId,'field',1),
  s=>I.move(s.r,s.costUnitId,'hand',0),
  s=>{s.costUnitId=s.take('COC-22-010','integration')},
  s=>{Object.assign(s.r.units[s.costUnitId],{attackCount:1,attackCountTurn:3})},
  s=>{s.r.phase='ATTACK'},
  s=>{s.r.pendingAttack={stage:'response'}},
  s=>{s.r.pendingManual={by:1}},
 ]){
  const s=setup();change(s);const before=structuredClone(s.r);
  assert.throws(()=>I.apply(s.r,0,'graveAbility',{sourceUnitId:s.sourceUnitId,costUnitId:s.costUnitId}));
  assert.deepEqual(s.r,before);
 }
});
test('recovery uses shared bonus attack accounting and survives JSON restoration without resetting limits',()=>{
 const s=setup(),u=s.r.units[s.costUnitId];
 Object.assign(u,{attackCount:1,attackCountTurn:3,bonusAttackTurn:3,bonusAttackCount:1});
 s.use();assert.equal(u.attackCount,2);assert.equal(I.attackAvailable(u,3),false);
 I.move(s.r,s.sourceUnitId,'grave',0);
 const restored=JSON.parse(JSON.stringify(s.r)),before=structuredClone(restored);
 assert.throws(()=>I.apply(restored,0,'graveAbility',{sourceUnitId:s.sourceUnitId,costUnitId:s.costUnitId}),/이번 턴/);
 assert.deepEqual(restored,before);
 restored.turnNumber=5;
 I.apply(restored,0,'graveAbility',{sourceUnitId:s.sourceUnitId,costUnitId:s.costUnitId});
 assert.ok(restored.players[0].hand.includes(s.sourceUnitId));
 assert.equal(restored.units[s.costUnitId].attackCount,1);
});
test('fusion and grave recovery have independent once-per-turn limits, checked before material costs',()=>{
 const s=setup();
 s.use(); // Recovery must not block effect 1.
 const a=s.take('COC-22-002','hand'),b=s.take('COC-22-003','hand');
 const extra=s.take('COC-22-014');
 I.apply(s.r,0,'extraSummon',{extraUnitId:extra,materials:[a,b],spellUnitId:s.sourceUnitId});
 const before=structuredClone(s.r);
 assert.throws(()=>s.use(),/이번 턴/);
 assert.deepEqual(s.r,before);
 I.move(s.r,s.sourceUnitId,'hand',0);
 const c=s.take('COC-22-004','hand'),d=s.take('COC-22-005','hand');
 const second=s.take('COC-22-015'),beforeSecond=structuredClone(s.r);
 assert.throws(()=>I.apply(s.r,0,'extraSummon',{extraUnitId:second,materials:[c,d],spellUnitId:s.sourceUnitId}),/이번 턴/);
 assert.deepEqual(s.r,beforeSecond);
});
test('effect 1 followed by recovery is legal and a normal hand-play cannot silently consume fusion-up',()=>{
 const s=setup();I.move(s.r,s.sourceUnitId,'hand',0);
 const before=structuredClone(s.r);assert.throws(()=>I.apply(s.r,0,'play',{unitId:s.sourceUnitId}),/엑스트라/);
 assert.deepEqual(s.r,before);
 const a=s.take('COC-22-002','hand'),b=s.take('COC-22-003','hand');
 I.apply(s.r,0,'extraSummon',{extraUnitId:s.take('COC-22-014'),materials:[a,b],spellUnitId:s.sourceUnitId});
 s.use();assert.ok(s.r.players[0].hand.includes(s.sourceUnitId));
});
test('AI grave recovery choices share validation and never depend on an opponent hand',()=>{
 const s=setup(1);s.r.aiDifficulty='hard';
 const choice=I.chooseAIGraveAbility(s.r);
 assert.deepEqual(choice,{sourceUnitId:s.sourceUnitId,costUnitId:s.costUnitId});
 const hidden=s.take('COC-22-003','hand',0);
 assert.deepEqual(I.chooseAIGraveAbility(s.r),choice);
 const publicEnemy=I.publicState(s.r,0);
 assert.deepEqual(publicEnemy.graveAbilities,[]);
 assert.equal(publicEnemy.players[1].hand,null);
 I.apply(s.r,1,'graveAbility',choice);
 assert.equal(I.chooseAIGraveAbility(s.r),null);
 assert.ok(s.r.players[0].hand.includes(hidden));
});
test('AI main loop executes grave recovery once and advances without retry loops',()=>{
 const s=setup(1);s.r.mode='ai';s.r.aiDifficulty='hard';
 I.runAI(s.r);
 assert.ok(s.r.players[1].hand.includes(s.sourceUnitId));
 assert.equal(s.r.units[s.costUnitId].attackCount,1);
 assert.equal(s.r.turn,0);
 assert.equal(s.r.logs.filter(x=>x.text.includes('묘지에서 패로 회수')).length,1);
 assert.ok(!s.r.logs.some(x=>/중단|건너뛰/.test(x.text)));
});
