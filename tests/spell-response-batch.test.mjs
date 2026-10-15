import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {batchResponseSpellIds,batchResponseTargets} from '../src/spell-response-targets.mjs';
import {batchFixture,assertBatchResult} from './helpers/spell-batch-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-batch-'));process.env.DATA_DIR=dir;
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const view=r=>JSON.parse(JSON.stringify({hp:r.players.map(p=>p.hp),units:r.units,effects:r.effects}));
test('batch: per-card success, counter and target cases',async suite=>{
for(const cardId of batchResponseSpellIds){
 await suite.test(`batch ${cardId}: waits, restores and resolves its actual effect`,t=>{
  t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?0:min);
  const f=batchFixture(I,cardId),before=structuredClone(view(f.r));
  I.apply(f.r,f.caster,'play',f.body);
  assert.equal(f.r.pendingSpell?.cardId,cardId);
  assert.ok(f.r.players[f.caster].grave.includes(f.spell));
  // Moving the spell resets only its own transient state, never its targets.
  delete before.units[f.spell];const during=structuredClone(view(f.r));delete during.units[f.spell];
  assert.deepEqual(during,before);
  f.r=JSON.parse(JSON.stringify(f.r));
  I.apply(f.r,f.other,'spellResponse',{choice:'pass'});
  assert.equal(f.r.pendingSpell,null);assertBatchResult(f,cardId);
 });
 await suite.test(`batch ${cardId}: counter consumes the spell without applying its effect`,()=>{
  const f=batchFixture(I,cardId);I.apply(f.r,f.caster,'play',f.body);
  const before=structuredClone(view(f.r));delete before.units[f.counter];
  I.apply(f.r,f.other,'spellResponse',{choice:'counter',sourceUnitId:f.counter});
  f.r=JSON.parse(JSON.stringify(f.r));I.apply(f.r,f.caster,'spellResponse',{choice:'pass'});
  const after=structuredClone(view(f.r));delete after.units[f.counter];
  assert.deepEqual(after,before);assert.ok(f.r.players[f.caster].grave.includes(f.spell));
 });
 if(batchResponseTargets[cardId])await suite.test(`batch ${cardId}: invalid declaration is free; lost target fizzles without retargeting`,()=>{
  const f=batchFixture(I,cardId),before=structuredClone(f.r);
  assert.throws(()=>I.apply(f.r,0,'play',{...f.body,target:{type:'unit',id:'missing'}}));assert.deepEqual(f.r,before);
  I.apply(f.r,0,'play',f.body);
  const uid=f.body.target.id;I.move(f.r,uid,'hand',f.r.units[uid].owner);
  const hp=f.r.players.map(p=>p.hp);
  I.apply(f.r,1,'spellResponse',{choice:'pass'});
  assert.equal(f.r.pendingSpell,null);assert.deepEqual(f.r.players.map(p=>p.hp),hp);
  assert.ok(f.r.logs.some(e=>e.text.includes('대상 소실')));
 });
}
});
test('batch: all 23 spells use the same AI pass/counter response across levels',()=>{
 for(const cardId of batchResponseSpellIds)for(const level of ['easy','medium','hard']){
  const f=batchFixture(I,cardId);f.r.mode='ai';f.r.aiDifficulty=level;
  I.apply(f.r,0,'play',f.body);I.runAI(f.r);
  assert.equal(f.r.pendingSpell?.awaiting,0,cardId+level);
  assert.equal(f.r.units[f.counter].spellCounterGameUsed,true);
  I.apply(f.r,0,'spellResponse',{choice:'pass'});assert.equal(f.r.pendingSpell,null);
 }
});
test('batch: activation conditions are checked before payment and are not recharged at resolution',()=>{
 const f=batchFixture(I,'COC-32-008');
 const land=f.r.players[0].field.find(id=>id&&I.H.name(f.r,id).includes('랜드'));
 I.move(f.r,land,'hand',0);const before=structuredClone(f.r);
 assert.throws(()=>I.apply(f.r,0,'play',{...f.body,activationValidated:true}),/랜드/);assert.deepEqual(f.r,before);
 I.move(f.r,land,'field',0);I.apply(f.r,0,'play',f.body);I.move(f.r,land,'grave',0);
 I.apply(f.r,1,'spellResponse',{choice:'pass'});assertBatchResult(f,'COC-32-008');
});
test('batch: Natural Selection destroys simultaneously and preserves owner-selected heal order',()=>{
 const f=batchFixture(I,'COC-30-001');
 const extra=I.H.summonToken(f.r,1,'batch victim',80,1500);
 f.r.effects.push(...[0,0,1].map(player=>({type:'firstDestroyHeal',player,turn:5})));
 I.apply(f.r,0,'play',f.body);I.apply(f.r,1,'spellResponse',{choice:'pass'});
 assert.ok(f.r.pendingTriggerOrder);assert.ok(f.r.players[1].grave.includes(f.target));
 assert.ok(!f.r.units[extra]);
 const keys=f.r.pendingTriggerOrder.effects.filter(e=>e.owner===0).map(e=>e.key).reverse();
 I.apply(f.r,0,'triggerOrder',{orderedKeys:keys});
 assert.equal(f.r.players[0].hp,4000);assert.equal(f.r.players[1].hp,2500);
});
test('batch: all 23 spells are actually selected and cast by every AI level',t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?(min===4?1:0):min);
 for(const cardId of batchResponseSpellIds)for(const level of ['easy','medium','hard']){
  const f=batchFixture(I,cardId,1);f.r.mode='ai';f.r.aiDifficulty=level;
  f.r.players[1].aiRejectedAbilities=[...f.r.players[1].field,f.r.players[1].integration].filter(Boolean);
  I.runAI(f.r);
  assert.equal(f.r.pendingSpell?.cardId,cardId,cardId+level);
  assert.ok(!f.r.logs.some(e=>e.text.includes('판정 중단')||e.text.includes('사용 불가능한')),cardId+level);
  I.apply(f.r,0,'spellResponse',{choice:'pass'});
  assert.equal(f.r.pendingSpell,null);
 }
});
test('batch: Kiln immunity blocks effect damage as well as battle, but permits healing and direct destruction',()=>{
 const f=batchFixture(I,'COC-19-005');I.apply(f.r,0,'play',f.body);I.apply(f.r,1,'spellResponse',{choice:'pass'});
 I.H.hurt(f.r,f.target,5000);assert.equal(f.r.units[f.target].hp,1000);
 I.H.healUnit(f.r,f.target,100);assert.equal(f.r.units[f.target].hp,1100);
 I.H.destroy(f.r,f.target);assert.ok(f.r.players[1].grave.includes(f.target));
 assert.equal(f.r.units[f.target].damageInvulnerable,undefined);
});
test('batch: Aggressive Storm may banish a chosen monster on either field',()=>{
 const f=batchFixture(I,'COC-14-003');f.body.target.id=f.ally;
 I.apply(f.r,0,'play',f.body);I.apply(f.r,1,'spellResponse',{choice:'pass'});
 assert.ok(f.r.players[0].banished.includes(f.ally));assert.ok(f.r.players[1].field.includes(f.target));
});
test('batch: Burning Armor can grant protection to a Burningdemons on either field',()=>{
 const r={code:'ARMANY',status:'active',version:1,turn:0,turnNumber:1,phase:'MAIN',players:[],units:{},logs:[],effects:[]};
 I.createPlayer(r,'20','Caster','a');I.createPlayer(r,'20','Enemy','b');
 const spell=r.players[0].deck.find(id=>r.units[id].cardId==='COC-20-011');
 const target=r.players[1].deck.find(id=>r.units[id].cardId==='COC-20-001');
 I.move(r,spell,'hand',0);I.move(r,target,'field',1);
 I.apply(r,0,'play',{unitId:spell,target:{type:'unit',id:target}});
 I.apply(r,1,'spellResponse',{choice:'pass'});
 assert.equal(r.units[target].effectDestructionImmune,true);
});
test('batch: maximum dice and all-tail branches retain their printed results',t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?0:max-1);
 for(const cardId of ['COC-17-005','COC-17-006','COC-20-004','COC-31-006','COC-31-008','COC-31-010','COC-32-005']){
  const f=batchFixture(I,cardId);I.apply(f.r,0,'play',f.body);I.apply(f.r,1,'spellResponse',{choice:'pass'});
  if(cardId==='COC-17-005')assert.equal(f.r.units[f.target].hp,600);
  if(cardId==='COC-17-006'){assert.equal(f.r.units[f.target].hp,800);assert.equal(f.r.players[1].hp,800);}
  if(cardId==='COC-20-004'){assert.equal(f.r.units[f.ally].atk,550);assert.equal(f.r.players[0].hp,500);}
  if(cardId==='COC-31-006')assert.equal(f.r.units[f.target].atk,80);
  if(cardId==='COC-31-008')assert.ok(f.r.players[1].field.includes(f.target));
  if(cardId==='COC-31-010'){assert.equal(f.r.units[f.ally].atk,50);assert.equal(f.r.units[f.target].hp,500);}
  if(cardId==='COC-32-005')assert.equal(f.r.players[1].hp,800);
 }
});
test('batch: unrestricted chosen damage targets include the caster and allied monsters',()=>{
 for(const [cardId,damage] of [['COC-06-007',300],['COC-27-006',100]]){
  for(const player of [true,false]){
   const f=batchFixture(I,cardId);f.body.target=player?{type:'player',player:0}:{type:'unit',id:f.ally};
   I.apply(f.r,0,'play',f.body);I.apply(f.r,1,'spellResponse',{choice:'pass'});
   assert.equal(player?f.r.players[0].hp:f.r.units[f.ally].hp,1000-damage);
  }
 }
});
test('batch: four elemental spells accept their named magician on either field',()=>{
 for(const [cardId,name] of [['COC-32-005','플레임'],['COC-32-006','워터'],['COC-32-007','윈드'],['COC-32-008','랜드']]){
  const f=batchFixture(I,cardId);
  const source=f.r.players[0].field.find(id=>id&&I.H.name(f.r,id).includes(name));
  I.move(f.r,source,'field',1);
  I.apply(f.r,0,'play',f.body);assert.equal(f.r.pendingSpell.cardId,cardId);
  I.apply(f.r,1,'spellResponse',{choice:'pass'});assert.equal(f.r.pendingSpell,null);
 }
});
