import test from 'node:test';import assert from 'node:assert/strict';
process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
import {ELEMENTAL_MAGICIAN_IDS,effectUsedThisTurn,markEffectUsed} from '../src/effect-usage.mjs';
import {elementalChoices} from '../src/elemental-replacement.mjs';
function fixture(cid='COC-32-001',who=0){
 const r={code:'ELEMTL',status:'active',version:1,turn:who,turnNumber:5,phase:'MAIN',mode:'pvp',players:[],units:{},logs:[],effects:[]};
 I.createPlayer(r,'32','A','a'.repeat(64));I.createPlayer(r,'32','B','b'.repeat(64));r.players.forEach(p=>{p.turnsTaken=3;p.deck=[];p.hand=[];p.grave=[];p.extra=[];});r.units={};
 const add=(id,owner,zone)=>{const uid=I.instantiate(r,id,owner);I.move(r,uid,zone,owner);return uid;};
 const source=add(cid,who,'field'),spell=add('COC-32-005',who,'hand');
 return {r,source,spell,add,who};
}
const start=f=>I.apply(f.r,f.who,'ability',{sourceUnitId:f.source});
const passAbility=f=>I.apply(f.r,f.r.pendingAbility.awaiting??1-f.who,'abilityResponse',{choice:'pass'});
const choose=(f,id)=>I.apply(f.r,f.who,'elementalChoice',{unitId:id});
const passSummon=f=>I.apply(f.r,f.r.pendingExtraSummon.awaiting??1-f.who,'extraResponse',{choice:'pass'});

test('elemental replacements: all four summon from hand deck grave after cost and two response windows',()=>{
 for(const cid of ELEMENTAL_MAGICIAN_IDS)for(const zone of ['hand','deck','grave']){
  const f=fixture(cid),target=f.add(ELEMENTAL_MAGICIAN_IDS.find(x=>x!==cid),0,zone);
  start(f);assert.ok(f.r.players[0].grave.includes(f.source));assert.equal(f.r.pendingElementalChoice,undefined);assert.ok(effectUsedThisTurn(f.r,0,target,1));
  passAbility(f);assert.ok(f.r.pendingElementalChoice);assert.ok(f.r.players[0][zone].includes(target));
  choose(f,target);assert.ok(f.r.players[0][zone].includes(target));assert.equal(f.r.pendingExtraSummon.recipe.method,'elemental');
  passSummon(f);assert.ok(f.r.players[0].field.includes(target));assert.equal(f.r.pendingExtraSummon,null);
  assert.throws(()=>I.apply(f.r,0,'ability',{sourceUnitId:target}),{status:409});
  f.r.turnNumber++;assert.ok(I.publicState(f.r,0).elementalAbilities.includes(target));
 }
});
test('elemental replacements: Wind negates the monster effect and Storm negates each origin without refund',()=>{
 for(const zone of ['hand','deck','grave']){
  const f=fixture(),target=f.add('COC-32-004',0,zone),storm=f.add('COC-14-001',1,'integration'),wind=f.add('COC-12-002',1,'field');
  start(f);const counters=I.publicState(f.r,1).pendingAbility.counters.map(c=>c.sourceUnitId);assert.ok(counters.includes(wind));assert.ok(!counters.includes(storm));
  passAbility(f);choose(f,target);assert.deepEqual(I.publicState(f.r,1).pendingExtraSummon.counters.map(c=>c.sourceUnitId),[storm]);
  I.apply(f.r,1,'extraResponse',{choice:'counter',sourceUnitId:storm});passSummon(f);
  assert.ok(f.r.players[0][zone].includes(target));assert.ok(f.r.players[0].grave.includes(f.source));assert.equal(f.r.units[storm].spellCounterGameUsed,true);assert.ok(effectUsedThisTurn(f.r,0,target,1));
 }
 const f=fixture(),wind=f.add('COC-12-002',1,'field');start(f);I.apply(f.r,1,'abilityResponse',{choice:'counter',sourceUnitId:wind});passAbility(f);
 assert.equal(f.r.pendingElementalChoice,undefined);assert.ok(f.r.players[0].grave.includes(f.source));assert.ok(effectUsedThisTurn(f.r,0,f.source,1));
});
test('elemental replacements: same physical source may return but player and effect limits stay independent',()=>{
 const f=fixture(),other=f.add('COC-32-002',1,'field');f.add('COC-32-006',1,'hand');
 markEffectUsed(f.r,0,f.source,2);start(f);passAbility(f);choose(f,f.source);passSummon(f);
 assert.ok(f.r.players[0].field.includes(f.source));assert.ok(effectUsedThisTurn(f.r,0,f.source,2));
 I.apply(f.r,1,'ability',{sourceUnitId:other});assert.ok(f.r.pendingAbility);assert.ok(effectUsedThisTurn(f.r,1,other,1));
});
test('elemental replacements: invalid source condition immunity timing and hidden choices cause no cost',()=>{
 for(const change of ['spell','immune','negated','wrong-owner','own-attack']){
  const f=fixture();if(change==='spell')I.move(f.r,f.spell,'grave',0);if(change==='immune')f.r.units[f.source].effectDestructionImmune=true;if(change==='negated')f.r.units[f.source].effectsNegated=true;if(change==='wrong-owner')I.move(f.r,f.source,'field',1);if(change==='own-attack')f.r.phase='ATTACK';
  const before=structuredClone(f.r);assert.throws(()=>start(f),{status:409});assert.deepEqual(f.r,before);
 }
 const f=fixture(),hidden=f.add('COC-32-004',0,'deck');start(f);passAbility(f);
 const enemy=I.publicState(f.r,1);assert.equal(enemy.pendingElementalChoice.choices,undefined);assert.ok(!JSON.stringify(enemy).includes(hidden));assert.ok(I.publicState(f.r,0).pendingElementalChoice.choices.some(c=>c.id===hidden));
 const before=structuredClone(f.r);assert.throws(()=>choose(f,'forged'),{status:409});assert.deepEqual(f.r,before);assert.throws(()=>I.apply(f.r,1,'elementalChoice',{unitId:hidden}),{status:409});
 assert.throws(()=>I.apply(f.r,0,'phase',{}),{status:409});
});
test('elemental replacements: opponent attack requires retarget even when same source is resummoned',()=>{
 const f=fixture('COC-32-002',1),attacker=f.add('COC-32-003',0,'field');f.r.turn=0;f.r.phase='ATTACK';
 I.apply(f.r,0,'attack',{attackerId:attacker,target:{type:'unit',id:f.source}});start(f);assert.equal(f.r.pendingAttack.stage,'retarget');passAbility(f);choose(f,f.source);passSummon(f);
 assert.equal(f.r.pendingAttack.stage,'retarget');assert.equal(f.r.units[attacker].attackCount,1);
 assert.throws(()=>I.apply(f.r,1,'defend',{}),{status:409});
 I.apply(f.r,0,'retarget',{target:{type:'unit',id:f.source}});assert.equal(f.r.pendingAttack.stage,'response');
});
test('elemental replacements: self-cost heals finish before response including simultaneous ordering and rollback',()=>{
 const f=fixture();f.r.players[0].hp=500;f.r.effects=[{type:'firstDestroyHeal',player:0,turn:5},{type:'firstDestroyHeal',player:0,turn:5}];
 start(f);assert.equal(f.r.pendingAbility.stage,'cost-triggers');assert.ok(f.r.pendingTriggerOrder);assert.equal(I.publicState(f.r,1).pendingAbility.awaiting,null);
 assert.throws(()=>passAbility(f),{status:409});
 I.apply(f.r,0,'triggerOrder',{orderedKeys:f.r.pendingTriggerOrder.effects.map(e=>e.key)});
 assert.equal(f.r.players[0].hp,800);assert.equal(f.r.pendingAbility.stage,'response');passAbility(f);choose(f,f.source);passSummon(f);
 const broken=fixture();broken.r.effectSequence=Number.MAX_SAFE_INTEGER;const before=structuredClone(broken.r);assert.throws(()=>start(broken),/overflow/);assert.deepEqual(broken.r,before);
});
test('elemental replacements: recheck summon conditions and missing target without a second cost',()=>{
 for(const change of ['spell','target','full']){
  const f=fixture(),target=f.add('COC-32-004',0,'deck');start(f);passAbility(f);choose(f,target);
  if(change==='spell')I.move(f.r,f.spell,'grave',0);if(change==='target')I.move(f.r,target,'banished',0);if(change==='full')for(let i=0;i<3;i++)f.add('COC-32-003',0,'field');
  passSummon(f);assert.ok(!f.r.players[0].field.includes(target));assert.ok(f.r.players[0].grave.includes(f.source));assert.ok(effectUsedThisTurn(f.r,0,f.source,1));
 }
});
test('elemental replacements: all AI difficulties choose forms and defend via the same action windows',()=>{
 for(const level of ['easy','medium','hard']){
  const f=fixture('COC-32-002',1);f.add('COC-32-003',1,'deck');f.r.mode='ai';f.r.aiDifficulty=level;I.runAI(f.r);assert.equal(f.r.pendingAbility.who,1);
  passAbility(f);I.runAI(f.r);assert.equal(f.r.pendingExtraSummon.who,1);passSummon(f);assert.ok(f.r.players[1].field.some(Boolean));
  const d=fixture('COC-32-002',1),attacker=d.add('COC-32-003',0,'field');d.r.mode='ai';d.r.aiDifficulty=level;d.r.turn=0;d.r.phase='ATTACK';I.apply(d.r,0,'attack',{attackerId:attacker,target:{type:'unit',id:d.source}});I.runAI(d.r);assert.equal(d.r.pendingAbility.who,1);
 }
});

test('elemental patch: all four preserve deck identity printed stats conditions and their second effect',async()=>{
 const fs=await import('node:fs');const patches=JSON.parse(fs.readFileSync(new URL('../docs/card-patches.json',import.meta.url),'utf8'));
 assert.deepEqual(patches.map(p=>p.cardId),ELEMENTAL_MAGICIAN_IDS);
 for(const p of patches){const current=I.cards.get(p.cardId);assert.deepEqual(current,{...p.before,effects:[p.afterEffect1,p.before.effects[1]]});assert.match(current.effects[0],/플레이어별/);}
 assert.equal(I.catalog.decks.length,24);assert.equal(I.catalog.cards.length,254);
});

test('elemental replacements: full fields stolen sources and later counters preserve original ownership',()=>{
 const f=fixture();f.add('COC-32-002',0,'field');f.add('COC-32-003',0,'field');start(f);passAbility(f);choose(f,f.source);passSummon(f);assert.equal(f.r.players[0].field.filter(Boolean).length,3);
 const stolen=fixture();I.move(stolen.r,stolen.source,'field',1);stolen.who=1;stolen.add('COC-32-005',1,'hand');const replacement=stolen.add('COC-32-004',1,'deck');
 start(stolen);assert.ok(stolen.r.players[0].grave.includes(stolen.source));passAbility(stolen);assert.ok(!elementalChoices(stolen.r,1,I.H).some(c=>c.id===stolen.source));choose(stolen,replacement);passSummon(stolen);assert.equal(stolen.r.units[replacement].owner,1);assert.equal(stolen.r.units[stolen.source].owner,0);
 const chain=fixture(),enemyWind=chain.add('COC-12-002',1,'field'),ownWind=chain.add('COC-12-002',0,'field');start(chain);I.apply(chain.r,1,'abilityResponse',{choice:'counter',sourceUnitId:enemyWind});I.apply(chain.r,0,'abilityResponse',{choice:'counter',sourceUnitId:ownWind});passAbility(chain);assert.ok(chain.r.pendingElementalChoice);choose(chain,chain.source);passSummon(chain);assert.ok(chain.r.players[0].field.includes(chain.source));
});
