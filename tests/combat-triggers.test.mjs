import test from 'node:test';
import assert from 'node:assert/strict';
import {gameTestInternals as I} from '../server.mjs';

test('hyper match survives otherwise lethal battle damage, but not nonbattle damage',()=>{
 const room={players:[],units:{},logs:[],turn:0,turnNumber:1,status:'active'};
 I.createPlayer(room,'26','Self','my-key');I.createPlayer(room,'03','Foe','other-key');
 const unit=room.players[0].extra.find(id=>room.units[id].cardId==='COC-26-011');
 assert.ok(unit);I.move(room,unit,'field',0);
 room.units[unit].hp=35;
 assert.equal(I.damageUnit(room,unit,-100,{battle:true}),false);
 assert.equal(room.units[unit].hp,1);
 assert.ok(room.players[0].field.includes(unit));
 assert.equal(I.damageUnit(room,unit,-20),true);
 assert.ok(room.players[0].grave.includes(unit));
});

test('bonus attack is available only within the earned turn',()=>{
 const unit={cardId:'COC-32-011',attackCountTurn:7,attackCount:1,bonusAttackCount:1,bonusAttackTurn:7};
 assert.equal(I.maxAttacks(unit,7),2);
 assert.equal(I.attackAvailable(unit,7),true);
 unit.attackCount=2;
 assert.equal(I.attackAvailable(unit,7),false);
 assert.equal(I.maxAttacks(unit,8),1);
 assert.equal(I.attackAvailable(unit,8),true);
});

test('base double-attacking weapon retains its regular allowance',()=>{
 const unit={cardId:'COC-09-003',attackCountTurn:5,attackCount:1};
 assert.equal(I.maxAttacks(unit,5),2);
 assert.equal(I.attackAvailable(unit,5),true);
 unit.attackCount=2;assert.equal(I.attackAvailable(unit,5),false);
});
