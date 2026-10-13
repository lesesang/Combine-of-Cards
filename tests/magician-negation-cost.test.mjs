import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-magician-cost-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');

function room(a='31',b='03'){
 const r={code:'MAGCST',status:'active',turn:0,turnNumber:1,phase:'MAIN',version:1,
  players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,a,'A','token-a');
 I.createPlayer(r,b,'B','token-b');
 r.players[0].turnsTaken=1;r.players[1].turnsTaken=1;
 const place=(who,cardId,zone)=>{
  const id=r.players[who].deck.find(x=>r.units[x].cardId===cardId);
  assert.ok(id,'missing card '+cardId);
  I.move(r,id,zone,who);return id;
 };
 return {r,place};
}
test('magician negation requires a chosen distinct own hand card without changing state on invalid cost',()=>{
 const {r,place}=room();
 const spell=place(0,'COC-31-009','hand');
 const cost=place(0,'COC-31-006','hand');
 const opponentCard=place(1,'COC-03-007','hand');
 const target=place(1,'COC-03-002','field');
 const hand=[...r.players[0].hand];
 for(const costCardId of [undefined,spell,opponentCard,'nonexistent']){
  assert.throws(()=>I.apply(r,0,'play',{unitId:spell,costCardId}),/버릴 다른 자신의 손패/);
  assert.deepEqual(r.players[0].hand,hand);
  assert.ok(!r.units[target].effectsNegated);
  assert.ok(!r.players[0].grave.includes(spell));
 }
 I.apply(r,0,'play',{unitId:spell,costCardId:cost});
 assert.ok(r.players[0].grave.includes(spell));
 assert.ok(r.players[0].grave.includes(cost));
 assert.ok(r.pendingSpell);
 assert.ok(!r.units[target].effectsNegated,'cost is paid before any effect');
 I.apply(r,1,'spellResponse',{choice:'pass'});
 assert.equal(r.units[target].effectsNegated,true);
});
test('AI chooses own other hand, and the opponent state never exposes the cost hand',()=>{
 const {r,place}=room('03','31');
 const spell=place(1,'COC-31-009','hand');
 const cost=place(1,'COC-31-006','hand');
 const enemyHand=place(0,'COC-03-007','hand');
 const enemyField=place(0,'COC-03-002','field');
 assert.equal(I.chooseAISpellCost(r,1,spell),cost);
 assert.equal(I.publicState(r,0).players[1].hand,null);
 r.turn=1;
 I.apply(r,1,'play',{unitId:spell,costCardId:I.chooseAISpellCost(r,1,spell)});
 assert.ok(r.players[1].grave.includes(cost));
 assert.ok(r.players[0].hand.includes(enemyHand));
 assert.ok(!r.units[enemyField].effectsNegated);
 I.apply(r,0,'spellResponse',{choice:'pass'});
 assert.equal(r.units[enemyField].effectsNegated,true);
 assert.equal(I.chooseAISpellCost(r,1,spell),null);
});

test('BLOCK: counter preserves both paid cards and does not negate the opposing field',()=>{
 const {r,place}=room('31','14');
 const spell=place(0,'COC-31-009','hand'),cost=place(0,'COC-31-006','hand');
 const counter=place(1,'COC-14-001','integration');
 const target=place(1,'COC-14-008','field');
 I.apply(r,0,'play',{unitId:spell,costCardId:cost});
 I.apply(r,1,'spellResponse',{choice:'counter',sourceUnitId:counter});
 const saved=JSON.parse(JSON.stringify(r));
 I.apply(saved,0,'spellResponse',{choice:'pass'});
 assert.ok(!saved.units[target].effectsNegated);
 assert.deepEqual(saved.players[0].grave,[cost,spell]);
 assert.equal(saved.players[0].roundPlays,1);
 assert.equal(saved.players[0].spellsThisTurn,1);
 assert.equal(saved.pendingSpell,null);
});

test('BLOCK: resolution uses the current opposing field and never pays a second discard',()=>{
 const {r,place}=room();
 const spell=place(0,'COC-31-009','hand'),cost=place(0,'COC-31-006','hand');
 const reserve=place(0,'COC-31-005','hand');
 const old=place(1,'COC-03-002','field');
 const own=place(0,'COC-31-001','field');
 const integration=place(1,'COC-03-001','integration');
 I.apply(r,0,'play',{unitId:spell,costCardId:cost});
 // Simulate an intervening zone-changing effect at the engine boundary.
 I.move(r,old,'hand',1);
 const current=place(1,'COC-03-005','field');
 I.move(r,cost,'deck',0);
 const saved=JSON.parse(JSON.stringify(r));
 I.apply(saved,1,'spellResponse',{choice:'pass'});
 assert.ok(!saved.units[old].effectsNegated);
 assert.equal(saved.units[current].effectsNegated,true);
 assert.ok(!saved.units[own].effectsNegated);
 assert.ok(!saved.units[integration].effectsNegated);
 assert.ok(saved.players[0].deck.includes(cost));
 assert.ok(saved.players[0].hand.includes(reserve));
 I.move(saved,current,'hand',1);I.move(saved,current,'field',1);
 assert.ok(!saved.units[current].effectsNegated,'returning to hand ends the negation');
});

test('BLOCK: forged paid flags and spell prohibition cannot bypass the discard',()=>{
 const {r,place}=room();
 const spell=place(0,'COC-31-009','hand'),cost=place(0,'COC-31-006','hand');
 const before=structuredClone(r);
 assert.throws(()=>I.apply(r,0,'play',{unitId:spell,costPaid:true,paidCosts:[cost]}));
 assert.deepEqual(r,before);
 r.players[0].spellForbiddenUntil=1;
 const forbidden=structuredClone(r);
 assert.throws(()=>I.apply(r,0,'play',{unitId:spell,costCardId:cost}),/주문 사용 금지/);
 assert.deepEqual(r,forbidden);
});

test('BLOCK: all AI levels plan the discard and wait for the human response',t=>{
 // Keep easy AI's optional pass and card choice deterministic; no game dice
 // are involved in this effect. The mock is restored after this test.
 t.mock.method(crypto,'randomInt',max=>max===4?1:0);
 for(const level of ['easy','medium','hard']){
  const {r,place}=room('03','31');r.mode='ai';r.aiDifficulty=level;r.turn=1;
  const target=place(0,'COC-03-002','field');
  const spell=place(1,'COC-31-009','hand'),cost=place(1,'COC-31-004','hand');
  I.runAI(r);
  assert.equal(r.pendingSpell?.cardId,'COC-31-009',level);
  assert.deepEqual(r.players[1].grave,[cost,spell]);
  assert.ok(!r.units[target].effectsNegated);
  I.apply(r,0,'spellResponse',{choice:'pass'});
  assert.equal(r.units[target].effectsNegated,true);
 }
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
