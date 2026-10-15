import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-spell-response-four-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));

function room(deck,spellCard){
 const r={code:'SPFOUR',status:'active',version:1,turn:0,turnNumber:3,phase:'MAIN',
  players:[],units:{},logs:[],effects:[],mode:'pvp',
  pendingAttack:null,pendingExtraSummon:null,pendingSpell:null,pendingManual:null,
  pendingTriggerOrder:null};
 I.createPlayer(r,deck,'Caster','a');I.createPlayer(r,'03','Enemy','b');
 r.players[0].turnsTaken=2;r.players[1].turnsTaken=2;
 const take=(who,cardId,to)=>{
  const id=r.players[who].deck.find(uid=>r.units[uid].cardId===cardId);
  assert.ok(id,'missing card '+cardId);
  I.move(r,id,to,who);return id;
 };
 return {r,spell:take(0,spellCard,'hand'),take};
}
function declare(r,id){
 const result=I.apply(r,0,'play',{unitId:id});
 assert.ok(result.pendingSpell);
 assert.ok(r.players[0].grave.includes(id));
 assert.equal(r.effectStack.length,1);
 return JSON.parse(JSON.stringify(r));
}
function pass(r){
 const out=I.apply(r,1,'spellResponse',{choice:'pass'});
 assert.equal(out.pendingSpell,null);
 assert.equal(r.effectStack.length,0);
}

test('R01: Predator banquet pays opponent draw before response and searches by explicit choice',()=>{
 const {r,spell}=room('07','COC-07-004');
 const candidate=r.players[0].deck.find(uid=>/포식자 알리자|포식의 맹약/.test(I.cards.get(r.units[uid].cardId)?.name||''));
 assert.ok(candidate,'source deck must have a searchable named card');
 const enemyDeck=r.players[1].deck.length;
 const saved=declare(r,spell);
 assert.equal(r.players[0].hand.length,0);
 assert.equal(r.players[1].deck.length,enemyDeck-1);
 assert.ok(r.players[0].deck.includes(candidate));
 pass(saved);
 assert.equal(saved.players[1].hand.length,1);
 assert.ok(saved.pendingDeckSearch);
 I.apply(saved,0,'deckSearch',{unitId:candidate});
 assert.ok(saved.players[0].hand.includes(candidate));
 assert.equal(saved.players[1].deck.length,enemyDeck-1);
});

test('R01: Self-Devour draw/mill, own heal and integration buff resolve in one step',()=>{
 const {r,spell,take}=room('07','COC-07-011');
 const integration=take(0,'COC-07-001','integration');
 const baseAtk=r.units[integration].atk;
 r.players[0].hp=320;
 const before=r.players[1].deck.length;
 declare(r,spell);
 assert.equal(r.players[0].hp,320);
 assert.equal(r.units[integration].atk,baseAtk);
 assert.equal(r.players[1].deck.length,before);
 pass(r);
 assert.equal(r.players[0].hp,620);
 assert.equal(r.units[integration].atk,baseAtk+150);
 assert.equal(r.effects.find(e=>e.type==='selfDevourBuff').amount,150);
 I.processEndOfTurn(r);assert.equal(r.units[integration].atk,baseAtk);
 assert.equal(r.players[1].hand.length,1);
 assert.equal(r.players[1].grave.length,3);
});

test('R01: Pharaoh summons exactly up to three mummy tokens after opponent pass',()=>{
 const {r,spell}=room('17','COC-17-004');
 declare(r,spell);
 assert.equal(r.players[0].field.filter(Boolean).length,0);
 pass(r);
 const spawned=r.players[0].field.filter(Boolean);
 assert.equal(spawned.length,3);
 assert.ok(spawned.every(id=>r.units[id]?.created&&r.units[id]?.tokenCard?.name==='미라 병사'));
 assert.ok(spawned.every(id=>r.units[id].atk===60&&r.units[id].hp===80));
});

test('R01: coin-card spell draws after pass and random opponent discard only on heads',()=>{
 for(const roll of [1,2]){
  const {r,spell,take}=room('31','COC-31-005');
  const hidden=take(1,'COC-03-002','hand');
  const deck=r.players[0].deck.length;
  declare(r,spell);
  assert.equal(r.players[0].hand.length,0);
  assert.ok(r.players[1].hand.includes(hidden));
  const original=I.H.roll;
  I.H.roll=()=>roll;
  try{pass(r)}finally{I.H.roll=original;}
  assert.equal(r.players[0].hand.length,1);
  assert.equal(r.players[0].deck.length,deck-1);
  assert.equal(r.players[1].grave.includes(hidden),roll===1);
  assert.equal(r.players[1].hand.includes(hidden),roll===2);
 }
});
