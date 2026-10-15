import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-elemental-dragons-'));process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const {gameTestInternals:I}=await import('../server.mjs');
import {ELEMENTAL_DRAGON_FORMS,beginDragonTurn} from '../src/elemental-dragons.mjs';
import {elementalChoices} from '../src/elemental-replacement.mjs';
import {planActivation} from '../src/activation-rules.mjs';
import {effectUsedThisTurn,markEffectUsed,ELEMENTAL_FIRST_EFFECT_GROUP} from '../src/effect-usage.mjs';
import {elementalDragonFixture as fixture,matureTerra} from './helpers/elemental-dragon-fixture.mjs';
const start=f=>I.apply(f.r,f.who,'ability',f.body);
const pass=f=>I.apply(f.r,f.r.pendingAbility.awaiting??1-f.who,'abilityResponse',{choice:'pass'});
const makeReady=f=>{if(f.cid==='COC-32-014')matureTerra(I,f);return f;};
function swordDouble(f,id){f.r.effects.push({id:'test-sword-'+id,type:'lifeEatingSword',target:{kind:'unit',id},activeDoubleCount:1,activeDoubleTurn:f.r.turnNumber});}

test('elemental dragons: all four rule names satisfy exact spells on either field even under negation',()=>{
 for(const [dragon,form] of Object.entries(ELEMENTAL_DRAGON_FORMS))for(const owner of [0,1])for(const negated of [false,true]){
  const f=fixture(I,dragon,owner);f.r.turn=0;f.r.units[f.source].effectsNegated=negated;
  const spellId='COC-32-00'+(+form.slice(-1)+4),spell=f.add(spellId,0,'hand');
  assert.doesNotThrow(()=>planActivation({room:f.r,who:0,unitId:spell,cards:I.cards}));
  const wrong=f.add(spellId==='COC-32-005'?'COC-32-006':'COC-32-005',0,'hand');assert.throws(()=>planActivation({room:f.r,who:0,unitId:wrong,cards:I.cards}),{status:409});
  I.apply(f.r,0,'play',{unitId:spell,...(spellId==='COC-32-006'?{target:{type:'player',player:0}}:{})});assert.equal(f.r.pendingSpell.cardId,spellId);
  I.apply(f.r,1,'spellResponse',{choice:'pass'});assert.ok(f.r.players[0].grave.includes(spell));
 }
});
test('elemental dragons: unrelated names cannot satisfy exact magician spell conditions',()=>{
 for(const [spell,wrong] of [['COC-32-005','COC-23-002'],['COC-32-006','COC-23-003'],['COC-32-007','COC-12-002'],['COC-32-008','COC-05-002']]){
  const f=fixture(I,wrong),id=f.add(spell,0,'hand'),before=structuredClone(f.r);assert.throws(()=>I.apply(f.r,0,'play',{unitId:id}),{status:409});assert.deepEqual(f.r,before);
 }
});
test('elemental dragons: rule identity enables wakeup materials without copying magician abilities',()=>{
 for(const dragon of Object.keys(ELEMENTAL_DRAGON_FORMS)){
  const f=fixture(I,dragon),spell=f.add('COC-32-009',0,'hand'),extra=f.add(dragon,0,'extra');
  assert.doesNotThrow(()=>planActivation({room:f.r,who:0,unitId:spell,cards:I.cards}));
  assert.ok(!I.publicState(f.r,0).elementalAbilities.includes(f.source));
  I.move(f.r,f.source,'grave',0);assert.ok(!elementalChoices(f.r,0,I.H).some(x=>x.id===f.source));I.move(f.r,f.source,'field',0);
  I.apply(f.r,0,'extraSummon',{extraUnitId:extra,materials:[f.source],spellUnitId:spell});
  assert.ok(f.r.players[0].grave.includes(f.source));assert.ok(f.r.players[0].extra.includes(extra));I.apply(f.r,1,'extraResponse',{choice:'pass'});
  assert.ok(f.r.players[0].field.includes(extra));I.processEndOfTurn(f.r);assert.ok(f.r.players[0].hand.includes(spell));
 }
});
test('elemental dragons: Ocean and Terra declare effect two and resolve only after opponent pass',()=>{
 for(const cid of ['COC-32-012','COC-32-014']){
  const f=makeReady(fixture(I,cid));markEffectUsed(f.r,0,f.source,1);start(f);
  assert.ok(effectUsedThisTurn(f.r,0,f.source,2));assert.equal(f.r.players[0].sharedEffectUsage?.[ELEMENTAL_FIRST_EFFECT_GROUP],undefined);
  assert.equal(f.r.players[1].hp,1000);assert.ok(f.r.players[1].field.includes(f.foe));
  assert.equal(I.publicState(f.r,0).automation.fieldAbilityEffects[cid],2);
  f.r=JSON.parse(JSON.stringify(f.r));pass(f);
  if(cid==='COC-32-012')assert.ok(f.r.players[1].grave.includes(f.foe));else assert.equal(f.r.players[1].hp,850);
  assert.throws(()=>start(f),/이미 사용/);
 }
});
test('elemental dragons: Wind counters both monsters and negation spends only that physical effect',()=>{
 for(const cid of ['COC-32-012','COC-32-014']){
  const f=makeReady(fixture(I,cid)),wind=f.add('COC-12-002',1);start(f);I.apply(f.r,1,'abilityResponse',{choice:'counter',sourceUnitId:wind});f.r=JSON.parse(JSON.stringify(f.r));pass(f);
  assert.equal(f.r.players[1].hp,1000);assert.ok(f.r.players[1].field.includes(f.foe));assert.throws(()=>start(f),/이미 사용/);
  const second=f.add(cid);if(cid==='COC-32-014'){f.r.units[second].dragonResidence={ownTurnStarts:2,lastTurnNumber:f.r.turnNumber};}
  I.apply(f.r,0,'ability',{...f.body,sourceUnitId:second});pass(f);assert.ok(effectUsedThisTurn(f.r,0,second,2));
 }
});
test('elemental dragons: Ocean checks strict current HP versus actual attack at declaration and resolution',()=>{
 for(const hp of [169,170,171]){const f=fixture(I);f.r.units[f.foe].hp=hp;const before=structuredClone(f.r);if(hp<=170){assert.throws(()=>start(f),{status:409});assert.deepEqual(f.r,before);}else{start(f);pass(f);assert.ok(f.r.players[1].grave.includes(f.foe));}}
 for(const change of ['hp','attack','immune']){const f=fixture(I);start(f);if(change==='hp')f.r.units[f.foe].hp=170;if(change==='attack')f.r.units[f.source].atk=400;if(change==='immune')f.r.units[f.foe].effectDestructionImmune=true;pass(f);assert.ok(f.r.players[1].field.includes(f.foe));}
 const f=fixture(I);swordDouble(f,f.source);assert.equal(I.swordActualAttack(f.r,f.source),340);f.r.units[f.foe].hp=340;assert.throws(()=>start(f),{status:409});f.r.units[f.foe].hp=341;start(f);pass(f);assert.ok(f.r.players[1].grave.includes(f.foe));
});
test('elemental dragons: source movement control negation and target reentry fizzle',()=>{
 for(const cid of ['COC-32-012','COC-32-014'])for(const change of ['leave','reenter','control','negate']){
  const f=makeReady(fixture(I,cid));start(f);
  if(change==='negate')f.r.units[f.source].effectsNegated=true;else{I.move(f.r,f.source,'hand',0);if(change!=='leave')I.move(f.r,f.source,'field',change==='control'?1:0);}
  pass(f);assert.ok(f.r.players[1].field.includes(f.foe));assert.equal(f.r.players[1].hp,1000);
 }
 const f=fixture(I);start(f);I.move(f.r,f.foe,'hand',1);I.move(f.r,f.foe,'field',1);f.r.units[f.foe].hp=400;pass(f);assert.ok(f.r.players[1].field.includes(f.foe));
});
test('elemental dragons: illegal timing ownership and negated sources are atomic',()=>{
 for(const cid of ['COC-32-012','COC-32-014'])for(const change of ['phase','turn','negate','zone','own-target']){
  const f=makeReady(fixture(I,cid));if(change==='phase')f.r.phase='ATTACK';if(change==='turn')f.r.turn=1;if(change==='negate')f.r.units[f.source].effectsNegated=true;if(change==='zone')I.move(f.r,f.source,'hand',0);
  if(change==='own-target'){if(cid!=='COC-32-012')continue;f.body.target.id=f.source;}
  const before=structuredClone(f.r);assert.throws(()=>start(f));assert.deepEqual(f.r,before);
 }
});
test('elemental dragons: Terra counts two controlled turn starts and resets only after leaving',()=>{
 const f=fixture(I,'COC-32-014');assert.throws(()=>start(f),/두 번/);assert.equal(f.r.units[f.source].dragonResidence.ownTurnStarts,0);
 f.r.phase='END';I.apply(f.r,0,'phase',{});assert.equal(f.r.units[f.source].dragonResidence.ownTurnStarts,0);
 f.r.phase='END';I.apply(f.r,1,'phase',{});f.r.phase='MAIN';assert.equal(f.r.units[f.source].dragonResidence.ownTurnStarts,1);assert.throws(()=>start(f),/두 번/);
 beginDragonTurn(f.r,0);assert.equal(f.r.units[f.source].dragonResidence.ownTurnStarts,1);
 f.r.units[f.source].effectsNegated=true;I.move(f.r,f.source,'field',1);assert.equal(f.r.units[f.source].dragonResidence.ownTurnStarts,1);
 f.r.phase='END';I.apply(f.r,0,'phase',{});assert.equal(f.r.units[f.source].dragonResidence.ownTurnStarts,2);f.r.units[f.source].effectsNegated=false;f.r.phase='MAIN';I.apply(f.r,1,'ability',{sourceUnitId:f.source});I.apply(f.r,0,'abilityResponse',{choice:'pass'});assert.equal(f.r.players[0].hp,850);
 I.move(f.r,f.source,'grave',0);assert.equal(f.r.units[f.source].dragonResidence,undefined);I.move(f.r,f.source,'field',0);assert.equal(f.r.units[f.source].dragonResidence.ownTurnStarts,0);
});
test('elemental dragons: legacy Terra residence is not guessed and JSON restore does not duplicate starts',()=>{
 const f=fixture(I,'COC-32-014');delete f.r.units[f.source].dragonResidence;f.r.players[0].turnsTaken=100;I.processStartOfTurn(f.r);assert.equal(f.r.units[f.source].dragonResidence.ownTurnStarts,1);
 f.r=JSON.parse(JSON.stringify(f.r));beginDragonTurn(f.r,0);assert.equal(f.r.units[f.source].dragonResidence.ownTurnStarts,1);assert.throws(()=>start(f),/두 번/);
});
test('elemental dragons: Terra uses resolution HP with floor rounding and normal outcome',()=>{
 for(const hp of [1,3,301]){const f=makeReady(fixture(I,'COC-32-014'));start(f);f.r.units[f.source].hp=hp;pass(f);assert.equal(f.r.players[1].hp,1000-Math.floor(hp/2));assert.equal(f.r.units[f.source].hp,hp);}
 const f=makeReady(fixture(I,'COC-32-014'));f.r.players[1].hp=150;start(f);pass(f);assert.equal(f.r.status,'finished');assert.equal(f.r.winner,0);
});
test('elemental dragons: all AI levels use the same Ocean legality and Terra delay and wait for humans',t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?(min===3?1:0):min);
 for(const level of ['easy','medium','hard'])for(const cid of ['COC-32-012','COC-32-014']){
  const f=fixture(I,cid,1);f.r.mode='ai';f.r.aiDifficulty=level;
  if(cid==='COC-32-014'){assert.equal(I.chooseAIFieldAbility(f.r),null);matureTerra(I,f);}else{f.r.units[f.foe].effectDestructionImmune=true;assert.equal(I.chooseAIFieldAbility(f.r),null);delete f.r.units[f.foe].effectDestructionImmune;}
  const choice=I.chooseAIFieldAbility(f.r);assert.equal(choice.sourceUnitId,f.source);I.runAI(f.r);assert.equal(f.r.pendingAbility?.who,1);assert.ok(f.r.players[0].field.includes(f.foe));assert.equal(f.r.players[0].hp,1000);
 }
});
function battle(f,{direct=false}={}){
 f.r.phase='ATTACK';f.r.units[f.source].diceMin=1;f.r.units[f.source].diceMax=1;
 I.apply(f.r,0,'attack',{attackerId:f.source,target:direct?{type:'player',player:1}:{type:'unit',id:f.foe}});I.apply(f.r,1,'defend',{});
}
test('elemental combat: Flame compares both actual attacks and grants through battle immunity but not direct attacks',()=>{
 for(const mode of ['plain','source-double','target-double','equal','immune','direct','negated']){
  const f=fixture(I,'COC-32-001');f.r.units[f.source].atk=100;f.r.units[f.foe].atk=mode==='plain'||mode==='immune'||mode==='direct'||mode==='negated'?99:150;
  if(mode==='equal')f.r.units[f.foe].atk=100;
  if(mode==='source-double')swordDouble(f,f.source);
  if(mode==='target-double'){f.r.units[f.foe].atk=60;swordDouble(f,f.foe);}
  if(mode==='immune')f.r.units[f.foe].battleInvulnerable=true;
  if(mode==='negated')f.r.units[f.source].effectsNegated=true;
  battle(f,{direct:mode==='direct'});assert.equal(f.r.units[f.source].bonusAttackCount||0,['plain','source-double','immune'].includes(mode)?1:0,mode);
 }
});
test('elemental combat: Volcano requires a real battle destruction and honors effect negation',()=>{
 for(const mode of ['kill','survive','immune','negated','revive']){
  const f=fixture(I,'COC-32-011');f.r.units[f.foe].hp=mode==='survive'?2:1;
  if(mode==='immune')f.r.units[f.foe].battleInvulnerable=true;
  if(mode==='negated')f.r.units[f.source].effectsNegated=true;
  if(mode==='revive'){I.move(f.r,f.foe,'grave',1);f.foe=f.add('COC-10-011',1);f.r.units[f.foe].hp=1;}
  battle(f);assert.equal(f.r.units[f.source].bonusAttackCount||0,['kill','revive'].includes(mode)?1:0,mode);if(mode==='revive')assert.ok(f.r.players[1].field.includes(f.foe));
 }
});
test('elemental combat: independent second effects add to existing attack grants and cannot reset by resummoning',()=>{
 for(const cid of ['COC-32-001','COC-32-011']){
  const f=fixture(I,cid),u=f.r.units[f.source];u.bonusAttackTurn=f.r.turnNumber;u.bonusAttackCount=2;
  markEffectUsed(f.r,0,f.source,1);if(cid==='COC-32-011')f.r.units[f.foe].hp=1;
  battle(f);assert.equal(u.bonusAttackCount,3);assert.ok(effectUsedThisTurn(f.r,0,f.source,2));
  if(cid==='COC-32-011'){f.foe=f.add('COC-21-009',1);f.r.units[f.foe].hp=1;}
  battle(f);assert.equal(u.bonusAttackCount,3);
  I.move(f.r,f.source,'hand',0);I.move(f.r,f.source,'field',0);
  if(cid==='COC-32-011'){f.foe=f.add('COC-21-009',1);f.r.units[f.foe].hp=1;}
  battle(f);assert.equal(u.bonusAttackCount,undefined);assert.equal(I.attackAvailable(u,f.r.turnNumber),false); // used effect cannot regenerate the cleared grant
  f.r.turnNumber++;if(cid==='COC-32-011'){f.foe=f.add('COC-21-009',1);f.r.units[f.foe].hp=1;}
  battle(f);assert.equal(u.bonusAttackCount,1);assert.equal(u.bonusAttackTurn,f.r.turnNumber);
 }
});
test('elemental combat: different physical Flame copies each earn their own bonus',()=>{
 const f=fixture(I,'COC-32-001'),second=f.add('COC-32-001');battle(f);f.source=second;battle(f);
 for(const id of f.r.players[0].field.filter(Boolean)){assert.equal(f.r.units[id].bonusAttackCount,1);assert.ok(effectUsedThisTurn(f.r,0,id,2));}
});

test('elemental dragons: immune wakeup costs reject atomically for magician and dragon identities',()=>{
 for(const cid of ['COC-32-001','COC-32-011']){
  const f=fixture(I,cid),extra=f.add('COC-32-011',0,'extra'),spell=f.add('COC-32-009',0,'hand');f.r.units[f.source].effectDestructionImmune=true;
  const before=structuredClone(f.r);assert.throws(()=>I.apply(f.r,0,'extraSummon',{extraUnitId:extra,materials:[f.source],spellUnitId:spell}),/파괴 면역/);assert.deepEqual(f.r,before);
 }
});
test('elemental dragons: alias wakeup survives AI legality and Storm negation retains paid material',t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?(min===3?1:0):min);
 for(const level of ['easy','medium','hard'])for(const dragon of Object.keys(ELEMENTAL_DRAGON_FORMS)){
  const f=fixture(I,dragon,1),spell=f.add('COC-32-009',1,'hand'),extra=f.add(dragon,1,'extra'),storm=f.add('COC-14-001',0,'integration');f.r.mode='ai';f.r.aiDifficulty=level;f.r.units[f.foe].hp=100;
  assert.deepEqual(I.chooseAIExtra(f.r).materials,[f.source]);I.runAI(f.r);assert.ok(f.r.pendingExtraSummon,JSON.stringify({dragon,level,logs:f.r.logs}));assert.ok(f.r.players[1].grave.includes(f.source));
  I.apply(f.r,0,'extraResponse',{choice:'counter',sourceUnitId:storm});I.runAI(f.r);assert.ok(f.r.players[1].extra.includes(extra));assert.ok(f.r.players[1].grave.includes(f.source));
  // AI may have advanced beyond END after acknowledging the counter.
  assert.ok(f.r.players[1].hand.includes(spell)||f.r.players[1].grave.includes(spell));
 }
});
test('elemental combat: granted attacks persist through control transfer but clear on zone departure',()=>{
 const f=fixture(I,'COC-32-001');battle(f);I.move(f.r,f.source,'field',1);assert.equal(f.r.units[f.source].bonusAttackCount,1);
 I.move(f.r,f.source,'grave',0);assert.equal(f.r.units[f.source].bonusAttackCount,undefined);assert.equal(f.r.units[f.source].bonusAttackTurn,undefined);assert.ok(effectUsedThisTurn(f.r,0,f.source,2));
});
