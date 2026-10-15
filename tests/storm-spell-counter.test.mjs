import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {legalSpellCounters} from '../src/spell-counters.mjs';
import {responseSpellIds} from '../src/spell-response-registry.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-storm-'));
process.env.DATA_DIR=dir;
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));

function fixture(mode='pvp',caster=0){
 const r={code:'STORM1',status:'active',version:1,turn:0,turnNumber:3,phase:'MAIN',
  mode,players:[],units:{},logs:[],effects:[]};
 I.createPlayer(r,caster===0?'30':'14','A','a');
 I.createPlayer(r,caster===1?'30':'14','B','b');
 r.players.forEach(p=>p.turnsTaken=2);
 const spell=r.players[caster].deck.find(id=>r.units[id].cardId==='COC-30-007');
 const source=r.players[1-caster].deck.find(id=>r.units[id].cardId==='COC-14-001');
 I.move(r,source,'integration',1-caster);I.move(r,spell,'hand',caster);
 r.players[caster].hp=200;
 // Real play action for player 0; queue helper allows an AI caster fixture
 // without advancing unrelated AI phases, draws or random choices.
 if(caster===0)I.apply(r,caster,'play',{unitId:spell});
 else I.queueAutomatedSpell(r,caster,spell,I.cards.get('COC-30-007'),{});
 return {r,spell,source,caster};
}
const counter=(r,source,who=1)=>I.apply(r,who,'spellResponse',{choice:'counter',sourceUnitId:source});
const pass=(r,who=0)=>I.apply(r,who,'spellResponse',{choice:'pass'});

test('Storm counter: LIFO negates a paid spell after caster pass without refund',()=>{
 const {r,spell,source}=fixture();
 assert.deepEqual(legalSpellCounters(r,1),[source]);
 const view=counter(r,source);
 assert.equal(r.effectStack.length,2);
 assert.equal(r.players[0].hp,200);
 assert.equal(view.pendingSpell.awaiting,0);
 assert.equal(view.pendingSpell.counter.who,1);
 assert.deepEqual(view.pendingSpell.counters,[]);
 assert.equal(view.players[0].hand,null);
 assert.equal(view.pendingSpell.sourceId,undefined);
 assert.equal(r.units[source].spellCounterGameUsed,true);
 assert.throws(()=>pass(r,1),/대응권자/);
 pass(r);
 assert.equal(r.pendingSpell,null);assert.equal(r.effectStack.length,0);
 assert.equal(r.players[0].hp,200);
 assert.ok(r.players[0].grave.includes(spell));
 assert.equal(r.players[0].roundPlays,1);
 assert.match(r.logs.map(e=>e.text).join('\n'),/비용 반환 없음/);
 assert.throws(()=>pass(r),/대응권자/);
});

test('Storm counter: invalid source, controller, usage and response preserve state',()=>{
 for(const bad of ['missing','enemy','hand','negated','used','caster','unknown-choice']){
  const {r,source}=fixture();let chosen=source,who=1,choice='counter';
  if(bad==='missing')chosen='fake';
  if(bad==='enemy')I.move(r,source,'integration',0);
  if(bad==='hand')I.move(r,source,'hand',1);
  if(bad==='negated')r.units[source].effectsNegated=true;
  if(bad==='used')r.units[source].spellCounterGameUsed=true;
  if(bad==='caster')who=0;
  if(bad==='unknown-choice')choice='negate';
  const before=structuredClone(r);
  assert.throws(()=>I.apply(r,who,'spellResponse',{choice,sourceUnitId:chosen}));
  assert.deepEqual(r,before,bad);
 }
});

test('Storm counter: moved or negated source fails while usage remains spent',()=>{
 for(const change of ['grave','control','negated']){
  const {r,source}=fixture();counter(r,source);
  if(change==='grave')I.move(r,source,'grave',1);
  if(change==='control')I.move(r,source,'integration',0);
  if(change==='negated')r.units[source].effectsNegated=true;
  pass(r);
  assert.equal(r.players[0].hp,440,change);
  assert.equal(r.units[source].spellCounterGameUsed,true);
  assert.equal(r.effectStack.length,0);
 }
});

test('Storm counter: JSON restoration and re-entry cannot reset once-per-game usage',()=>{
 let {r,source,spell}=fixture();counter(r,source);
 r=JSON.parse(JSON.stringify(r));pass(r);
 I.move(r,source,'grave',1);I.move(r,source,'integration',1);
 I.move(r,spell,'hand',0);
 I.queueAutomatedSpell(r,0,spell,I.cards.get('COC-30-007'),{});
 assert.deepEqual(legalSpellCounters(r,1),[]);
 const before=structuredClone(r);assert.throws(()=>counter(r,source),/사용 가능한/);
 assert.deepEqual(r,before);
 pass(r,1);assert.equal(r.players[0].hp,440);
});

test('Storm counter: all AI levels use legal responses and acknowledge human counters',()=>{
 for(const level of ['easy','medium','hard']){
  const {r,source}=fixture('ai');r.aiDifficulty=level;
  I.runAI(r);
  assert.equal(r.pendingSpell.awaiting,0,level);
  assert.equal(r.units[source].spellCounterGameUsed,true);
  assert.equal(r.players[0].hp,200);
  pass(r);assert.equal(r.players[0].hp,200);
  const human=fixture('ai',1);human.r.aiDifficulty=level;
  counter(human.r,human.source,0);I.runAI(human.r);
  assert.equal(human.r.pendingSpell,null);
  assert.equal(human.r.players[1].hp,200);
 }
});

test('Storm counter: pass remains legal and old saved windows retain their responder',()=>{
 const {r,source}=fixture();
 assert.equal(r.pendingSpell.awaiting,undefined);
 pass(r,1);assert.equal(r.players[0].hp,440);
 assert.equal(r.units[source].spellCounterGameUsed,undefined);
});

test('Storm counter: every registered queued spell skips its handler when negated',()=>{
 for(const cardId of responseSpellIds){
  const card=I.cards.get(cardId);
  const r={code:'ALL15S',status:'active',version:1,turn:0,turnNumber:3,phase:'MAIN',mode:'pvp',players:[],units:{},logs:[],effects:[]};
  I.createPlayer(r,card.deckId,'Caster','a');I.createPlayer(r,'14','Counter','b');
  r.players.forEach(p=>p.turnsTaken=2);
  const spell=r.players[0].deck.find(id=>r.units[id].cardId===cardId);
  const source=r.players[1].deck.find(id=>r.units[id].cardId==='COC-14-001');
  I.move(r,source,'integration',1);I.move(r,spell,'hand',0);
  // Exercise the shared resolution boundary independently of each spell's
  // declaration-time target UI/validation (covered by spell-specific tests).
  I.queueAutomatedSpell(r,0,spell,card,{});
  const players=structuredClone(r.players);
  counter(r,source);pass(r);
  assert.deepEqual(r.players,players,cardId);
  assert.deepEqual(r.effects,[],cardId);
  assert.equal(r.persistentEffects?.length||0,0,cardId);
  assert.ok(r.logs.some(e=>e.text.includes('비용 반환 없음')),cardId);
 }
});
