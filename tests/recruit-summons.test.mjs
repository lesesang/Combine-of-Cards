import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-field-six-'));process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const {gameTestInternals:I}=await import('../server.mjs');
import {remainingFieldFixture as fixture} from './helpers/remaining-field-fixture.mjs';
import {recruitChoices} from '../src/recruit-summons.mjs';
const start=f=>I.apply(f.r,f.who,'ability',f.body);
const pass=f=>I.apply(f.r,1-f.who,'abilityResponse',{choice:'pass'});
const choose=(f,id=f.croix)=>I.apply(f.r,f.who,'recruitChoice',{unitId:id});
const summon=f=>I.apply(f.r,f.r.pendingExtraSummon.awaiting??1-f.who,'extraResponse',{choice:'pass'});
test('Shuu recruit: controller chooses any Croix from hand deck grave after effect pass and summon pass',t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?0:min);
 for(const zone of ['hand','deck','grave']){const f=fixture(I,'COC-31-004');I.move(f.r,f.croix,zone,0);
  // Ignore printed enemy-monster condition: no opposing field monster remains.
  I.move(f.r,f.foe,'hand',1);I.move(f.r,f.wind,'hand',1);const handBefore=f.r.players[0].hand.length;
  start(f);assert.equal(f.r.pendingRecruitChoice,undefined);pass(f);assert.ok(f.r.pendingRecruitChoice);assert.equal(f.r.pendingExtraSummon,undefined);
  f.r=JSON.parse(JSON.stringify(f.r));choose(f);assert.ok(f.r.players[0][zone].includes(f.croix));assert.equal(f.r.pendingExtraSummon.recipe.method,'recruit');
  f.r=JSON.parse(JSON.stringify(f.r));summon(f);assert.ok(f.r.players[0].field.includes(f.croix));assert.equal(f.r.players[0].hand.length,handBefore+(zone==='hand'?0:1));assert.equal(f.r.pendingExtraSummon,null);
 }
});
test('Shuu recruit: private choices are owner-only sorted IDs and forbidden actions cannot probe hands',()=>{
 const f=fixture(I,'COC-31-004');f.add('COC-31-001',0,'deck');f.add('COC-31-001',0,'hand');start(f);pass(f);
 assert.equal(I.publicState(f.r,1).pendingRecruitChoice.choices,undefined);assert.equal(I.publicState(f.r,1).players[0].hand,null);
 assert.equal(I.publicState(f.r,0).pendingRecruitChoice.choices.length,3);const before=structuredClone(f.r);
 assert.throws(()=>I.apply(f.r,1,'recruitChoice',{unitId:f.croix}),{status:409});assert.deepEqual(f.r,before);
 assert.throws(()=>choose(f,f.foe),{status:409});assert.deepEqual(f.r,before);
 for(const type of ['phase','play','ability','elementalChoice','manual','draw'])assert.throws(()=>I.apply(f.r,0,type,{}),{status:409});
 const choices=recruitChoices(f.r,0);f.r.players[0].deck.reverse();assert.deepEqual(recruitChoices(f.r,0),choices);
});
test('Shuu recruit: Storm negates every origin without summon triggers or a refunded usage',()=>{
 for(const zone of ['hand','deck','grave']){const f=fixture(I,'COC-31-004'),storm=f.add('COC-14-001',1,'integration');I.move(f.r,f.croix,zone,0);
  start(f);pass(f);choose(f);assert.deepEqual(I.publicState(f.r,1).pendingExtraSummon.counters.map(c=>c.sourceUnitId),[storm]);const beforeHand=f.r.players[0].hand.length;
  I.apply(f.r,1,'extraResponse',{choice:'counter',sourceUnitId:storm});f.r=JSON.parse(JSON.stringify(f.r));summon(f);
  assert.ok(f.r.players[0][zone].includes(f.croix));assert.equal(f.r.players[0].hand.length,beforeHand);assert.equal(f.r.units[storm].spellCounterGameUsed,true);assert.throws(()=>start(f),/이번 턴/);
 }
});
test('Shuu recruit: lost source before resolution fizzles but departure after resolution cannot undo selection',()=>{
 const f=fixture(I,'COC-31-004');start(f);I.move(f.r,f.source,'hand',0);pass(f);assert.equal(f.r.pendingRecruitChoice,undefined);
 const g=fixture(I,'COC-31-004');start(g);pass(g);I.move(g.r,g.source,'hand',0);choose(g);summon(g);assert.ok(g.r.players[0].field.includes(g.croix));
});
test('Shuu recruit: full fields and missing or moved candidates fizzle without arbitrary substitution',()=>{
 const f=fixture(I,'COC-31-004');start(f);f.add('COC-21-009',0,'field');f.add('COC-21-009',0,'field');pass(f);assert.equal(f.r.pendingRecruitChoice,undefined);
 const g=fixture(I,'COC-31-004');start(g);pass(g);I.move(g.r,g.croix,'banished',0);choose(g);assert.equal(g.r.pendingRecruitChoice,null);assert.equal(g.r.pendingExtraSummon,undefined);
 const h=fixture(I,'COC-31-004');start(h);pass(h);choose(h);I.move(h.r,h.croix,'hand',0);summon(h);assert.ok(h.r.players[0].hand.includes(h.croix));
});
test('Shuu recruit: AI picks its own candidate, waits for human summon response and counters human summon',t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?(min===3?1:0):min);
 for(const level of ['easy','medium','hard']){
  const f=fixture(I,'COC-31-004',1);f.r.mode='ai';f.r.aiDifficulty=level;I.runAI(f.r);assert.equal(f.r.pendingAbility.cardId,'COC-31-004');pass(f);I.runAI(f.r);assert.equal(f.r.pendingExtraSummon.extraUnitId,f.croix);summon(f);assert.ok(f.r.players[1].field.includes(f.croix));
  const g=fixture(I,'COC-31-004'),storm=g.add('COC-14-001',1,'integration');g.r.mode='ai';g.r.aiDifficulty=level;start(g);I.runAI(g.r);assert.ok(g.r.pendingRecruitChoice);choose(g);I.runAI(g.r);assert.equal(g.r.pendingExtraSummon.counter.sourceId,storm);summon(g);assert.ok(g.r.players[0].grave.includes(g.croix));
 }
});
