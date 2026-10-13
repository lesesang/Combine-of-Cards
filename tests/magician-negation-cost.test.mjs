import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
 assert.equal(r.units[enemyField].effectsNegated,true);
 assert.equal(I.chooseAISpellCost(r,1,spell),null);
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
