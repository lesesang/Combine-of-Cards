import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'coc-crash-'));
process.env.DATA_DIR=temporary;
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
function setup(who=0){
 const r={players:[],units:{},logs:[],effects:[],turn:who,turnNumber:1,phase:'MAIN',status:'active',version:1};
 I.createPlayer(r,'12','A','a');I.createPlayer(r,'12','B','b');
 for(const p of r.players)p.turnsTaken=1;
 const take=(cardId,zone,side=who)=>{const id=Object.keys(r.units).find(id=>r.units[id].owner===side&&r.units[id].cardId===cardId);assert.ok(id);I.move(r,id,zone,side);return id};
 const sourceUnitId=take('COC-12-013','field'),costCardId=take('COC-12-001','hand'),target=take('COC-12-002','field',1-who);
 const use=(body={})=>I.apply(r,who,'ability',{sourceUnitId,costCardId,target:{type:'unit',id:target},...body});
 return {r,take,sourceUnitId,costCardId,target,use};
}
test('Crash Voltage discards chosen hand cost and destroys an opposing monster once per own turn',()=>{
 const s=setup();s.use();
 assert.ok(s.r.players[0].grave.includes(s.costCardId));
 assert.ok(s.r.players[1].grave.includes(s.target));
 assert.ok(s.r.players[0].field.includes(s.sourceUnitId));
 assert.equal(s.r.players[1].hp,1000,'effect destruction does not deal piercing damage');
 assert.throws(()=>s.use(),/이번 턴/);
 assert.match(s.r.logs.map(x=>x.text).join('\n'),/버렸/);
});
test('Crash Voltage rejects invalid cost/target, negated source and opponent control without mutation',()=>{
 for(const change of [
  s=>I.move(s.r,s.costCardId,'grave',0),
  s=>I.move(s.r,s.target,'hand',1),
  s=>I.move(s.r,s.target,'field',0),
  s=>I.move(s.r,s.sourceUnitId,'field',1),
  s=>{s.r.units[s.sourceUnitId].effectsNegated=true},
 ]){
  const s=setup();change(s);const before=structuredClone(s.r);
  assert.throws(()=>s.use());assert.deepEqual(s.r,before);
 }
});
test('direct destruction protection preserves target while the paid cost and usage are consumed',()=>{
 const s=setup();s.r.units[s.target].effectDestructionImmune=true;s.use();
 assert.ok(s.r.players[1].field.includes(s.target));assert.ok(s.r.players[0].grave.includes(s.costCardId));
 assert.throws(()=>s.use(),/이번 턴/);
});
test('Crash Voltage battle destruction deals only the actual damage exceeding prior HP',()=>{
 for(const {hp,immune,expected} of [{hp:30,expected:70},{hp:100,expected:0},{hp:150,expected:0},{hp:30,immune:true,expected:0}]){
  const s=setup(),u=s.r.units[s.sourceUnitId];
  s.r.phase='ATTACK';u.atk=100;u.diceMin=100;s.r.units[s.target].hp=hp;
  s.r.units[s.target].battleInvulnerable=!!immune;
  I.apply(s.r,0,'attack',{attackerId:s.sourceUnitId,target:{type:'unit',id:s.target}});
  I.apply(s.r,1,'defend',{});
  assert.equal(s.r.players[1].hp,1000-expected);
 }
});
test('AI can use Crash Voltage through the same field ability action and avoid protected targets',()=>{
 const s=setup(1);s.r.aiDifficulty='hard';
 const choice=I.chooseAIFieldAbility(s.r);
 assert.equal(choice.sourceUnitId,s.sourceUnitId);assert.equal(choice.costCardId,s.costCardId);
 I.apply(s.r,1,'ability',choice);assert.ok(s.r.players[0].grave.includes(s.target));
 const protectedGame=setup(1);protectedGame.r.units[protectedGame.target].effectDestructionImmune=true;
 assert.equal(I.chooseAIFieldAbility(protectedGame.r),null);
});
test('AI main loop pays the discard, resolves destruction and then declares its normal attack',()=>{
 const s=setup(1);s.r.mode='ai';s.r.aiDifficulty='hard';
 I.runAI(s.r);
 assert.ok(s.r.players[1].grave.includes(s.costCardId));
 assert.ok(s.r.players[0].grave.includes(s.target));
 assert.equal(s.r.pendingAttack?.attackerId,s.sourceUnitId);
 assert.ok(!s.r.logs.some(x=>/중단|건너뛰/.test(x.text)));
});
