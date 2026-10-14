import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {responseSpellIds} from '../src/spell-response-registry.mjs';
import {legalSpellCounters} from '../src/spell-counters.mjs';
import {legalSummonCounters} from '../src/summon-counters.mjs';
import {extraCounterFixture} from './helpers/extra-counter-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-field-counter-'));process.env.DATA_DIR=dir;
const {gameTestInternals:I}=await import('../server.mjs');test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const fieldCards=['COC-12-001','COC-12-002','COC-24-005'];
function setup(){const r={code:'FIELD1',status:'active',version:1,turn:0,turnNumber:5,phase:'MAIN',mode:'pvp',players:[],units:{},logs:[],effects:[]};I.createPlayer(r,'12','A','a'.repeat(64));I.createPlayer(r,'24','B','b'.repeat(64));r.players.forEach(p=>p.turnsTaken=3);return r;}
const add=(r,cid,who,zone)=>{const id=I.instantiate(r,cid,who);I.move(r,id,zone,who);return id;};
const spell=r=>{const id=add(r,'COC-30-007',0,'hand');r.players[0].hp=100;I.apply(r,0,'play',{unitId:id});return id;};
const counter=(r,who,id)=>I.apply(r,who,'spellResponse',{choice:'counter',sourceUnitId:id});
const pass=(r,who)=>I.apply(r,who,'spellResponse',{choice:'pass'});
test('field counters: all three negate all 61 registered spells without consuming their own physical card',()=>{
 for(const cid of fieldCards)for(const spellId of responseSpellIds){const r=setup(),source=add(r,cid,1,'field'),id=add(r,spellId,0,'hand');
  I.queueAutomatedSpell(r,0,id,I.cards.get(spellId),{});counter(r,1,source);pass(r,0);
  assert.ok(r.players[1].field.includes(source));assert.equal(r.units[source].counterUsedThisStay,true);assert.ok(r.players[0].grave.includes(id));assert.deepEqual(r.effectStack,[]);
  assert.equal(r.pendingSpell,null);assert.equal(r.pendingDeckSearch,undefined);
 }
});
test('field counters: latest opposing effect alone is legal and two or three counters resolve LIFO',()=>{
 for(const count of [2,3]){const r=setup(),first=add(r,'COC-12-001',1,'field'),second=add(r,'COC-12-002',0,'field'),third=add(r,'COC-12-002',1,'field');
  const spellOnly=add(r,'COC-24-005',0,'field');spell(r);counter(r,1,first);
  assert.deepEqual(legalSpellCounters(r,0),[second]);assert.throws(()=>counter(r,0,spellOnly),{status:409});
  counter(r,0,second);assert.deepEqual(legalSpellCounters(r,1),[third]);
  if(count===3)counter(r,1,third);const restored=JSON.parse(JSON.stringify(r));pass(restored,count===2?1:0);
  assert.equal(restored.players[0].hp,count===2?400:100);assert.equal(restored.pendingSpell,null);
  assert.equal(restored.units[first].counterUsedThisStay,true);assert.equal(restored.units[second].counterUsedThisStay,true);
 }
});
test('field counters: returning and resummoning resets only the field limit and invalidates the old declaration',()=>{
 for(const cid of fieldCards){const r=setup(),source=add(r,cid,1,'field');spell(r);counter(r,1,source);I.move(r,source,'hand',1);I.move(r,source,'field',1);
  assert.equal(r.units[source].counterUsedThisStay,undefined);pass(r,0);assert.equal(r.players[0].hp,400);
  spell(r);assert.ok(legalSpellCounters(r,1).includes(source));counter(r,1,source);pass(r,0);
  spell(r);assert.deepEqual(legalSpellCounters(r,1),[]);pass(r,1);
 }
 const r=setup(),source=add(r,'COC-12-001',1,'field');spell(r);counter(r,1,source);I.move(r,source,'field',0);I.move(r,source,'field',1);
 assert.equal(r.units[source].counterUsedThisStay,true);pass(r,0);assert.equal(r.players[0].hp,400);
});
test('field counters: source negation, wrong controller and invalid selection do not bypass legality',()=>{
 for(const cid of fieldCards){const r=setup(),id=add(r,cid,1,'field');spell(r);r.units[id].effectsNegated=true;const before=structuredClone(r);
  assert.deepEqual(legalSpellCounters(r,1),[]);assert.throws(()=>counter(r,1,id),{status:409});assert.deepEqual(r,before);
  r.units[id].effectsNegated=false;counter(r,1,id);r.units[id].effectsNegated=true;pass(r,0);assert.equal(r.players[0].hp,400);
 }
});
test('field counters: Wind Girl negates Storm summon counter but does not negate a raw summon',()=>{
 for(const level of ['easy','medium','hard']){const f=extraCounterFixture(I,'COC-22-014');const wind=add(f.r,'COC-12-002',0,'field');add(f.r,'COC-12-002',1,'field');
  I.apply(f.r,0,'extraSummon',f.body);assert.deepEqual(legalSummonCounters(f.r,1),[f.counter]);
  I.apply(f.r,1,'extraResponse',{choice:'counter',sourceUnitId:f.counter});assert.deepEqual(legalSummonCounters(f.r,0),[wind]);
  I.apply(f.r,0,'extraResponse',{choice:'counter',sourceUnitId:wind});I.apply(f.r,1,'extraResponse',{choice:'pass'});
  assert.ok(f.r.players[0].field.includes(f.extra));assert.equal(f.r.units[f.counter].spellCounterGameUsed,true);
 }
});
test('field counters: AI uses each legal field counter and answers a counter with Wind Girl',()=>{
 for(const level of ['easy','medium','hard'])for(const cid of fieldCards){const r=setup(),source=add(r,cid,1,'field');r.mode='ai';r.aiDifficulty=level;spell(r);I.runAI(r);
  assert.equal(r.pendingSpell.counter.sourceId,source);pass(r,0);assert.equal(r.players[0].hp,100);
 }
 const r=setup(),source=add(r,'COC-12-001',1,'field'),wind=add(r,'COC-12-002',0,'field');r.mode='ai';spell(r);I.runAI(r);counter(r,0,wind);I.runAI(r);assert.equal(r.pendingSpell,null);assert.equal(r.players[0].hp,400);
});
