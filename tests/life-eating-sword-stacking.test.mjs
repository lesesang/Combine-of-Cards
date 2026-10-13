import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-sword-stack-'));
process.env.DATA_DIR=dir;
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
function setup(){
 const r={code:'SWORDSTACK',status:'active',version:1,mode:'pvp',
  turn:0,turnNumber:3,phase:'MAIN',players:[],units:{},logs:[],effects:[],
  pendingAttack:null,pendingManual:null,pendingSpell:null,pendingExtraSummon:null,pendingTriggerOrder:null};
 I.createPlayer(r,'21','Sword','a');
 I.createPlayer(r,'03','Victim','b');
 r.players[0].turnsTaken=2;r.players[1].turnsTaken=2;
 return r;
}
function unit(r,card,who,hp=500,atk=100){
 const id=I.instantiate(r,card,who);
 I.move(r,id,'field',who);
 r.units[id].hp=hp;r.units[id].atk=atk;
 return id;
}
function grant(r,who,target,count=1){
 const ids=[];
 for(let i=0;i<count;i++){
  const spell=(i===0&&r.players[who].deck.find(id=>r.units[id].cardId==='COC-21-002'))||
   I.instantiate(r,'COC-21-002',who);
  I.move(r,spell,'hand',who);
  I.apply(r,who,'play',{unitId:spell,target});
  I.apply(r,1-who,'spellResponse',{choice:'pass'});
  ids.push(spell);
 }
 return ids;
}
function ownTurn(r,who,turnNumber){
 r.turn=who;r.turnNumber=turnNumber;r.phase='DRAW';
 I.processStartOfTurn(r);
}
function attackPhase(r,who){
 r.turn=who;r.phase='MAIN';
 I.apply(r,who,'phase',{});
 assert.equal(r.phase,'ATTACK');
}
function fixedAttackKill(r,source,victim,controller){
 r.units[source].diceMin=1;r.units[source].diceMax=1;
 r.units[victim].hp=1;
 I.apply(r,controller,'attack',{attackerId:source,target:{type:'unit',id:victim}});
 I.apply(r,1-controller,'defend',{});
 assert.ok(r.players[1-controller].grave.includes(victim));
}
test('sword: no payment at turn start, payment and +100 only when attack phase starts',()=>{
 const r=setup(),bearer=unit(r,'COC-21-007',0,200,100);
 grant(r,0,{type:'unit',id:bearer});
 I.processStartOfTurn(r);
 assert.equal(r.units[bearer].hp,200);
 assert.equal(r.units[bearer].atk,100);
 attackPhase(r,0);
 assert.equal(r.units[bearer].hp,170);
 assert.equal(r.units[bearer].atk,200);
 I.processEndOfTurn(r);
 ownTurn(r,1,4);
 assert.equal(r.units[bearer].hp,170);
 ownTurn(r,0,5);
 assert.equal(r.units[bearer].hp,170);
 attackPhase(r,0);
 assert.equal(r.units[bearer].hp,140);
 assert.equal(r.units[bearer].atk,300);
});
test('sword: skip attack phase never charges HP or grants +100',()=>{
 const r=setup(),bearer=unit(r,'COC-21-007',0,150,100);
 grant(r,0,{type:'unit',id:bearer},2);
 I.apply(r,0,'phase',{skipAttack:true});
 assert.equal(r.phase,'END');
 assert.equal(r.units[bearer].hp,150);
 assert.equal(r.units[bearer].atk,100);
});
test('sword: duplicate independent effects each charge 30 and apply +100',()=>{
 for(const n of [1,2,3,4]){
  const r=setup(),bearer=unit(r,'COC-21-007',0,500,100);
  const sources=grant(r,0,{type:'unit',id:bearer},n);
  assert.equal(r.effects.filter(e=>e.type==='lifeEatingSword').length,n);
  assert.ok(sources.every(id=>r.players[0].grave.includes(id)));
  assert.ok(sources.every(id=>!r.units[id].attachmentHostId));
  attackPhase(r,0);
  assert.equal(r.units[bearer].hp,500-30*n);
  assert.equal(r.units[bearer].atk,100+100*n);
 }
});
test('sword: sequential payment fails on fourth duplicate when HP is exhausted',()=>{
 const r=setup(),bearer=unit(r,'COC-21-007',0,95,100);
 grant(r,0,{type:'unit',id:bearer},4);
 attackPhase(r,0);
 assert.ok(r.players[0].grave.includes(bearer));
 assert.equal(r.effects.filter(e=>e.type==='lifeEatingSword').length,0);
});
test('sword: several enchantments and one battle kill grant x2, x4, x8, x16 next own turn only',()=>{
 for(let n=1;n<=4;n++){
  const r=setup(),attacker=unit(r,'COC-03-002',1,900,100);
  grant(r,0,{type:'unit',id:attacker},n);
  ownTurn(r,1,4);
  assert.equal(I.swordActualAttack(r,attacker),100);
  attackPhase(r,1);
  assert.equal(r.units[attacker].atk,100+100*n);
  const foe=unit(r,'COC-21-007',0,1,30);
  fixedAttackKill(r,attacker,foe,1);
  assert.equal(I.swordMultiplierCount(r,attacker,{getZone:I.H.zone}),0,
   'a kill never doubles during its own turn');
  assert.ok(r.effects.every(e=>e.type!=='lifeEatingSword'||e.pendingDoubleTurns?.length===1));
  I.processEndOfTurn(r);
  ownTurn(r,0,5);
  assert.equal(I.swordActualAttack(r,attacker),r.units[attacker].atk);
  ownTurn(r,1,6);
  const expected=r.units[attacker].atk*2**n;
  assert.equal(I.swordActualAttack(r,attacker),expected);
  const state=I.publicState(r,1);
  assert.equal(state.players[1].field.find(u=>u?.id===attacker).atk,expected);
  assert.equal(state.players[1].field.find(u=>u?.id===attacker).swordDoubleStacks,n);
  I.processEndOfTurn(r);
  assert.equal(I.swordActualAttack(r,attacker),r.units[attacker].atk,
   'x2 stack is gone after one own turn');
 }
});
test('sword: two independent effect kills produce 4x even from one enchanted source',()=>{
 const r=setup(),attacker=unit(r,'COC-03-002',1,900,100);
 grant(r,0,{type:'unit',id:attacker});
 ownTurn(r,1,4);attackPhase(r,1);
 const a=unit(r,'COC-21-007',0,10,20);
 const b=unit(r,'COC-21-008',0,10,20);
 I.H.destroy(r,a,{sourceId:attacker});
 I.H.hurt(r,b,100,{sourceId:attacker});
 assert.equal(r.effects[0].pendingDoubleTurns.length,2);
 I.processEndOfTurn(r);
 ownTurn(r,0,5);
 ownTurn(r,1,6);
 assert.equal(I.swordActualAttack(r,attacker),r.units[attacker].atk*4);
});
test('sword: a source-kill only counts enemy monsters and does not reward sacrifices',()=>{
 const r=setup(),attacker=unit(r,'COC-03-002',1,900,100);
 grant(r,0,{type:'unit',id:attacker});
 ownTurn(r,1,4);attackPhase(r,1);
 const allied=unit(r,'COC-21-007',1,50,20);
 I.H.destroy(r,allied,{sourceId:attacker});
 assert.deepEqual(r.effects[0].pendingDoubleTurns??[],[]);
 const enemy=unit(r,'COC-21-007',0,50,20);
 I.H.destroy(r,enemy); // no claimed source: cannot award the sword proc
 assert.deepEqual(r.effects[0].pendingDoubleTurns??[],[]);
});
test('sword: independent pending kill records and next-turn buffs survive JSON reload',()=>{
 const r=setup(),attacker=unit(r,'COC-03-002',1,900,100);
 grant(r,0,{type:'unit',id:attacker},3);
 ownTurn(r,1,4);attackPhase(r,1);
 const foe=unit(r,'COC-21-007',0,1,30);
 fixedAttackKill(r,attacker,foe,1);
 let saved=JSON.parse(JSON.stringify(r));
 I.processEndOfTurn(saved);
 ownTurn(saved,0,5);
 ownTurn(saved,1,6);
 assert.equal(I.swordActualAttack(saved,attacker),saved.units[attacker].atk*8);
 saved=JSON.parse(JSON.stringify(saved));
 assert.equal(I.swordActualAttack(saved,attacker),saved.units[attacker].atk*8);
 I.processEndOfTurn(saved);
 assert.equal(I.swordActualAttack(saved,attacker),saved.units[attacker].atk);
});
test('sword: attack dice actually use x16, and main-phase changes to base attack are preserved',()=>{
 const r=setup(),attacker=unit(r,'COC-03-002',1,1000,100);
 grant(r,0,{type:'unit',id:attacker},4);
 ownTurn(r,1,4);attackPhase(r,1);
 const first=unit(r,'COC-21-007',0,1,30);
 fixedAttackKill(r,attacker,first,1);
 I.processEndOfTurn(r);ownTurn(r,0,5);ownTurn(r,1,6);
 const base=r.units[attacker].atk;
 r.units[attacker].atk+=20;
 attackPhase(r,1);
 const boosted=I.swordActualAttack(r,attacker);
 assert.equal(boosted,(base+20+400)*16);
 const victim=unit(r,'COC-21-007',0,boosted+100,30);
 r.units[attacker].diceMin=boosted;
 r.units[attacker].diceMax=boosted;
 I.apply(r,1,'attack',{attackerId:attacker,target:{type:'unit',id:victim}});
 I.apply(r,0,'defend',{});
 assert.equal(r.units[victim].hp,100);
 assert.ok(r.logs.some(e=>e.type==='damage'&&e.text.includes(`1d${boosted} = ${boosted}`)));
 I.processEndOfTurn(r);
 assert.equal(I.swordActualAttack(r,attacker),r.units[attacker].atk);
});
test('sword: player-targeted duplicates lose exactly when the next 30 cannot be paid',()=>{
 const r=setup(),integrated=I.instantiate(r,'COC-21-001',0);
 I.move(r,integrated,'integration',0);
 grant(r,0,{type:'player',player:0},4);
 r.players[0].hp=95;
 attackPhase(r,0);
 assert.equal(r.status,'finished');
 assert.equal(r.winner,1);
 assert.equal(r.players[0].hp,0);
});
