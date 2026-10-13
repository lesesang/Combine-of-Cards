import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-destruction-events-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
function make(a='30',b='03'){
 const r={code:'EVE123',status:'active',turn:0,turnNumber:3,phase:'MAIN',version:1,players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,a,'A','first');
 I.createPlayer(r,b,'B','second');
 r.players[0].turnsTaken=2;
 const place=(who,cardId,zone)=>{
  const id=r.players[who].deck.find(x=>r.units[x].cardId===cardId);
  assert.ok(id,'missing '+cardId);
  I.move(r,id,zone,who);return id;
 };
 return {r,place};
}
test('destruction ledger records the turn and controller before the card moves',()=>{
 const {r,place}=make();
 const foe=place(1,'COC-03-002','field');
 I.H.destroy(r,foe);
 assert.ok(r.players[1].grave.includes(foe));
 assert.deepEqual(r.destructionHistory.map(({turnNumber,activePlayer,controller})=>({turnNumber,activePlayer,controller})),
  [{turnNumber:3,activePlayer:0,controller:1}]);
});
test('fertilizer spell deals 100 per enemy monster destroyed during previous own turn',()=>{
 const {r,place}=make();
 const first=place(1,'COC-03-002','field'),second=place(1,'COC-03-005','field');
 I.H.destroy(r,first);I.H.destroy(r,second);
 // Previous own turn was global turn 3, current own turn is 5.
 r.turnNumber=5;
 const spell=place(0,'COC-30-002','hand');
 I.apply(r,0,'play',{unitId:spell,target:{type:'player',player:1}});
 assert.equal(r.players[1].hp,800);
 assert.ok(r.players[0].grave.includes(spell));
});
test('fertilizer ignores monsters destroyed on the opponent turn',()=>{
 const {r,place}=make();
 const first=place(1,'COC-03-002','field');
 r.turn=1;r.turnNumber=4;I.H.destroy(r,first);
 r.turn=0;r.turnNumber=5;
 const spell=place(0,'COC-30-002','hand');
 I.apply(r,0,'play',{unitId:spell,target:{type:'player',player:1}});
 assert.equal(r.players[1].hp,1000);
});
test('Superior Claw rejects non-Fighter and does not consume 200 HP',()=>{
 const {r,place}=make('27','03');
 const spell=place(0,'COC-27-010','hand'),wrong=place(0,'COC-27-001','field');
 assert.throws(()=>I.apply(r,0,'play',{unitId:spell,target:{type:'unit',id:wrong}}),/슈페리얼 파이터/);
 assert.equal(r.players[0].hp,1000);
 assert.ok(r.players[0].hand.includes(spell));
});
test('Superior Claw grants persistent battle-trigger and deals destroyed enemy attack',()=>{
 const {r,place}=make('27','03');
 const spell=place(0,'COC-27-010','hand');
 const fighter=place(0,'COC-27-008','field');
 const enemy=place(1,'COC-03-002','field');
 const enemyAtk=r.units[enemy].atk;
 I.apply(r,0,'play',{unitId:spell,target:{type:'unit',id:fighter}});
 assert.equal(r.players[0].hp,800);
 assert.equal(r.units[fighter].superiorClaw,true);
 r.units[enemy].hp=1;
 r.phase='ATTACK';
 I.apply(r,0,'attack',{attackerId:fighter,target:{type:'unit',id:enemy}});
 I.apply(r,1,'defend',{});
 assert.ok(r.players[1].grave.includes(enemy));
 assert.equal(r.players[1].hp,1000-enemyAtk);
 I.move(r,fighter,'grave',0);
 assert.equal(r.units[fighter].superiorClaw,undefined);
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
