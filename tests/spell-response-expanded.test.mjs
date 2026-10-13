import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-spell-response-expanded-'));
process.env.DATA_DIR=dir;
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));

function fixture(deckId,cardId,mode='pvp') {
 const r={code:'EXPAND',status:'active',version:1,turn:0,turnNumber:3,phase:'MAIN',
  mode,players:[],units:{},logs:[],effects:[],pendingManual:null,
  pendingAttack:null,pendingExtraSummon:null,pendingSpell:null,pendingTriggerOrder:null};
 I.createPlayer(r,deckId,'Caster','a');
 I.createPlayer(r,'03','Opponent','b');
 r.players[0].turnsTaken=2;r.players[1].turnsTaken=2;
 const id=r.players[0].deck.find(id=>r.units[id].cardId===cardId);
 assert.ok(id,'missing spell '+cardId);
 assert.equal(I.cards.get(cardId)?.type,'주문','only spells may enter this response registry');
 I.move(r,id,'hand',0);
 return {r,id};
}
const declare=(r,id)=>{
 const before=structuredClone(r);
 const view=I.apply(r,0,'play',{unitId:id});
 assert.equal(view.pendingSpell.card.id,before.units[id].cardId);
 assert.equal(view.pendingSpell.sourceId,undefined);
 assert.ok(r.players[0].grave.includes(id));
 assert.equal(r.effectStack.length,1);
 assert.equal(r.players[0].roundPlays,(before.players[0].roundPlays||0)+1);
 assert.equal(r.pendingSpell.sourceId,id);
 return before;
};
const resolve=r=>{
 const result=I.apply(r,1,'spellResponse',{choice:'pass'});
 assert.equal(result.pendingSpell,null);
 assert.equal(r.effectStack.length,0);
 return result;
};

test('R01: previous-turn draw/mill spell waits for resolution and uses saved history',()=>{
 const {r,id}=fixture('07','COC-07-010');
 r.players[1].lastRoundPlays=2;
 const before=r.players[1].deck.length;
 declare(r,id);
 assert.equal(r.players[1].deck.length,before);
 const saved=JSON.parse(JSON.stringify(r));
 resolve(saved);
 assert.equal(saved.players[1].hand.length,1);
 assert.equal(saved.players[1].grave.length,2);
 assert.equal(saved.players[1].deck.length,before-3);
});
test('R01: Yokai field-count healing is resolved only after opponent passes',()=>{
 const {r,id}=fixture('08','COC-08-007');
 const source=r.players[0].deck.find(uid=>I.cards.get(r.units[uid].cardId)?.attribute==='요괴'&&
  I.cards.get(r.units[uid].cardId)?.type==='몬스터');
 assert.ok(source,'fixture must contain a Yokai monster');
 I.move(r,source,'field',0);
 r.players[0].hp=440;
 declare(r,id);
 assert.equal(r.players[0].hp,440);
 resolve(r);
 assert.equal(r.players[0].hp,540);
});
test('R01: one-shot destroy recovery is registered at resolution, not declaration',()=>{
 const {r,id}=fixture('10','COC-10-009');
 declare(r,id);
 assert.equal(r.effects.filter(e=>e.type==='firstDestroyHeal').length,0);
 resolve(r);
 assert.equal(r.effects.filter(e=>e.type==='firstDestroyHeal').length,1);
 assert.equal(r.effects.find(e=>e.type==='firstDestroyHeal').player,0);
});
test('R01: optional deck monster search does not move a card before resolution',()=>{
 const {r,id}=fixture('19','COC-19-004');
 const oldHand=r.players[0].hand.length;
 const available=r.players[0].deck.filter(uid=>I.cards.get(r.units[uid].cardId)?.type==='몬스터');
 assert.ok(available.length);
 declare(r,id);
 assert.equal(r.players[0].hand.length,oldHand-1);
 resolve(r);
 assert.equal(r.players[0].hand.length,oldHand);
 assert.ok(available.some(uid=>r.players[0].hand.includes(uid)));
});
test('R01/R19: one shared die applies simultaneous damage to both players after pass',()=>{
 const {r,id}=fixture('20','COC-20-005');
 r.players[0].hp=1200;r.players[1].hp=1200;
 declare(r,id);
 assert.equal(r.players[0].hp,1200);
 assert.equal(r.players[1].hp,1200);
 resolve(r);
 const self=1200-r.players[0].hp,other=1200-r.players[1].hp;
 assert.ok(self>=1&&self<=200);
 assert.equal(other,self,'one die must affect both players by the same amount');
});
test('R01: next-turn spell and draw bonuses are registered after pass',()=>{
 const {r,id}=fixture('30','COC-30-005');
 const plays=r.players[0].turnsTaken;
 declare(r,id);
 assert.equal(r.players[0].spellDiceBonus||0,0);
 assert.equal(r.players[0].bonusDrawOnTurn||0,0);
 resolve(r);
 assert.equal(r.players[0].spellDiceBonus,50);
 assert.equal(r.players[0].bonusDrawOnTurn,plays+1);
});
test('R01: unconditional healing starts after response; one pass only',()=>{
 const {r,id}=fixture('30','COC-30-007');
 r.players[0].hp=250;
 declare(r,id);
 assert.equal(r.players[0].hp,250);
 assert.throws(()=>I.apply(r,1,'spellResponse',{choice:'negate'}),/무효화 응답은 사용할 수 없습니다/);
 assert.equal(r.players[0].hp,250);
 resolve(r);
 assert.equal(r.players[0].hp,550);
 assert.throws(()=>I.apply(r,1,'spellResponse',{choice:'pass'}),/상대가/);
});
test('R01: AI passes the response for a newly queued spell through normal action',()=>{
 const {r,id}=fixture('30','COC-30-007','ai');
 r.players[0].hp=100;
 declare(r,id);
 I.runAI(r);
 assert.equal(r.pendingSpell,null);
 assert.equal(r.players[0].hp,400);
});
