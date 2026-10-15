import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {evolutionRules,evolutionSpellIds} from '../src/evolution.mjs';
import {deckSearchSpellIds,eligibleSearchIds,deckSearchView} from '../src/deck-search.mjs';
import {evolutionSearchFixture as fixture} from './helpers/evolution-search-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-evolve-'));process.env.DATA_DIR=dir;
const {gameTestInternals:I}=await import('../server.mjs');test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const play=f=>I.apply(f.r,f.caster,'play',f.body),pass=f=>I.apply(f.r,f.other,'spellResponse',{choice:'pass'});
test('evolution: all seven replace base ATK, preserve buffs and identity, and restore originals',async t=>{
 for(const cid of evolutionSpellIds)await t.test(cid,()=>{
  for(const destination of ['hand','deck','grave']){
   const f=fixture(I,cid),before=structuredClone(f.r.units[f.source]);play(f);
   assert.deepEqual(f.r.units[f.source],before);f.r=JSON.parse(JSON.stringify(f.r));pass(f);
   const u=f.r.units[f.source],expected=Math.max(0,Number(I.cards.get(evolutionRules[cid].target).atk)||0);
   assert.equal(u.id,before.id);assert.equal(u.owner,before.owner);assert.equal(u.cardId,evolutionRules[cid].target);
   assert.equal(u.atk,expected+50);assert.equal(u.baseAtk,expected);assert.equal(u.hp,null);
   assert.equal(u.attackCount,1);assert.equal(u.attackCountTurn,f.r.turnNumber);
   if(cid==='COC-30-009'){assert.equal(f.r.players[0].hp,1600);assert.ok(f.body.costDeckIds.every(id=>f.r.players[0].grave.includes(id)));}
   I.move(f.r,f.source,destination,0);assert.equal(u.cardId,f.oldCard);assert.equal(u.evolutionOriginalCardId,undefined);
   assert.equal(u.atk,Math.max(0,Number(I.cards.get(f.oldCard).atk)||0));assert.equal(u.hp,null);
  }
 });
});
test('evolution: counter and source exit or re-entry cannot evolve a replacement',()=>{
 for(const cid of evolutionSpellIds)for(const mode of ['counter','exit','reenter']){
  const f=fixture(I,cid);play(f);
  if(mode==='counter'){I.apply(f.r,1,'spellResponse',{choice:'counter',sourceUnitId:f.counter});I.apply(f.r,0,'spellResponse',{choice:'pass'});}
  else{I.move(f.r,f.source,'hand',0);if(mode==='reenter')I.move(f.r,f.source,'integration',0);pass(f);}
  assert.equal(f.r.units[f.source].cardId,f.oldCard,cid+mode);
  if(cid==='COC-30-009'){assert.equal(f.r.players[0].hp,1000);assert.ok(f.body.costDeckIds.every(id=>f.r.players[0].grave.includes(id)));}
 }
});
test('evolution: declaration rejects wrong source, HP and deck costs without mutation',()=>{
 for(const cid of evolutionSpellIds){
  const f=fixture(I,cid);I.move(f.r,f.source,'hand',0);const before=structuredClone(f.r);
  assert.throws(()=>I.apply(f.r,0,'play',{...f.body,evolutionSourceId:f.source,evolutionSourceCardId:f.oldCard,evolutionRevision:0}),{status:409});assert.deepEqual(f.r,before);
 }
 for(const change of [f=>f.body.costDeckIds=[],f=>f.body.costDeckIds=[f.body.costDeckIds[0],f.body.costDeckIds[0]],f=>f.body.costDeckIds[0]=f.spell]){
  const f=fixture(I,'COC-30-009');change(f);const before=structuredClone(f.r);assert.throws(()=>play(f),{status:409});assert.deepEqual(f.r,before);
 }
 const f=fixture(I,'COC-20-007');f.r.players[0].hp=501;assert.throws(()=>play(f),/500/);
});
test('evolution: confirmed Sword and player bonuses survive base replacement without duplicate payment',()=>{
 const f=fixture(I,'COC-03-003'),p=f.r.players[0],u=f.r.units[f.source];
 p.playerAtkBonus=100;u.playerAttackBonusApplied=100;u.atk+=100;
 f.r.effects=[{type:'lifeEatingSword',caster:0,target:{kind:'player',player:0},activeDoubleTurn:f.r.turnNumber,activeDoubleCount:2,pendingDoubleTurns:[]}];
 play(f);pass(f);assert.equal(u.atk,300);assert.equal(I.swordActualAttack(f.r,f.source),1200);assert.equal(p.hp,1000);
 I.processSwordAttackPhase(f.r,0,{getZone:I.H.zone,destroy:I.H.destroy,outcome:I.H.outcome,log:I.H.log});
 assert.equal(p.hp,970);assert.equal(u.atk,400);assert.equal(u.playerAttackBonusApplied,200);
 I.move(f.r,f.source,'hand',0);I.move(f.r,f.source,'integration',0);assert.equal(u.atk,300);
});
test('search: all four expose sorted eligible choices only after pass and let the owner choose',async t=>{
 for(const cid of deckSearchSpellIds)await t.test(cid,()=>{
  const f=fixture(I,cid),choices=eligibleSearchIds(f.r,0,cid,I.cards),selected=choices.at(-1);assert.ok(selected);
  const order=[...f.r.players[0].deck];play(f);assert.equal(I.publicState(f.r,0).pendingDeckSearch,null);
  if(cid==='COC-07-004')assert.equal(f.r.players[1].hand.length,1);
  pass(f);assert.ok(f.r.pendingDeckSearch);assert.equal(f.r.players[0].hand.length,0);
  assert.equal(I.publicState(f.r,1).pendingDeckSearch.choices,undefined);
  assert.deepEqual(I.publicState(f.r,0).pendingDeckSearch.choices.map(x=>x.id),choices);
  const before=structuredClone(f.r);assert.throws(()=>I.apply(f.r,1,'deckSearch',{unitId:selected}),{status:403});
  assert.throws(()=>I.apply(f.r,0,'phase',{}),{status:409});assert.throws(()=>I.apply(f.r,0,'deckSearch',{unitId:f.spell}),{status:409});assert.deepEqual(f.r,before);
  f.r=JSON.parse(JSON.stringify(f.r));I.apply(f.r,0,'deckSearch',{unitId:selected});
  assert.ok(f.r.players[0].hand.includes(selected));assert.equal(f.r.pendingDeckSearch,null);
  assert.deepEqual(f.r.players[0].deck,order.filter(id=>id!==selected));
  assert.equal(I.publicState(f.r,1).players[0].hand,null);assert.ok(f.r.logs.some(x=>x.type==='search'&&x.text.includes(I.cards.get(f.r.units[selected].cardId).name)));
 });
});
test('search: counter keeps the Banquet draw cost, closes choices and never searches',()=>{
 for(const cid of deckSearchSpellIds){const f=fixture(I,cid);play(f);I.apply(f.r,1,'spellResponse',{choice:'counter',sourceUnitId:f.counter});
  I.apply(f.r,0,'spellResponse',{choice:'pass'});assert.equal(f.r.pendingDeckSearch,undefined);assert.equal(f.r.players[0].hand.length,0);
  assert.equal(f.r.players[1].hand.length,cid==='COC-07-004'?1:0);
 }
});
test('search: empty results, lost choices, concede and reload loss finish without a stuck selection',()=>{
 for(const cid of deckSearchSpellIds){const f=fixture(I,cid);for(const id of eligibleSearchIds(f.r,0,cid,I.cards))I.move(f.r,id,'grave',0);
  play(f);pass(f);assert.ok(!f.r.pendingDeckSearch);
 }
 const f=fixture(I,'COC-24-008');play(f);pass(f);for(const id of [...f.r.pendingDeckSearch.choices])I.move(f.r,id,'grave',0);
 I.apply(f.r,0,'deckSearch',{});assert.equal(f.r.pendingDeckSearch,null);
 const g=fixture(I,'COC-20-003');play(g);pass(g);I.apply(g.r,1,'concede',{});assert.equal(g.r.pendingDeckSearch,null);
 const h=fixture(I,'COC-07-004');for(const id of [...h.r.players[1].deck])I.move(h.r,id,'banished',1);h.r.players[1].hp=100;
 play(h);assert.equal(h.r.status,'finished');assert.equal(h.r.pendingSpell,null);assert.equal(h.r.pendingDeckSearch,null);
});
test('evolution/search: three AI levels use all eleven spells and complete private selection',t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?(min===4?1:0):min);
 for(const cid of [...evolutionSpellIds,...deckSearchSpellIds])for(const level of ['easy','medium','hard']){
  const f=fixture(I,cid,1);f.r.mode='ai';f.r.aiDifficulty=level;f.r.players[1].aiRejectedAbilities=[...f.r.players[1].field,f.source].filter(Boolean);
  I.runAI(f.r);assert.equal(f.r.pendingSpell?.cardId,cid,cid+level);pass(f);
  if(deckSearchSpellIds.includes(cid)){
   assert.ok(f.r.pendingDeckSearch);const eligible=[...f.r.pendingDeckSearch.choices];
   I.runAI(f.r);assert.equal(f.r.pendingDeckSearch,null);assert.ok(eligible.some(id=>!f.r.players[1].deck.includes(id)));
  }else assert.equal(f.r.units[f.source].cardId,evolutionRules[cid].target);
 }
});
