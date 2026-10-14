import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-nature-history-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
function setup(a='30',b='03'){
 const r={code:'NAT123',status:'active',turn:0,turnNumber:1,phase:'MAIN',version:1,
  players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,a,'A','a');I.createPlayer(r,b,'B','b');r.players[0].turnsTaken=1;
 const place=(who,cardId,to)=>{
  const id=r.players[who].deck.find(x=>r.units[x]?.cardId===cardId);
  assert.ok(id,'missing '+cardId);I.move(r,id,to,who);return id;
 };
 return {r,place};
}

test('Nature consecutive-turn requirement rejects a single previous Nature casting turn',()=>{
 const {r,place}=setup();
 const first=place(0,'COC-30-005','hand');
 I.apply(r,0,'play',{unitId:first});
 I.apply(r,1,'spellResponse',{choice:'pass'});
 assert.deepEqual(r.players[0].natureSpellTurns,[1]);
 r.turnNumber=5;
 const bite=place(0,'COC-30-011','hand');
 assert.throws(()=>I.apply(r,0,'play',{unitId:bite,target:{type:'player',player:1}}),/지난 자신의 두 턴/);
 assert.ok(r.players[0].hand.includes(bite));
 assert.equal(r.players[1].hp,1000);
});

test('Nature spells cast on the two prior own turns unlock a 200-damage direct attack spell',()=>{
 const {r,place}=setup();
 const first=place(0,'COC-30-005','hand');
 I.apply(r,0,'play',{unitId:first});
 I.apply(r,1,'spellResponse',{choice:'pass'});
 r.turnNumber=3;
 const second=place(0,'COC-30-007','hand');
 I.apply(r,0,'play',{unitId:second,target:{type:'player',player:0}});
 I.apply(r,1,'spellResponse',{choice:'pass'});
 assert.deepEqual(r.players[0].natureSpellTurns,[1,3]);
 r.turnNumber=5;
 const bite=place(0,'COC-30-011','hand');
 I.apply(r,0,'play',{unitId:bite,target:{type:'player',player:1}});
 I.apply(r,1,'spellResponse',{choice:'pass'});
 assert.equal(r.players[1].hp,800);
 assert.deepEqual(r.players[0].natureSpellTurns,[1,3,5]);
});

test('Bite must target the opposing player itself, never an opponent monster',()=>{
 const {r,place}=setup();
 r.turnNumber=5;r.players[0].natureSpellTurns=[1,3];
 const bite=place(0,'COC-30-011','hand'),foe=place(1,'COC-03-002','field');
 assert.throws(()=>I.apply(r,0,'play',{unitId:bite,target:{type:'unit',id:foe}}),/상대 플레이어 본체/);
 assert.ok(r.players[0].hand.includes(bite));
 assert.ok(r.players[1].field.includes(foe));
});

test('Burning Soul self-damage equals the attack bonus from a single 1d5 roll',()=>{
 const {r,place}=setup('20','03');
 const monster=place(0,'COC-20-001','field');
 const spell=place(0,'COC-20-004','hand');
 const initial=r.units[monster].atk;
 I.apply(r,0,'play',{unitId:spell,target:{type:'unit',id:monster}});
 I.apply(r,1,'spellResponse',{choice:'pass'});
 const delta=1000-r.players[0].hp;
 assert.ok(delta>=100&&delta<=500&&delta%100===0,'roll must be 1d5 multiplied by 100');
 assert.equal(r.units[monster].atk,initial+delta);
 assert.ok(r.players[0].grave.includes(spell));
 I.move(r,monster,'grave',0);
 assert.equal(r.units[monster].atk,initial,'attack gain resets after leaving field');
});

test('Burning Soul rejects an enemy as the buff target without consuming the spell',()=>{
 const {r,place}=setup('20','03');
 const spell=place(0,'COC-20-004','hand'),foe=place(1,'COC-03-002','field');
 assert.throws(()=>I.apply(r,0,'play',{unitId:spell,target:{type:'unit',id:foe}}),/자신 필드/);
 assert.equal(r.players[0].hp,1000);
 assert.ok(r.players[0].hand.includes(spell));
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
