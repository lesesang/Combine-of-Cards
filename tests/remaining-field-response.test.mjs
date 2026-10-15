import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-field-six-'));process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const {gameTestInternals:I}=await import('../server.mjs');
import {queueFieldAbility,finishFieldAbility} from '../src/ability-responses.mjs';
import {REMAINING_FIELD_IDS as IDS,remainingFieldFixture as fixture} from './helpers/remaining-field-fixture.mjs';
const start=f=>I.apply(f.r,f.who,'ability',f.body);
const pass=f=>I.apply(f.r,f.r.pendingAbility.awaiting??1-f.who,'abilityResponse',{choice:'pass'});
function result(f){const {r,cardId,own,foe,who,rider}=f;
 if(cardId==='COC-08-003')assert.equal(r.players[who].hand.length,1);
 if(cardId==='COC-10-005')assert.ok(r.players[1-who].grave.includes(foe));
 if(cardId==='COC-23-002')assert.equal(r.units[rider].atk,130);
 if(['COC-24-003','COC-26-003'].includes(cardId))assert.equal(r.units[own].atk,80);
 if(cardId==='COC-31-004')assert.ok(r.pendingRecruitChoice);
}
function unresolved(f){const {r,cardId,own,foe,who,rider}=f;
 if(cardId==='COC-08-003')assert.equal(r.players[who].hand.filter(id=>id!==f.source).length,0);
 if(cardId==='COC-10-005')assert.ok(r.players[1-who].field.includes(foe));
 if(cardId==='COC-23-002')assert.equal(r.units[rider].atk,80);
 if(['COC-24-003','COC-26-003'].includes(cardId))assert.equal(r.units[own].atk,90);
 if(cardId==='COC-31-004')assert.equal(r.pendingRecruitChoice,undefined);
}

test('remaining field six: declarations pay costs first, persist and resolve only after pass',()=>{
 for(const cid of IDS){const f=fixture(I,cid);start(f);assert.equal(f.r.pendingAbility.cardId,cid);unresolved(f);
  if(cid==='COC-08-003')assert.ok(f.r.players[0].deck.includes(f.cost));
  if(cid==='COC-10-005'){assert.ok(f.r.players[0].grave.includes(f.own));assert.equal(f.r.units[f.source].abilityGameCount,1);}
  if(cid==='COC-23-002')assert.equal(f.r.units[f.source].abilityGameUsed,true);
  f.r=JSON.parse(JSON.stringify(f.r));pass(f);result(f);
 }
});
test('remaining field six: Wind counters four monsters but never the two integrations',()=>{
 for(const cid of IDS){const f=fixture(I,cid);start(f);const counters=I.publicState(f.r,1).pendingAbility.counters;
  if(f.integration){assert.equal(counters.length,0);assert.throws(()=>I.apply(f.r,1,'abilityResponse',{choice:'counter',sourceUnitId:f.wind}),{status:409});pass(f);result(f);}
  else{assert.ok(counters.some(c=>c.sourceUnitId===f.wind));I.apply(f.r,1,'abilityResponse',{choice:'counter',sourceUnitId:f.wind});f.r=JSON.parse(JSON.stringify(f.r));pass(f);unresolved(f);assert.throws(()=>start(f),{status:409});}
 }
});
test('remaining field six: source movement reentry control and negation fizzle without refunds',()=>{
 for(const cid of IDS)for(const change of ['leave','reenter','control','negate']){
  const f=fixture(I,cid);start(f);
  if(change==='negate')f.r.units[f.source].effectsNegated=true;
  else{I.move(f.r,f.source,'hand',0);if(change!=='leave')I.move(f.r,f.source,f.integration?'integration':'field',change==='control'?1:0);}
  pass(f);unresolved(f);
  if(cid==='COC-10-005'){assert.ok(f.r.players[0].grave.includes(f.own));assert.equal(f.r.units[f.source].abilityGameCount,1);}
 }
});
test('remaining field six: illegal source and choices leave the complete state unchanged',()=>{
 for(const cid of IDS){const f=fixture(I,cid);f.r.units[f.source].effectsNegated=true;const before=structuredClone(f.r);assert.throws(()=>start(f),{status:409});assert.deepEqual(f.r,before);}
 for(const cid of ['COC-08-003','COC-10-005','COC-24-003','COC-26-003']){const f=fixture(I,cid);f.body.costCardId='missing';f.body.costTarget={type:'unit',id:f.foe};f.body.target={type:'unit',id:'missing'};const before=structuredClone(f.r);assert.throws(()=>start(f),{status:409});assert.deepEqual(f.r,before);}
 const f=fixture(I,'COC-10-005');f.r.units[f.own].effectDestructionImmune=true;const before=structuredClone(f.r);assert.throws(()=>start(f),/파괴 가능한/);assert.deepEqual(f.r,before);
});
test('remaining field six: physical game limits survive movement and copies remain independent',()=>{
 const f=fixture(I,'COC-23-002');start(f);I.apply(f.r,1,'abilityResponse',{choice:'counter',sourceUnitId:f.wind});pass(f);f.r.turnNumber++;I.move(f.r,f.source,'hand',0);I.move(f.r,f.source,'field',0);assert.throws(()=>start(f),/게임당/);
 const second=f.add('COC-23-002',0,'field');f.body.sourceUnitId=second;start(f);pass(f);assert.equal(f.r.units[f.rider].atk,130);
 const p=fixture(I,'COC-10-005');for(let n=0;n<3;n++){if(n){p.own=p.add('COC-21-009',0,'field');p.foe=p.add('COC-21-009',1,'field');p.body.costTarget.id=p.own;p.body.target.id=p.foe;}start(p);pass(p);p.r.turnNumber++;}
 p.own=p.add('COC-21-009',0,'field');p.foe=p.add('COC-21-009',1,'field');p.body.costTarget.id=p.own;p.body.target.id=p.foe;assert.throws(()=>start(p),/최대 3회/);I.move(p.r,p.source,'hand',0);I.move(p.r,p.source,'integration',0);assert.throws(()=>start(p),/최대 3회/);
});
test('remaining field six: Match can target itself and reads HP at resolution, not declaration',()=>{
 for(const cid of ['COC-24-003','COC-26-003']){const f=fixture(I,cid);f.body.target.id=f.source;start(f);f.r.units[f.source].hp=41;pass(f);assert.equal(f.r.units[f.source].atk,41);}
 for(const cid of ['COC-24-003','COC-26-003']){const f=fixture(I,cid);start(f);I.move(f.r,f.own,'hand',0);I.move(f.r,f.own,'field',0);pass(f);assert.equal(f.r.units[f.own].atk,90);}
});
test('remaining field six: Ride buff binds the declared integration and cannot follow replacement or evolution',()=>{
 for(const mode of ['replace','reenter','evolve']){const f=fixture(I,'COC-23-002');start(f);
  if(mode==='evolve')f.r.units[f.rider].cardId='COC-23-007';else{I.move(f.r,f.rider,'hand',0);if(mode==='reenter')I.move(f.r,f.rider,'integration',0);else f.rider=f.add('COC-23-001',0,'integration');}
  pass(f);assert.equal(f.r.units[f.rider].atk,80);
 }
});
test('remaining field six: all AI levels declare legal costs and wait for human replies',t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?(min===3?1:0):min);
 for(const cid of IDS){const f=fixture(I,cid,1);f.r.mode='ai';f.r.aiDifficulty='hard';if(['COC-24-003','COC-26-003'].includes(cid))f.r.units[f.own].hp=200;
  for(const level of ['easy','medium','hard']){const copy=JSON.parse(JSON.stringify(f.r));copy.aiDifficulty=level;I.runAI(copy);assert.equal(copy.pendingAbility?.cardId,cid);}
 }
});
test('remaining field six: cost and resolution failures atomically restore state',()=>{
 const f=fixture(I,'COC-10-005'),before=structuredClone(f.r);assert.throws(()=>queueFieldAbility(f.r,0,f.body,{...I.H,destroy:(...args)=>{I.H.destroy(...args);throw Error('cost failure');}}),/cost failure/);assert.deepEqual(f.r,before);
 start(f);const queued=structuredClone(f.r);assert.throws(()=>finishFieldAbility(f.r,{...I.H,destroy:()=>{f.r.players[1].hp=0;throw Error('resolution failure');}}),/resolution failure/);assert.deepEqual(f.r,queued);pass(f);result(f);
});

test('remaining field six: destruction-cost triggers finish before response and keep integration source validation',()=>{
 const f=fixture(I,'COC-10-005');f.r.players[0].hp=500;f.r.effects=[{type:'firstDestroyHeal',player:0,turn:5},{type:'firstDestroyHeal',player:0,turn:5}];
 start(f);assert.equal(f.r.pendingAbility.stage,'cost-triggers');assert.equal(f.r.units[f.source].abilityGameCount,1);assert.ok(f.r.pendingTriggerOrder);assert.throws(()=>pass(f),{status:409});
 f.r=JSON.parse(JSON.stringify(f.r));I.apply(f.r,0,'triggerOrder',{orderedKeys:f.r.pendingTriggerOrder.effects.map(e=>e.key)});assert.equal(f.r.players[0].hp,660);assert.equal(f.r.pendingAbility.stage,'response');
 I.move(f.r,f.source,'hand',0);pass(f);assert.ok(f.r.players[1].field.includes(f.foe));
});
test('remaining field six: sacrifice revival still pays once and target immunity does not refund it',()=>{
 const f=fixture(I,'COC-10-005');I.move(f.r,f.own,'grave',0);f.own=f.add('COC-10-011',0,'field');f.body.costTarget.id=f.own;f.r.units[f.foe].effectDestructionImmune=true;
 start(f);assert.ok(f.r.players[0].field.includes(f.own));assert.equal(f.r.units[f.own].revivedOnce,true);pass(f);assert.ok(f.r.players[1].field.includes(f.foe));assert.equal(f.r.units[f.source].abilityGameCount,1);
});
