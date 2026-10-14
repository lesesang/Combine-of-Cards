import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SUPPORTED_EXTRA_IDS} from '../src/extra-summons.mjs';
import {legalSummonCounters} from '../src/summon-counters.mjs';
import {legalSpellCounters} from '../src/spell-counters.mjs';
import {extraCounterFixture as fixture} from './helpers/extra-counter-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-summon-counter-'));process.env.DATA_DIR=dir;
const {gameTestInternals:I}=await import('../server.mjs');test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const summon=f=>I.apply(f.r,f.caster,'extraSummon',f.body),counter=f=>I.apply(f.r,f.other,'extraResponse',{choice:'counter',sourceUnitId:f.counter}),pass=f=>I.apply(f.r,f.caster,'extraResponse',{choice:'pass'});
test('summon counter: all 21 recipes keep the monster in extra and retain spent costs without summon effects',async t=>{
 for(const cid of SUPPORTED_EXTRA_IDS)await t.test(cid,()=>{
  const f=fixture(I,cid);summon(f);assert.equal(f.r.players[0].field.includes(f.extra),false);
  assert.deepEqual(legalSummonCounters(f.r,1),[f.counter]);assert.equal(I.publicState(f.r,0).pendingExtraSummon.counters.length,0);
  counter(f);assert.equal(f.r.units[f.counter].spellCounterGameUsed,true);assert.equal(f.r.effectStack.length,2);
  f.r=JSON.parse(JSON.stringify(f.r));pass(f);
  assert.equal(f.r.pendingExtraSummon,null);assert.equal(f.r.effectStack.length,0);
  assert.ok(f.r.players[0].extra.includes(f.extra));assert.ok(f.materials.every(id=>f.r.players[0].grave.includes(id)));
  if(f.spell)assert.ok(f.r.players[0].grave.includes(f.spell));
  assert.equal(f.r.units[f.extra].overlayMaterials,undefined);assert.ok(!f.r.logs.some(x=>x.type==='fusion'));
  assert.equal(f.r.players[0].hand.length,0);
 });
});
test('summon counter: all 21 pass paths still summon and attach only after response',()=>{
 for(const cid of SUPPORTED_EXTRA_IDS){const f=fixture(I,cid);summon(f);I.apply(f.r,1,'extraResponse',{choice:'pass'});assert.ok(f.r.players[0].field.includes(f.extra),cid);assert.equal(f.r.effectStack.length,0);}
});
test('summon counter: source departure, negation and re-entry fizzle but spend the shared limit',()=>{
 for(const mode of ['leave','negated','reenter','changed']){const f=fixture(I,'COC-22-014');summon(f);counter(f);
  if(mode==='changed')f.r.units[f.counter].cardId='COC-03-001';
  else if(mode==='negated')f.r.units[f.counter].effectsNegated=true;
  else{I.move(f.r,f.counter,'hand',1);if(mode==='reenter')I.move(f.r,f.counter,'integration',1);}
  pass(f);assert.ok(f.r.players[0].field.includes(f.extra));assert.equal(f.r.units[f.counter].spellCounterGameUsed,true);
 }
});
test('summon counter: invalid identity, duplicate counter and serialization failure preserve declaration state',()=>{
 const f=fixture(I,'COC-22-014');summon(f);const before=structuredClone(f.r);
 assert.throws(()=>I.apply(f.r,0,'extraResponse',{choice:'counter',sourceUnitId:f.counter}),{status:403});
 assert.throws(()=>I.apply(f.r,1,'extraResponse',{choice:'counter',sourceUnitId:f.extra}),{status:409});assert.deepEqual(f.r,before);
 f.r.effectSequence=Number.MAX_SAFE_INTEGER;const full=structuredClone(f.r);assert.throws(()=>counter(f),/overflow/);assert.deepEqual(f.r,full);
 f.r.effectSequence=before.effectSequence;counter(f);const after=structuredClone(f.r);assert.throws(()=>counter(f),{status:403});assert.deepEqual(f.r,after);
});
test('summon counter: spell and summon clauses share the physical once-per-game limit',()=>{
 for(const order of ['spell-first','summon-first']){
  const f=fixture(I,'COC-22-014');
  const spell=I.instantiate(f.r,'COC-13-007',0);I.move(f.r,spell,'hand',0);
  if(order==='spell-first'){
   I.apply(f.r,0,'play',{unitId:spell});I.apply(f.r,1,'spellResponse',{choice:'counter',sourceUnitId:f.counter});I.apply(f.r,0,'spellResponse',{choice:'pass'});
   summon(f);assert.deepEqual(legalSummonCounters(f.r,1),[]);
  }else{
   summon(f);counter(f);pass(f);I.move(f.r,f.counter,'hand',1);I.move(f.r,f.counter,'integration',1);
   I.apply(f.r,0,'play',{unitId:spell});assert.deepEqual(legalSpellCounters(f.r,1),[]);
  }
 }
});
test('summon counter: Wakeup returns from grave at end even when summon is negated, but not from another zone',()=>{
 for(const moved of [false,true]){
  const f=fixture(I,'COC-32-011');summon(f);counter(f);pass(f);
  if(moved)I.move(f.r,f.spell,'deck',0);I.processEndOfTurn(f.r);
  assert.equal(f.r.players[0].hand.includes(f.spell),!moved);assert.ok(f.r.players[0].extra.includes(f.extra));
 }
});
test('summon counter: old pass-only saves restore and all AI levels counter and acknowledge',()=>{
 const f=fixture(I,'COC-22-014');summon(f);delete f.r.pendingExtraSummon.sequence;f.r.effectStack=[];counter(f);pass(f);assert.ok(f.r.players[0].extra.includes(f.extra));
 const old=fixture(I,'COC-32-011');summon(old);delete old.r.pendingExtraSummon.sequence;old.r.effectStack=[];old.r.effects=[];counter(old);pass(old);I.processEndOfTurn(old.r);assert.ok(old.r.players[0].hand.includes(old.spell));
 for(const level of ['easy','medium','hard']){
  const g=fixture(I,'COC-22-014');g.r.mode='ai';g.r.aiDifficulty=level;summon(g);I.runAI(g.r);assert.equal(g.r.pendingExtraSummon.awaiting,0);pass(g);assert.ok(g.r.players[0].extra.includes(g.extra));
  const h=fixture(I,'COC-22-014',1);h.r.mode='ai';h.r.aiDifficulty=level;summon(h);counter(h);I.runAI(h.r);assert.equal(h.r.pendingExtraSummon,null);assert.ok(h.r.players[1].extra.includes(h.extra));
 }
});

test('summon counter: concede clears the stack and pass cannot summon a moved extra card',()=>{
 const f=fixture(I,'COC-22-014');summon(f);counter(f);I.apply(f.r,0,'concede',{});
 assert.equal(f.r.pendingExtraSummon,null);assert.deepEqual(f.r.effectStack,[]);assert.ok(f.r.players[0].extra.includes(f.extra));assert.ok(f.r.players[0].grave.includes(f.spell));
 const g=fixture(I,'COC-22-014');summon(g);I.move(g.r,g.extra,'grave',0);I.apply(g.r,1,'extraResponse',{choice:'pass'});
 assert.ok(g.r.players[0].grave.includes(g.extra));assert.equal(g.r.players[0].field.includes(g.extra),false);assert.equal(g.r.pendingExtraSummon,null);
});
