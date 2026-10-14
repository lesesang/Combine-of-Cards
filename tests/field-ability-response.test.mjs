import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {FIELD_RESPONSE_IDS} from '../src/field-ability-effects.mjs';
import {queueFieldAbility,finishFieldAbility,legalAbilityCounters} from '../src/ability-responses.mjs';
import {fieldAbilityFixture} from './helpers/field-ability-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-ability-response-'));process.env.DATA_DIR=dir;
const {gameTestInternals:I}=await import('../server.mjs');test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const start=f=>I.apply(f.r,f.who,'ability',f.body);
const pass=(f,who=1-f.who)=>I.apply(f.r,who,'abilityResponse',{choice:'pass'});
const counter=(f,who=1-f.who,id=f.wind)=>I.apply(f.r,who,'abilityResponse',{choice:'counter',sourceUnitId:id});
function assertUnresolved(f){assert.ok(f.r.players[1-f.who].field.includes(f.target)||f.cardId==='COC-22-010');assert.ok(f.r.players[f.who].deck.includes(f.search));assert.equal(f.r.units[f.target].bonusAttackCount,undefined);}
function assertResolved(f){
 const p=f.r.players[f.who],q=f.r.players[1-f.who];
 switch(f.cardId){
 case 'COC-03-002':assert.ok(p.hand.includes(f.search));break;
 case 'COC-05-004':assert.ok(q.deck.includes(f.target));break;
 case 'COC-12-013':assert.ok(q.grave.includes(f.target));break;
 case 'COC-13-001':case 'COC-13-005':assert.ok(p.field.includes(f.target));assert.equal(f.r.units[f.target].owner,1-f.who);if(f.cardId==='COC-13-005')assert.equal(q.hp,950);break;
 case 'COC-13-002':assert.ok([...p.field,...q.field].includes(f.target));assert.ok(f.r.logs.some(l=>/1d2 = [12]/.test(l.text)));break;
 case 'COC-22-010':assert.equal(f.r.units[f.target].bonusAttackCount,1);break;
 }
}
test('field response batch: seven declarations defer effects, preserve paid costs and resolve after pass',()=>{
 for(const cid of FIELD_RESPONSE_IDS){const f=fieldAbilityFixture(I,cid);start(f);assertUnresolved(f);
  assert.equal(f.r.pendingAbility.cardId,cid);if(cid==='COC-12-013')assert.ok(f.r.players[0].grave.includes(f.cost));if(cid==='COC-22-010')assert.equal(f.r.units[f.source].attackCount,1);
  for(const action of ['phase','play','ability','graveAbility','manual','extraSummon']){const before=structuredClone(f.r);assert.throws(()=>I.apply(f.r,0,action,f.body),{status:409});assert.deepEqual(f.r,before);}
  f.r=JSON.parse(JSON.stringify(f.r));const conceded=structuredClone(f.r);I.apply(conceded,1,'concede',{});assert.equal(conceded.pendingAbility,null);assert.deepEqual(conceded.effectStack,[]);
  pass(f);assert.equal(f.r.pendingAbility,null);assertResolved(f);assert.deepEqual(f.r.effectStack,[]);
 }
});
test('field response batch: Wind Girl negates five monster effects but never the two integrations',()=>{
 for(const cid of FIELD_RESPONSE_IDS){const f=fieldAbilityFixture(I,cid);const storm=f.add('COC-14-001',1,'integration'),blast=f.add('COC-12-001',1,'field');start(f);
  assert.deepEqual(legalAbilityCounters(f.r,1),f.integration?[]:[f.wind]);
  for(const id of [storm,blast,...(f.integration?[f.wind]:[])]){const before=structuredClone(f.r);assert.throws(()=>counter(f,1,id),{status:409});assert.deepEqual(f.r,before);}
  if(f.integration){pass(f);assertResolved(f);continue;}
  counter(f);f.r=JSON.parse(JSON.stringify(f.r));pass(f,0);assertUnresolved(f);assert.equal(f.r.units[f.wind].counterUsedThisStay,true);
  if(cid==='COC-12-013')assert.ok(f.r.players[0].grave.includes(f.cost));assert.equal(f.r.units[f.source].effectUsage[`${cid}:1`],5);
 }
});
test('field response batch: counter-counter LIFO restores the original monster effect',()=>{
 for(const cid of FIELD_RESPONSE_IDS.filter(c=>!['COC-13-001','COC-22-010'].includes(c))){const f=fieldAbilityFixture(I,cid),ownWind=f.add('COC-12-002',0,'field');start(f);counter(f);counter(f,0,ownWind);pass(f,1);assertResolved(f);}
});
test('field response batch: source removal, re-entry, negation and control transfer fizzle all seven effects',()=>{
 for(const cid of FIELD_RESPONSE_IDS)for(const change of ['leave','reenter','negate','control']){const f=fieldAbilityFixture(I,cid);start(f);
  if(change==='negate')f.r.units[f.source].effectsNegated=true;
  else {I.move(f.r,f.source,'hand',0);if(change!=='leave')I.move(f.r,f.source,f.integration?'integration':'field',change==='control'?1:0);}
  pass(f);assertUnresolved(f);if(cid==='COC-12-013')assert.ok(f.r.players[0].grave.includes(f.cost));
 }
});
test('field response batch: invalid declarations preserve state and target movement fizzles without refund',()=>{
 for(const cid of FIELD_RESPONSE_IDS){const f=fieldAbilityFixture(I,cid);f.r.units[f.source].effectsNegated=true;let before=structuredClone(f.r);assert.throws(()=>start(f),{status:409});assert.deepEqual(f.r,before);f.r.units[f.source].effectsNegated=false;
  if(cid==='COC-03-002'){I.move(f.r,f.search,'hand',0);}else{f.body.target={type:'unit',id:'missing'};}
  before=structuredClone(f.r);assert.throws(()=>start(f),{status:409});assert.deepEqual(f.r,before);
 }
 for(const cid of FIELD_RESPONSE_IDS.filter(c=>c!=='COC-03-002')){const f=fieldAbilityFixture(I,cid);start(f);I.move(f.r,f.target,'hand',f.r.units[f.target].owner);pass(f);assert.ok(f.r.players[f.r.units[f.target].owner].hand.includes(f.target));assert.equal(f.r.units[f.target].bonusAttackCount,undefined);}
});
test('field response batch: paid costs and turn limits survive negation and frozen Kaiser still pays attack rights',()=>{
 const f=fieldAbilityFixture(I,'COC-12-013');start(f);counter(f);pass(f,0);f.body.costCardId=f.add('COC-12-008',0,'hand');const before=structuredClone(f.r);assert.throws(()=>start(f),/이번 턴/);assert.deepEqual(f.r,before);f.r.turnNumber+=2;start(f);assert.ok(f.r.players[0].grave.includes(f.body.costCardId));pass(f);assertResolved(f);
 const k=fieldAbilityFixture(I,'COC-22-010');k.r.units[k.source].frozen=true;k.r.units[k.source].cannotAttack=true;start(k);assert.equal(k.r.units[k.source].attackCount,1);I.move(k.r,k.target,'grave',0);pass(k);assert.equal(k.r.units[k.source].attackCount,1);assert.throws(()=>start(k),/이번 턴/);
});
test('field response batch: coin RNG runs only at resolution and full fields prevent capture',()=>{
 for(const roll of [1,2]){const f=fieldAbilityFixture(I,'COC-13-002');let calls=0;const H={...I.H,roll:()=>{calls++;return roll;}};queueFieldAbility(f.r,0,f.body,H);assert.equal(calls,0);finishFieldAbility(f.r,H);assert.equal(calls,1);assert.equal(f.r.players[0].field.includes(f.target),roll===1);}
 const f=fieldAbilityFixture(I,'COC-13-002');let calls=0;queueFieldAbility(f.r,0,f.body,I.H);counter(f);finishFieldAbility(f.r,{...I.H,roll:()=>{calls++;return 1;}});assert.equal(calls,0);
 const g=fieldAbilityFixture(I,'COC-13-005');start(g);g.add('COC-12-008',0,'field');g.add('COC-12-009',0,'field');pass(g);assert.ok(g.r.players[1].field.includes(g.target));assert.equal(g.r.players[1].hp,1000);
});
test('field response batch: failed declaration and resolution atomically restore costs, stack and response window',()=>{
 const f=fieldAbilityFixture(I,'COC-12-013');f.r.effectSequence=Number.MAX_SAFE_INTEGER;let before=structuredClone(f.r);assert.throws(()=>start(f),/overflow/);assert.deepEqual(f.r,before);
 delete f.r.effectSequence;before=structuredClone(f.r);assert.throws(()=>queueFieldAbility(f.r,0,f.body,{...I.H,move:(...args)=>{I.move(...args);throw new Error('cost failure');}}),/cost failure/);assert.deepEqual(f.r,before);
 start(f);before=structuredClone(f.r);assert.throws(()=>finishFieldAbility(f.r,{...I.H,destroy:()=>{f.r.players[1].hp=0;throw new Error('injected failure');}}),/injected/);assert.deepEqual(f.r,before);pass(f);assertResolved(f);
});
test('field response batch: AI uses monster-only counters at all levels and waits for human responses',()=>{
 for(const level of ['easy','medium','hard'])for(const cid of FIELD_RESPONSE_IDS){const f=fieldAbilityFixture(I,cid);f.r.mode='ai';f.r.aiDifficulty=level;start(f);I.runAI(f.r);
  if(f.integration){assert.equal(f.r.pendingAbility,null);assertResolved(f);}else{assert.equal(f.r.pendingAbility.counter.sourceId,f.wind);pass(f,0);assertUnresolved(f);}
 }
 for(const cid of FIELD_RESPONSE_IDS){const f=fieldAbilityFixture(I,cid,1);f.r.mode='ai';f.r.aiDifficulty='hard';I.runAI(f.r);assert.equal(f.r.pendingAbility.cardId,cid);assertUnresolved(f);}
});
test('field response batch: Thief M uses actual multiplied ATK and Crash retains destruction triggers',()=>{
 const f=fieldAbilityFixture(I,'COC-13-005');f.r.effects.push({type:'lifeEatingSword',target:{kind:'unit',id:f.target},activeDoubleTurn:5,activeDoubleCount:2});start(f);pass(f);assert.equal(f.r.players[1].hp,800);
 const c=fieldAbilityFixture(I,'COC-12-013');c.r.effects.push({type:'firstDestroyHeal',turn:5,player:0});c.r.players[0].hp=100;start(c);pass(c);assert.equal(c.r.players[0].hp,180);assert.equal(c.r.pendingAbility,null);assert.deepEqual(c.r.effectStack,[]);
});
