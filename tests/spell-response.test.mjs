import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-spell-response-'));
process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));

function setup(deck='07',cardId='COC-07-003',mode='pvp'){
 const r={code:'SPELL',status:'active',version:1,turn:0,turnNumber:3,phase:'MAIN',
  mode,players:[],units:{},logs:[],effects:[],pendingManual:null,
  pendingAttack:null,pendingExtraSummon:null,pendingSpell:null,pendingTriggerOrder:null};
 I.createPlayer(r,deck,'Caster','a');I.createPlayer(r,'03','Opponent','b');
 r.players[0].turnsTaken=2;r.players[1].turnsTaken=2;
 const source=r.players[0].deck.find(id=>r.units[id].cardId===cardId);
 assert.ok(source,cardId);I.move(r,source,'hand',0);
 return {r,source};
}

test('R01: first supported automated spell pays card use and queues a JSON response stack',()=>{
 const {r,source}=setup();
 const beforeDeck=r.players[1].deck.length;
 const preview=I.apply(r,0,'play',{unitId:source});
 assert.equal(preview.pendingSpell.card.id,'COC-07-003');
 assert.equal(preview.pendingSpell.who,0);
 assert.equal(r.players[1].deck.length,beforeDeck,'draw/mill must not occur before response');
 assert.equal(r.players[1].hand.length,0);
 assert.ok(r.players[0].grave.includes(source),'card already paid as usage cost');
 assert.equal(r.effectStack.length,1);
 assert.equal(r.effectStack[0].exception,'self-cost');
 assert.equal(r.effectStack[0].sourceId,source);
 assert.equal(r.players[0].roundPlays,1,'declaration counts as a card use');
 assert.equal(JSON.parse(JSON.stringify(r)).pendingSpell.sourceId,source);
 assert.equal(I.publicState(r,1).players[0].hand,null);
 assert.equal(I.publicState(r,1).pendingSpell.sourceId,undefined,'internal UID is private');
 assert.throws(()=>I.apply(r,0,'spellResponse',{choice:'pass'}),/상대가/);
 assert.throws(()=>I.apply(r,1,'spellResponse',{choice:'negate'}),/무효화 응답은 사용할 수 없습니다/);
 assert.throws(()=>I.apply(r,0,'phase',{}),/주문 대응/);
 assert.throws(()=>I.apply(r,0,'play',{unitId:source}),/주문 대응/);
 const result=I.apply(r,1,'spellResponse',{choice:'pass'});
 assert.equal(result.pendingSpell,null);
 assert.equal(r.effectStack.length,0);
 assert.equal(r.players[1].deck.length,beforeDeck-4,'opponent draws 1 and mills 3 only upon resolution');
 assert.equal(r.players[1].hand.length,1);
 assert.equal(r.players[1].grave.length,3);
 assert.ok(r.logs.some(e=>e.text.includes('주문 효과 해결')));
 assert.throws(()=>I.apply(r,1,'spellResponse',{choice:'pass'}),/상대가/);
});

test('R01: serialized response can be resumed after a server restart without double resolution',()=>{
 const {r,source}=setup();
 I.apply(r,0,'play',{unitId:source});
 const restored=JSON.parse(JSON.stringify(r));
 I.apply(restored,1,'spellResponse',{choice:'pass'});
 assert.equal(restored.pendingSpell,null);
 assert.equal(restored.effectStack.length,0);
 assert.equal(restored.players[1].hand.length,1);
 assert.equal(restored.players[1].grave.length,3);
 assert.ok(restored.players[0].grave.includes(source));
});

test('R01: different proven spells apply HP effects only after the response window',()=>{
 for(const [deck,card,whoDelta,enemyDelta] of [
  ['13','COC-13-007',100,-100],
  ['17','COC-17-003',150,0]
 ]){
  const {r,source}=setup(deck,card);
  const hp0=r.players[0].hp,hp1=r.players[1].hp;
  I.apply(r,0,'play',{unitId:source});
  assert.equal(r.players[0].hp,hp0);
  assert.equal(r.players[1].hp,hp1);
  I.apply(r,1,'spellResponse',{choice:'pass'});
  assert.equal(r.players[0].hp,hp0+whoDelta);
  assert.equal(r.players[1].hp,hp1+enemyDelta);
  assert.equal(r.pendingSpell,null);
 }
});

test('R01: AI opponent uses the identical server-side spell-pass action',()=>{
 const {r,source}=setup('07','COC-07-003','ai');
 I.apply(r,0,'play',{unitId:source});
 I.runAI(r);
 assert.equal(r.pendingSpell,null);
 assert.equal(r.players[1].hand.length,1);
 assert.equal(r.players[1].grave.length,3);
});

test('R01: bogus counterspell request leaves pending state unchanged',()=>{
 const {r,source}=setup();
 I.apply(r,0,'play',{unitId:source});
 const before=structuredClone(r);
 assert.throws(()=>I.apply(r,1,'spellResponse',{choice:'negate',target:source}),/무효화 응답은 사용할 수 없습니다/);
 assert.deepEqual(r,before);
});

test('R01: concession while spell is pending ends game without resolving queued effect',()=>{
 const {r,source}=setup();
 const before=r.players[1].deck.length;
 I.apply(r,0,'play',{unitId:source});
 I.apply(r,1,'concede',{});
 assert.equal(r.pendingSpell,null);
 assert.equal(r.effectStack.length,0);
 assert.equal(r.players[1].deck.length,before);
 assert.equal(r.status,'finished');
 assert.ok(r.players[0].grave.includes(source));
});
