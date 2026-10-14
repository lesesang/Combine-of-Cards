import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {declareEffect} from '../src/effect-runtime.mjs';
import {responseSpellIds} from '../src/spell-response-registry.mjs';
import {legalSpellCounters} from '../src/spell-counters.mjs';
import {legalSummonCounters} from '../src/summon-counters.mjs';
import {extraCounterFixture} from './helpers/extra-counter-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-field-counter-'));process.env.DATA_DIR=dir;
const {gameTestInternals:I}=await import('../server.mjs');test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const spellCards=['COC-12-001','COC-24-005'];
const fieldCards=['COC-12-001','COC-12-002','COC-24-005'];
function setup(){const r={code:'FIELD1',status:'active',version:1,turn:0,turnNumber:5,phase:'MAIN',mode:'pvp',players:[],units:{},logs:[],effects:[]};I.createPlayer(r,'12','A','a'.repeat(64));I.createPlayer(r,'24','B','b'.repeat(64));r.players.forEach(p=>p.turnsTaken=3);return r;}
const add=(r,cid,who,zone)=>{const id=I.instantiate(r,cid,who);I.move(r,id,zone,who);return id;};
const spell=r=>{const id=add(r,'COC-30-007',0,'hand');r.players[0].hp=100;I.apply(r,0,'play',{unitId:id});return id;};
const counter=(r,who,id)=>I.apply(r,who,'spellResponse',{choice:'counter',sourceUnitId:id});
const pass=(r,who)=>I.apply(r,who,'spellResponse',{choice:'pass'});
test('field counters: spell counters negate all 61 registered spells without consuming their own physical card',()=>{
 for(const cid of spellCards)for(const spellId of responseSpellIds){const r=setup(),source=add(r,cid,1,'field'),id=add(r,spellId,0,'hand');
  I.queueAutomatedSpell(r,0,id,I.cards.get(spellId),{});counter(r,1,source);pass(r,0);
  assert.ok(r.players[1].field.includes(source));assert.equal(r.units[source].counterUsedThisStay,true);assert.ok(r.players[0].grave.includes(id));assert.deepEqual(r.effectStack,[]);
  assert.equal(r.pendingSpell,null);assert.equal(r.pendingDeckSearch,undefined);
 }
});
test('field counters: latest opposing effect alone is legal and two or three counters resolve LIFO',()=>{
 for(const cid of spellCards)for(const count of [2,3]){const r=setup(),first=add(r,cid,1,'field'),second=add(r,'COC-12-002',0,'field'),third=add(r,'COC-12-002',1,'field');
  const spellOnly=add(r,'COC-24-005',0,'field');spell(r);counter(r,1,first);
  assert.deepEqual(legalSpellCounters(r,0),[second]);assert.throws(()=>counter(r,0,spellOnly),{status:409});
  counter(r,0,second);assert.deepEqual(legalSpellCounters(r,1),[third]);
  if(count===3)counter(r,1,third);const restored=JSON.parse(JSON.stringify(r));pass(restored,count===2?1:0);
  assert.equal(restored.players[0].hp,count===2?400:100);assert.equal(restored.pendingSpell,null);
  assert.equal(restored.units[first].counterUsedThisStay,true);assert.equal(restored.units[second].counterUsedThisStay,true);
 }
});
function prepare(r,cid){
 const who=cid==='COC-12-002'?0:1,source=add(r,cid,who,'field');
 const ready=()=>{spell(r);if(who===0)counter(r,1,add(r,'COC-12-001',1,'field'));};
 ready();return {who,source,ready,success:who===0?400:100,fizzle:who===0?100:400};
}
test('field counters: returning and resummoning resets only the field limit and invalidates the old declaration',()=>{
 for(const cid of fieldCards){const r=setup(),f=prepare(r,cid),{who,source}=f;counter(r,who,source);I.move(r,source,'hand',who);I.move(r,source,'field',who);
  assert.equal(r.units[source].counterUsedThisStay,undefined);pass(r,1-who);assert.equal(r.players[0].hp,f.fizzle);
  f.ready();assert.ok(legalSpellCounters(r,who).includes(source));counter(r,who,source);pass(r,1-who);assert.equal(r.players[0].hp,f.success);
  f.ready();assert.deepEqual(legalSpellCounters(r,who),[]);pass(r,who);
 }
 const r=setup(),source=add(r,'COC-12-001',1,'field');spell(r);counter(r,1,source);I.move(r,source,'field',0);I.move(r,source,'field',1);
 assert.equal(r.units[source].counterUsedThisStay,true);pass(r,0);assert.equal(r.players[0].hp,400);
});
test('field counters: source negation, wrong controller and invalid selection do not bypass legality',()=>{
 for(const cid of fieldCards){const r=setup(),{who,source,fizzle}=prepare(r,cid);r.units[source].effectsNegated=true;const before=structuredClone(r);
  assert.deepEqual(legalSpellCounters(r,who),[]);assert.throws(()=>counter(r,who,source),{status:409});assert.deepEqual(r,before);
  r.units[source].effectsNegated=false;counter(r,who,source);r.units[source].effectsNegated=true;pass(r,1-who);assert.equal(r.players[0].hp,fizzle);
 }
});
test('field counters: Wind Girl rejects every registered spell, Storm effect and raw summon without spending usage',()=>{
 assert.equal(I.cards.get('COC-12-002').effects[0],'1회 상대 몬스터의 효과를 무효로 합니다.');
 for(const spellId of responseSpellIds){const r=setup(),wind=add(r,'COC-12-002',1,'field'),id=add(r,spellId,0,'hand');I.queueAutomatedSpell(r,0,id,I.cards.get(spellId),{});
  const before=structuredClone(r);assert.deepEqual(legalSpellCounters(r,1),[]);assert.throws(()=>counter(r,1,wind),{status:409});assert.deepEqual(r,before);
 }
 const r=setup(),storm=add(r,'COC-14-001',1,'integration'),wind=add(r,'COC-12-002',0,'field');spell(r);counter(r,1,storm);
 const before=structuredClone(r);assert.deepEqual(legalSpellCounters(r,0),[]);assert.throws(()=>counter(r,0,wind),{status:409});assert.deepEqual(r,before);pass(r,0);assert.equal(r.players[0].hp,100);
 const f=extraCounterFixture(I,'COC-22-014'),wind0=add(f.r,'COC-12-002',0,'field'),wind1=add(f.r,'COC-12-002',1,'field');I.apply(f.r,0,'extraSummon',f.body);
 assert.deepEqual(legalSummonCounters(f.r,1),[f.counter]);let saved=structuredClone(f.r);
 assert.throws(()=>I.apply(f.r,1,'extraResponse',{choice:'counter',sourceUnitId:wind1}),{status:409});assert.deepEqual(f.r,saved);
 I.apply(f.r,1,'extraResponse',{choice:'counter',sourceUnitId:f.counter});assert.deepEqual(legalSummonCounters(f.r,0),[]);saved=structuredClone(f.r);
 assert.throws(()=>I.apply(f.r,0,'extraResponse',{choice:'counter',sourceUnitId:wind0}),{status:409});assert.deepEqual(f.r,saved);
 I.apply(f.r,0,'extraResponse',{choice:'pass'});assert.ok(f.r.players[0].extra.includes(f.extra));assert.equal(f.r.units[f.counter].spellCounterGameUsed,true);
});
// Reproduce serialized declarations emitted by PR #68 before the user corrected the scope.
function legacyWind(r,pending,who,sourceId,target){
 const e=declareEffect(r,{effectId:'card-counter',owner:who,sourceId,sourceZone:'field',payload:{cardId:'COC-12-002',targetSequence:target.sequence,sourceRevision:r.units[sourceId].fieldRevision||0}});
 r.units[sourceId].counterUsedThisStay=true;pending.counter={who,sourceId,sequence:e.sequence};pending.countersDeclared??=[];pending.countersDeclared.push(pending.counter);pending.awaiting=1-who;
 return JSON.parse(JSON.stringify(r));
}
test('field counters: legacy Wind Girl declarations against spells or integration effects fizzle on restore',()=>{
 for(const kind of ['spell','storm-spell','storm-summon']){
  let r,source,who,pending,extra;
  if(kind==='storm-summon'){const f=extraCounterFixture(I,'COC-22-014');r=f.r;extra=f.extra;source=add(r,'COC-12-002',0,'field');who=0;I.apply(r,0,'extraSummon',f.body);I.apply(r,1,'extraResponse',{choice:'counter',sourceUnitId:f.counter});pending=r.pendingExtraSummon;}
  else {r=setup();who=kind==='spell'?1:0;source=add(r,'COC-12-002',who,'field');spell(r);if(kind==='storm-spell')counter(r,1,add(r,'COC-14-001',1,'integration'));pending=r.pendingSpell;}
  const restored=legacyWind(r,pending,who,source,r.effectStack.at(-1));
  I.apply(restored,1-who,kind==='storm-summon'?'extraResponse':'spellResponse',{choice:'pass'});
  assert.deepEqual(restored.effectStack,[]);assert.equal(restored.units[source].counterUsedThisStay,true);
  if(kind!=='storm-summon')assert.equal(restored.players[0].hp,kind==='spell'?400:100);
  else {assert.ok(restored.players[0].extra.includes(extra));assert.ok(!restored.players[0].field.includes(extra));}
  assert.ok(restored.logs.some(l=>JSON.stringify(l).includes('상대 몬스터 효과가 아니므로 불발')));
 }
});
test('field counters: AI uses each legal field counter and answers a counter with Wind Girl',()=>{
 for(const level of ['easy','medium','hard'])for(const cid of spellCards){const r=setup(),source=add(r,cid,1,'field');r.mode='ai';r.aiDifficulty=level;spell(r);I.runAI(r);
  assert.equal(r.pendingSpell.counter.sourceId,source);pass(r,0);assert.equal(r.players[0].hp,100);
 }
 const r=setup(),source=add(r,'COC-12-001',1,'field'),wind=add(r,'COC-12-002',0,'field');r.mode='ai';spell(r);I.runAI(r);counter(r,0,wind);I.runAI(r);assert.equal(r.pendingSpell,null);assert.equal(r.players[0].hp,400);
});
test('field counters: all AI levels pass spells and Storm effects but counter opposing monster effects with Wind Girl',()=>{
 for(const level of ['easy','medium','hard']){
  const r=setup(),wind=add(r,'COC-12-002',1,'field');r.mode='ai';r.aiDifficulty=level;spell(r);I.runAI(r);assert.equal(r.pendingSpell,null);assert.equal(r.players[0].hp,400);assert.equal(r.units[wind].counterUsedThisStay,undefined);
  for(const cid of spellCards){const q=setup(),first=add(q,cid,1,'field'),second=add(q,'COC-12-002',0,'field'),third=add(q,'COC-12-002',1,'field');spell(q);counter(q,1,first);counter(q,0,second);q.mode='ai';q.aiDifficulty=level;I.runAI(q);assert.equal(q.pendingSpell.counter.sourceId,third);pass(q,0);assert.equal(q.players[0].hp,100);}
  // AI is player 1; test a spell cast by player 1 and countered by player 0's Storm.
  const q=setup(),storm=add(q,'COC-14-001',0,'integration'),qw=add(q,'COC-12-002',1,'field'),id=add(q,'COC-30-007',1,'hand');I.queueAutomatedSpell(q,1,id,I.cards.get('COC-30-007'),{});counter(q,0,storm);q.mode='ai';q.aiDifficulty=level;I.runAI(q);assert.equal(q.pendingSpell,null);assert.equal(q.units[qw].counterUsedThisStay,undefined);
 }
});
