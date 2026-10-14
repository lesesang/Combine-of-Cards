import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {choiceResponseSpellIds} from '../src/spell-choice-batch.mjs';
import {choiceFixture,assertChoiceResult} from './helpers/spell-choice-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-choice-'));process.env.DATA_DIR=dir;
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const pass=f=>I.apply(f.r,f.other,'spellResponse',{choice:'pass'});
test('choice batch: every spell waits, persists and resolves its printed clause',async t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?0:min);
 for(const cardId of choiceResponseSpellIds)await t.test(cardId,()=>{
  const f=choiceFixture(I,cardId);I.apply(f.r,0,'play',f.body);
  assert.equal(f.r.pendingSpell.cardId,cardId);assert.ok(f.r.players[0].grave.includes(f.spell));
  assert.equal(f.r.units[f.target].hp,cardId==='COC-30-004'?1:1000);
  f.r=JSON.parse(JSON.stringify(f.r));pass(f);assert.equal(f.r.pendingSpell,null);assertChoiceResult(f,cardId);
 });
});
test('choice batch: counter preserves paid HP and deck costs without applying effects',async t=>{
 for(const cardId of choiceResponseSpellIds)await t.test(cardId,()=>{
  const f=choiceFixture(I,cardId);I.apply(f.r,0,'play',f.body);
  const snapshot=JSON.parse(JSON.stringify(f.r));
  I.apply(f.r,1,'spellResponse',{choice:'counter',sourceUnitId:f.counter});
  f.r=JSON.parse(JSON.stringify(f.r));I.apply(f.r,0,'spellResponse',{choice:'pass'});
  assert.deepEqual(f.r.players,snapshot.players);
  delete f.r.units[f.counter];delete snapshot.units[f.counter];assert.deepEqual(f.r.units,snapshot.units);
  assert.equal(f.r.players[0].hp,['COC-05-002','COC-31-007'].includes(cardId)?900:cardId==='COC-27-010'?800:1000);
  if(cardId==='COC-14-002')assert.ok(f.r.players[0].grave.includes(f.costTop));
 });
});
test('choice batch: all three AI levels cast and counter every spell using legal choices',t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?(min===4?1:0):min);
 for(const cardId of choiceResponseSpellIds)for(const level of ['easy','medium','hard']){
  const f=choiceFixture(I,cardId,1);f.r.mode='ai';f.r.aiDifficulty=level;
  f.r.players[1].aiRejectedAbilities=[...f.r.players[1].field,f.r.players[1].integration].filter(Boolean);
  I.runAI(f.r);assert.equal(f.r.pendingSpell?.cardId,cardId,cardId+level);
  assert.ok(!f.r.logs.some(e=>e.text.includes('건너뛰었습니다')));pass(f);assert.equal(f.r.pendingSpell,null);
  const g=choiceFixture(I,cardId);g.r.mode='ai';g.r.aiDifficulty=level;I.apply(g.r,0,'play',g.body);I.runAI(g.r);
  assert.equal(g.r.pendingSpell?.awaiting,0,cardId+level);
  I.apply(g.r,0,'spellResponse',{choice:'pass'});assert.equal(g.r.pendingSpell,null);
 }
});
test('choice batch: invalid targets, options and costs reject before mutation',()=>{
 const cases=[['COC-05-006',f=>f.body.targets=[f.target,f.target]],
  ['COC-05-007',f=>I.move(f.r,f.land,'grave',0)],
  ['COC-14-009',f=>f.body.option=3],['COC-23-009',f=>delete f.body.option],
  ['COC-27-010',f=>f.body.target.id=f.target],
  ['COC-30-011',f=>f.r.players[0].natureSpellTurns=[3]],
  ['COC-31-007',f=>f.r.players[0].hp=100],['COC-05-002',f=>f.r.players[0].hp=100],
  ['COC-14-002',f=>{for(const id of [...f.r.players[0].deck])I.move(f.r,id,'hand',0);}]];
 for(const [cardId,invalidate] of cases){const f=choiceFixture(I,cardId);invalidate(f);const before=structuredClone(f.r);
  assert.throws(()=>I.apply(f.r,0,'play',{...f.body,activationValidated:true}),{status:409},cardId);assert.deepEqual(f.r,before,cardId);
 }
});
test('choice batch: changed targets and full destination fizzle without refund or retarget',()=>{
 for(const cardId of ['COC-05-007','COC-23-009','COC-27-010','COC-30-004','COC-31-007']){
  const f=choiceFixture(I,cardId);I.apply(f.r,0,'play',f.body);
  I.move(f.r,f.body.target.id,'hand',f.r.units[f.body.target.id].owner);const hp=f.r.players.map(p=>p.hp);
  pass(f);assert.equal(f.r.pendingSpell,null);assert.ok(f.r.players[0].grave.includes(f.spell));assert.deepEqual(f.r.players.map(p=>p.hp),hp);
 }
 for(const cardId of ['COC-05-002','COC-05-007','COC-31-007']){
  const f=choiceFixture(I,cardId);I.apply(f.r,0,'play',f.body);
  while(f.r.players[0].field.includes(null))I.H.summonToken(f.r,0,'occupied',1,1);
  pass(f);assert.ok(f.r.players[0].grave.includes(f.spell));assert.ok(f.r.players[1].field.includes(f.target));
 }
});
test('choice batch: arrows shares one roll and resolves surviving legal targets only',t=>{
 let rolls=0;t.mock.method(crypto,'randomInt',(min,max)=>{if(max===151)rolls++;return max===undefined?0:max-1;});
 const f=choiceFixture(I,'COC-05-006');I.apply(f.r,0,'play',f.body);I.move(f.r,f.second,'hand',1);pass(f);
 assert.equal(f.r.units[f.target].hp,850);assert.equal(rolls,1);
});
test('choice batch: selectable second modes summon a token or damage any chosen player',()=>{
 const f=choiceFixture(I,'COC-14-009');f.body.option=2;I.apply(f.r,0,'play',f.body);pass(f);
 assert.equal(f.r.players[0].field.filter(Boolean).length,2);assert.equal(f.r.players[1].hp,1000);
 const g=choiceFixture(I,'COC-23-009');g.body.option=2;g.body.target={type:'player',player:0};I.apply(g.r,0,'play',g.body);pass(g);
 assert.equal(g.r.players[0].hp,800);assert.equal(g.r.players[1].hp,1000);
});
test('choice batch: Spider returns only after actual lethal damage and never duplicates a moved source',t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?0:max-1);
 for(const immune of ['damageInvulnerable','oneDamage']){
  const f=choiceFixture(I,'COC-30-004');f.r.units[f.target].hp=2;
  if(immune==='oneDamage')f.r.units[f.target].cardId='COC-09-002';else f.r.units[f.target][immune]=true;
  I.apply(f.r,0,'play',f.body);pass(f);assert.ok(f.r.players[0].grave.includes(f.spell));assert.ok(f.r.players[1].field.includes(f.target));
 }
 const f=choiceFixture(I,'COC-30-004');I.apply(f.r,0,'play',f.body);I.move(f.r,f.spell,'banished',0);pass(f);
 assert.ok(f.r.players[0].banished.includes(f.spell));assert.ok(!f.r.players[0].hand.includes(f.spell));assert.ok(f.r.players[1].grave.includes(f.target));
});

test('choice batch: HP payment boundaries and lethal activation damage do not create free effects',()=>{
 for(const cardId of ['COC-05-002','COC-31-007']){
  const f=choiceFixture(I,cardId);f.r.players[0].hp=101;I.apply(f.r,0,'play',f.body);
  assert.equal(f.r.players[0].hp,1);pass(f);assert.equal(f.r.players[0].hp,1);
 }
 const f=choiceFixture(I,'COC-27-010');f.r.players[0].hp=200;I.apply(f.r,0,'play',f.body);
 assert.equal(f.r.players[0].hp,0);assert.equal(f.r.status,'finished');assert.equal(f.r.winner,1);
 assert.equal(f.r.pendingSpell,null);assert.equal(f.r.units[f.fighter].superiorClaw,undefined);
});
test('choice batch: grave-count spells honor any target and resolution-time counts',t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?0:max-1);
 const f=choiceFixture(I,'COC-03-007');f.body.target={type:'player',player:0};I.apply(f.r,0,'play',f.body);pass(f);
 assert.equal(f.r.players[0].hp,900);
 const g=choiceFixture(I,'COC-03-008');g.body.target={type:'player',player:1};I.apply(g.r,0,'play',g.body);
 I.move(g.r,g.ally,'grave',0);pass(g);assert.equal(g.r.players[1].hp,1200);
});

test('choice batch: AI uses token and direct-damage alternatives when the battlefield changes',t=>{
 t.mock.method(crypto,'randomInt',(min,max)=>max===undefined?(min===4?1:0):min);
 for(const cardId of ['COC-14-009','COC-23-009'])for(const level of ['easy','medium','hard']){
  const f=choiceFixture(I,cardId,1);f.r.mode='ai';f.r.aiDifficulty=level;
  if(cardId==='COC-14-009')I.move(f.r,f.ally,'grave',1);else I.move(f.r,f.target,'grave',0);
  f.r.players[1].aiRejectedAbilities=[...f.r.players[1].field,f.r.players[1].integration].filter(Boolean);
  I.runAI(f.r);assert.equal(f.r.pendingSpell?.cardId,cardId);pass(f);
  if(cardId==='COC-14-009')assert.equal(f.r.players[1].field.filter(Boolean).length,1);
  else assert.equal(f.r.players[0].hp,800);
 }
});
