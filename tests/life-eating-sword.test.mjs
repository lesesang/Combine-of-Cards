import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-life-sword-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
function setup(){
 const r={code:'SWORD',status:'active',version:1,mode:'pvp',turn:0,turnNumber:3,phase:'MAIN',
  players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null,
  pendingSpell:null,pendingTriggerOrder:null,pendingExtraSummon:null};
 I.createPlayer(r,'21','Caster','a');
 I.createPlayer(r,'03','Target','b');
 r.players[0].turnsTaken=2;r.players[1].turnsTaken=2;
 const source=r.players[0].deck.find(x=>r.units[x].cardId==='COC-21-002');
 assert.ok(source);I.move(r,source,'hand',0);
 const unit=I.instantiate(r,'COC-03-002',1);I.move(r,unit,'field',1);
 return {r,source,unit};
}
function playAndPass(r,source,target){
 const before=structuredClone(r);
 const step=I.apply(r,0,'play',{unitId:source,target});
 assert.equal(step.pendingSpell?.card.id,'COC-21-002');
 assert.ok(r.players[0].grave.includes(source),'the card goes to grave at declaration');
 assert.equal(r.effects.length,before.effects.length,'effect is not granted until response closes');
 I.apply(r,1,'spellResponse',{choice:'pass'});
 assert.equal(r.pendingSpell,null);
 assert.equal(r.effects.filter(x=>x.type==='lifeEatingSword').length,1);
 assert.equal(r.units[source].attachmentHostId,undefined);
}
test('confirmed sword: spell grants independent effect and never attaches as equipment',()=>{
 const {r,source,unit}=setup();
 r.units[unit].hp=100;
 playAndPass(r,source,{type:'unit',id:unit});
 assert.equal(r.units[unit].hp,100);
 assert.equal(r.units[unit].attachments,undefined);
 assert.deepEqual(r.effects[0].target,{kind:'unit',id:unit});
 const saved=JSON.parse(JSON.stringify(r));
 saved.turn=1;saved.turnNumber=4;
 I.processStartOfTurn(saved);
 assert.equal(saved.units[unit].hp,70);
 assert.equal(saved.units[unit].atk,r.units[unit].atk+100);
 assert.ok(saved.players[0].grave.includes(source),'the source spell stays in grave');
});
test('confirmed sword: HP 31 can pay, HP 30 and below fail at payment',()=>{
 for(const hp of [31,30,29,1]){
  const {r,source,unit}=setup();r.units[unit].hp=hp;
  playAndPass(r,source,{type:'unit',id:unit});
  r.turn=1;r.turnNumber=4;
  I.processStartOfTurn(r);
  if(hp>30){
   assert.equal(r.units[unit].hp,1);
   assert.ok(r.players[1].field.includes(unit));
  }else{
   assert.ok(r.players[1].grave.includes(unit),'cannot pay at '+hp);
   assert.equal(r.effects.length,0,'no lingering enchantment after destruction');
  }
 }
});
test('confirmed sword: non-payment for an integrated player is a loss, not destruction of the spell',()=>{
 for(const hp of [30,31]){
  const {r,source}=setup();
  const integration=I.instantiate(r,'COC-21-001',1);
  I.move(r,integration,'integration',1);
  r.players[1].hp=hp;
  playAndPass(r,source,{type:'player',player:1});
  r.turn=1;r.turnNumber=4;
  I.processStartOfTurn(r);
  if(hp===30){
   assert.equal(r.status,'finished');assert.equal(r.winner,0);
   assert.equal(r.players[1].hp,0);
  }else{
   assert.equal(r.status,'active');assert.equal(r.players[1].hp,1);
   assert.equal(r.players[1].playerAtkBonus,100);
   assert.equal(r.units[integration].playerAttackBonusApplied,100);
  }
  assert.ok(r.players[0].grave.includes(source));
 }
});
test('confirmed sword: invalid target is rejected before discarding the spell',()=>{
 const {r,source,unit}=setup();
 for(const target of [undefined,{type:'player',player:1},{type:'unit',id:source},{type:'unit',id:'forged'}]){
  const before=structuredClone(r);
  assert.throws(()=>I.apply(r,0,'play',{unitId:source,target}),/대상|일체화/);
  assert.deepEqual(r,before);
 }
 const original=structuredClone(r);
 assert.throws(()=>I.apply(r,0,'detach',{unitId:source}),/알 수 없는 행동/);
 assert.deepEqual(r,original);
});
test('confirmed sword: monster bearer pays only on own turn, not opponent turn',()=>{
 const {r,source,unit}=setup();r.units[unit].hp=100;
 playAndPass(r,source,{type:'unit',id:unit});
 I.processStartOfTurn(r);
 assert.equal(r.units[unit].hp,100);
 r.turn=1;r.turnNumber=4;I.processStartOfTurn(r);
 assert.equal(r.units[unit].hp,70);
 r.turn=0;r.turnNumber=5;I.processStartOfTurn(r);
 assert.equal(r.units[unit].hp,70);
 r.turn=1;r.turnNumber=6;I.processStartOfTurn(r);
 assert.equal(r.units[unit].hp,40);
});
test('confirmed sword: original spell stays in grave and effect ceases if target leaves field',()=>{
 const {r,source,unit}=setup();
 playAndPass(r,source,{type:'unit',id:unit});
 I.move(r,unit,'hand',1);
 r.turn=1;r.turnNumber=4;I.processStartOfTurn(r);
 assert.equal(r.effects.filter(x=>x.type==='lifeEatingSword').length,0);
 assert.ok(r.players[0].grave.includes(source));
 assert.ok(r.players[1].hand.includes(unit));
});
