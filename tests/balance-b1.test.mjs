import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
import {castAutomatedSpell} from '../src/automated-effects.mjs';
function fixture(who=0){
 const r={code:'BALB01',status:'active',version:1,turn:who,turnNumber:5,phase:'MAIN',mode:'pvp',players:[],units:{},logs:[],effects:[]};
 I.createPlayer(r,'21','A','a'.repeat(64));I.createPlayer(r,'11','B','b'.repeat(64));
 for(const p of r.players){p.turnsTaken=3;for(const z of ['hand','deck','grave','extra','banished'])p[z]=[];p.field=[null,null,null];p.integration=null;}
 r.units={};
 const add=(cid,player=0,zone='field')=>{const id=I.instantiate(r,cid,player);I.move(r,id,zone,player);return id;};
 return {r,add};
}
function pass(r){I.apply(r,r.pendingSpell.awaiting??1-r.pendingSpell.who,'spellResponse',{choice:'pass'});}
function attack(f,src,target){f.r.phase='ATTACK';I.apply(f.r,0,'attack',{attackerId:src,target});I.apply(f.r,1,'defend',{});}

test('B1 review covers every retained and patched card without inventing IDs or replacing established rules',()=>{
 const audit=JSON.parse(fs.readFileSync(new URL('../docs/balance-review-b1.json',import.meta.url)));
 const patches=JSON.parse(fs.readFileSync(new URL('../docs/card-patches.json',import.meta.url))).filter(p=>p.patchId==='BALANCE-B1');
 assert.equal(audit.cards.length,254);assert.equal(new Set(audit.cards.map(c=>c.cardId)).size,254);assert.equal(audit.decks.length,24);assert.equal(patches.length,80);
 for(const c of I.catalog.cards){const a=audit.cards.find(a=>a.cardId===c.id),p=patches.find(p=>p.cardId===c.id);assert.ok(a?.reason);if(p){assert.deepEqual(c,p.after);for(const k of ['id','deckId','type','zone'])assert.equal(c[k],p.before[k]);}}
 for(const p of patches.filter(p=>['11','12','21'].includes(p.after.deckId))){for(const k of ['atk','hp']){if(!Number.isFinite(+p.before[k])||!Number.isFinite(+p.after[k]))continue;assert.ok(p.after.deckId==='12'?+p.after[k]<=+p.before[k]:+p.after[k]>=+p.before[k],p.cardId+k);}}
 for(const cid of ['COC-32-001','COC-32-002','COC-32-003','COC-32-004'])assert.match(I.cards.get(cid).effects[0],/플레이어별.*1회/);
 assert.equal(I.publicState(fixture().r,0).balanceRevision,'1.3-balance-b1');
});

test('B1 Dragon Lair buffs only current allied dragons, with valid King amplification and leave reset',()=>{
 for(const state of ['none','king','negated']){
  const f=fixture(),dragon=f.add('COC-11-004'),ally=f.add('COC-21-009'),enemy=f.add('COC-11-004',1);
  if(state!=='none'){const king=f.add('COC-11-003',0,'integration');f.r.units[king].effectsNegated=state==='negated';}
  const spell=f.add('COC-11-011',0,'hand');I.apply(f.r,0,'play',{unitId:spell});assert.equal(f.r.units[dragon].atk,150);
  f.r=JSON.parse(JSON.stringify(f.r));pass(f.r);const delta=state==='king'?45:30;
  assert.equal(f.r.units[dragon].atk,150+delta);assert.equal(f.r.units[dragon].hp,140+delta);assert.equal(f.r.units[ally].atk,90);assert.equal(f.r.units[enemy].atk,150);
  I.move(f.r,dragon,'hand',0);assert.equal(f.r.units[dragon].atk,150);assert.equal(f.r.units[dragon].hp,140);
 }
});

test('B1 new reactive spells can be countered and preserve paid sacrifice across JSON restoration',()=>{
 for(const cid of ['COC-11-011','COC-21-004','COC-21-005']){
  const f=fixture(),ally=f.add('COC-11-004'),enemy=f.add('COC-21-010',1),counter=f.add('COC-12-001',1),spell=f.add(cid,0,'hand');
  const body={unitId:spell,costUnitIds:[ally],target:{type:'unit',id:cid==='COC-21-005'?ally:enemy}};
  I.apply(f.r,0,'play',body);I.apply(f.r,1,'spellResponse',{choice:'counter',sourceUnitId:counter});f.r=JSON.parse(JSON.stringify(f.r));pass(f.r);
  assert.ok(f.r.players[0].grave.includes(spell));assert.ok(f.r.players[1].field.includes(enemy));assert.equal(f.r.players[0].hp,1000);
  assert.equal(f.r.players[0].grave.includes(ally),cid==='COC-21-004');assert.equal(f.r.units[counter].counterUsedThisStay,true);
 }
});

test('B1 Envy accepts exactly 200, bypasses target destruction immunity, and rejects 199 atomically',()=>{
 const f=fixture(),ally=f.add('COC-21-009'),enemy=f.add('COC-20-001',1),spell=f.add('COC-21-004',0,'hand');
 f.r.units[ally].atk=100;f.r.units[ally].hp=99;f.r.units[enemy].effectDestructionImmune=true;
 const body={unitId:spell,costUnitIds:[ally],target:{type:'unit',id:enemy}},before=structuredClone(f.r);
 assert.throws(()=>I.apply(f.r,0,'play',body),/200/);assert.deepEqual(f.r,before);
 f.r.units[ally].hp=100;I.apply(f.r,0,'play',body);assert.ok(f.r.players[0].grave.includes(ally));pass(f.r);assert.ok(f.r.players[1].grave.includes(enemy));
});

test('B1 drain cannot preserve an immune sacrifice or heal after target movement',()=>{
 for(const move of [false,true]){
  const f=fixture(),ally=f.add('COC-21-009'),spell=f.add('COC-21-005',0,'hand');f.r.units[ally].effectDestructionImmune=true;f.r.units[ally].hp=37;
  I.apply(f.r,0,'play',{unitId:spell,target:{type:'unit',id:ally}});if(move)I.move(f.r,ally,'hand',0);pass(f.r);
  assert.equal(f.r.players[0].hp,move?1000:1037);assert.ok(f.r.players[0][move?'hand':'grave'].includes(ally));
 }
});

test('B1 AI pays Envy sacrifice and offers the same opponent response on all difficulties',t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?(min===4?1:0):min);
 for(const level of ['easy','medium','hard']){
  const f=fixture(1),ally=f.add('COC-11-004',1),enemy=f.add('COC-21-009',0),spell=f.add('COC-21-004',1,'hand');
  f.r.mode='ai';f.r.aiDifficulty=level;I.runAI(f.r);assert.equal(f.r.pendingSpell?.cardId,'COC-21-004');assert.ok(f.r.players[1].grave.includes(ally));assert.ok(f.r.players[1].grave.includes(spell));assert.ok(f.r.players[0].field.includes(enemy));
  pass(f.r);assert.ok(f.r.players[0].grave.includes(enemy));
 }
});

test('B1 Partner adds 50 only to hero monster combat, without inflating confirmed dice-only piercing',()=>{
 for(const negated of [false,true])for(const direct of [false,true]){
  const f=fixture(),hero=f.add('COC-12-008'),partner=f.add('COC-12-006'),enemy=f.add('COC-21-009',1);f.r.units[partner].effectsNegated=negated;f.r.units[hero].diceMin=100;f.r.units[hero].diceMax=100;f.r.units[enemy].hp=70;
  attack(f,hero,direct?{type:'player',player:1}:{type:'unit',id:enemy});
  assert.equal(f.r.players[1].hp,direct?900:970); // piercing ignores the partner's extra damage
 }
 const f=fixture(),hero=f.add('COC-12-001'),partner=f.add('COC-12-006'),enemy=f.add('COC-21-009',1);f.r.units[hero].diceMin=10;f.r.units[hero].diceMax=10;f.r.units[enemy].hp=200;
 attack(f,hero,{type:'unit',id:enemy});assert.equal(f.r.units[enemy].hp,140);
 f.r.units[partner].effectsNegated=true;f.r.turnNumber++;attack(f,hero,{type:'unit',id:enemy});assert.equal(f.r.units[enemy].hp,130);
});

test('B1 Vampire heals half actual damage, excludes overkill and obeys negation and battle immunity',()=>{
 for(const negated of [false,true])for(const direct of [false,true])for(const immune of [false,true]){
  const f=fixture(),vamp=f.add('COC-21-007'),enemy=f.add('COC-21-009',1);f.r.units[vamp].effectsNegated=negated;f.r.units[vamp].diceMin=101;f.r.units[vamp].diceMax=101;f.r.units[enemy].hp=37;f.r.units[enemy].battleInvulnerable=immune;
  attack(f,vamp,direct?{type:'player',player:1}:{type:'unit',id:enemy});assert.equal(f.r.players[0].hp,1000+(negated?0:direct?50:immune?0:18));
 }
});

test('B1 Gargoyle and Hidden Sniper taunt, Straw does not, and negated taunts do not force targets',()=>{
 for(const cid of ['COC-21-010','COC-12-014','COC-21-008'])for(const negated of [false,true]){
  const f=fixture(),attacker=f.add('COC-21-009'),target=f.add(cid,1);f.r.units[target].effectsNegated=negated;f.r.phase='ATTACK';
  const play=()=>I.apply(f.r,0,'attack',{attackerId:attacker,target:{type:'player',player:1}});
  if(cid!=='COC-21-008'&&!negated)assert.throws(play,/어그로/);else assert.doesNotThrow(play);
 }
});

test('B1 Wind and Hurricane direct bonuses honor both die bounds and effect negation',t=>{
 for(const rolled of [1,6])for(const cid of ['COC-32-003','COC-32-013'])for(const negated of [false,true]){
  t.mock.method(crypto,'randomInt',(min,max)=>max===7?rolled:min);
  const f=fixture(),source=f.add(cid);f.r.units[source].effectsNegated=negated;f.r.units[source].diceMin=10;f.r.units[source].diceMax=10;
  attack(f,source,{type:'player',player:1});assert.equal(f.r.players[1].hp,990-(negated?0:rolled*(cid==='COC-32-003'?40:60)));t.mock.restoreAll();
 }
});

test('B1 Self-Devour expires at own end without removing other buffs or double-subtracting on return',()=>{
 for(const leave of [false,true]){
  const f=fixture(),source=f.add('COC-07-001',0,'integration');
  // Supply draw/mill cards so the spell does not end the fixture via deck-out.
  for(let i=0;i<6;i++)f.add('COC-21-009',1,'deck');
  castAutomatedSpell(f.r,0,I.cards.get('COC-07-011'),{},I.H);f.r.units[source].atk+=20;
  if(leave){I.move(f.r,source,'hand',0);I.move(f.r,source,'integration',0);}
  f.r=JSON.parse(JSON.stringify(f.r));I.processEndOfTurn(f.r);assert.equal(f.r.units[source].atk,leave?80:100);I.processEndOfTurn(f.r);assert.equal(f.r.units[source].atk,leave?80:100);
 }
});

test('B1 Vampire healing uses inflicted damage after shields and damage immunity',()=>{
 for(const cid of ['COC-09-002','COC-21-009']){
  const f=fixture(),vamp=f.add('COC-21-007'),enemy=f.add(cid,1);f.r.units[vamp].diceMin=100;f.r.units[vamp].diceMax=100;f.r.units[enemy].hp=200;
  if(cid==='COC-21-009')f.r.units[enemy].damageInvulnerable=true;
  attack(f,vamp,{type:'unit',id:enemy});assert.equal(f.r.players[0].hp,1000);assert.equal(f.r.units[enemy].hp,cid==='COC-09-002'?199:200);
 }
});

test('B1 FLASH rejects HP200 before spending and pays HP200 even when countered',()=>{
 const f=fixture(),target=f.add('COC-21-009',1),counter=f.add('COC-12-001',1),spell=f.add('COC-31-007',0,'hand');
 const body={unitId:spell,target:{type:'unit',id:target}};f.r.players[0].hp=200;const before=structuredClone(f.r);
 assert.throws(()=>I.apply(f.r,0,'play',body),/체력/);assert.deepEqual(f.r,before);f.r.players[0].hp=201;
 I.apply(f.r,0,'play',body);assert.equal(f.r.players[0].hp,1);I.apply(f.r,1,'spellResponse',{choice:'counter',sourceUnitId:counter});pass(f.r);
 assert.equal(f.r.players[0].hp,1);assert.ok(f.r.players[1].field.includes(target));
});
test('B1 new spells reject Wind Girl at the spell root and fizzle moved targets without redirecting',()=>{
 for(const cid of ['COC-11-011','COC-21-004','COC-21-005']){
  const f=fixture(),ally=f.add('COC-11-004'),enemy=f.add('COC-21-009',1),wind=f.add('COC-12-002',1),spell=f.add(cid,0,'hand');
  const target=cid==='COC-21-005'?ally:enemy;I.apply(f.r,0,'play',{unitId:spell,target:{type:'unit',id:target},costUnitIds:[ally]});
  const before=structuredClone(f.r);assert.throws(()=>I.apply(f.r,1,'spellResponse',{choice:'counter',sourceUnitId:wind}),{status:409});assert.deepEqual(f.r,before);
  if(cid!=='COC-11-011')I.move(f.r,target,'hand',f.r.units[target].owner);pass(f.r);assert.equal(f.r.players[0].hp,1000);assert.ok(f.r.players[1].field.includes(wind));
 }
});
test('B1 recasting Self-Devour after reentry expires only its new field stay buff',()=>{
 const f=fixture(),source=f.add('COC-07-001',0,'integration');for(let i=0;i<12;i++)f.add('COC-21-009',1,'deck');
 castAutomatedSpell(f.r,0,I.cards.get('COC-07-011'),{},I.H);I.move(f.r,source,'hand',0);I.move(f.r,source,'integration',0);
 castAutomatedSpell(f.r,0,I.cards.get('COC-07-011'),{},I.H);assert.equal(f.r.units[source].atk,230);I.processEndOfTurn(f.r);assert.equal(f.r.units[source].atk,80);
});
