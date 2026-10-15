import test from 'node:test';
import assert from 'node:assert/strict';
import {gameTestInternals as I} from '../server.mjs';
import {FIELD_ABILITY_IDS} from '../src/field-abilities.mjs';

function setup(deck='13',opponent='03'){
 const r={players:[],units:{},logs:[],effects:[],turn:0,turnNumber:1,phase:'MAIN',status:'active'};
 I.createPlayer(r,deck,'A','password-a');I.createPlayer(r,opponent,'B','password-b');
 const take=(side,cardId,zone)=>{
  const p=r.players[side],id=[...p.deck,...p.extra].find(x=>r.units[x]?.cardId===cardId);
  assert.ok(id,'missing '+cardId);
  if(zone)I.move(r,id,zone,side);
  return id;
 };
 const use=(sourceUnitId,options={})=>I.applyFieldAbility(r,0,{sourceUnitId,...options},I.H);
 return {r,take,use};
}
test('17 field ability handlers are registered distinctly',()=>{
 assert.equal(FIELD_ABILITY_IDS.length,19);
 assert.equal(new Set(FIELD_ABILITY_IDS).size,19);
});
test('shaman talisman searches anywhere exactly once per turn',()=>{
 const {r,take,use}=setup('03');
 const source=take(0,'COC-03-002','field');
 const beria=r.players[0].deck.find(id=>r.units[id].cardId==='COC-03-001');
 use(source);
 assert.ok(r.players[0].hand.includes(beria));
 assert.throws(()=>use(source),/이번 턴/);
});
test('great thief captures opposing monster without changing card ownership',()=>{
 const {r,take,use}=setup('13');
 const source=take(0,'COC-13-001','integration');
 const target=take(1,'COC-03-005','field');
 use(source,{target:{type:'unit',id:target}});
 assert.ok(r.players[0].field.includes(target));
 assert.equal(r.units[target].owner,1);
 assert.throws(()=>use(source,{target:{type:'unit',id:target}}),/이번 턴/);
});
test('cartoon return refuses friendly card and accepts opponent monster',()=>{
 const {r,take,use}=setup('05');
 const source=take(0,'COC-05-004','field');
 const target=take(1,'COC-03-005','field');
 assert.throws(()=>use(source,{target:{type:'unit',id:source}}),/대상/);
 use(source,{target:{type:'unit',id:target}});
 assert.ok(r.players[1].deck.includes(target));
});
test('Kurokurobi returns one selected hand card and draws one',()=>{
 const {r,take,use}=setup('08');
 const source=take(0,'COC-08-003','field');
 const hand=take(0,'COC-08-001','hand');
 const before=r.players[0].hand.length;
 use(source,{costCardId:hand});
 assert.equal(r.players[0].hand.length,before);
 assert.throws(()=>use(source,{costCardId:hand}),/이번 턴/);
});
test('Black Metal Kaiser consumes an attack and grants another monster a temporary opportunity',()=>{
 const {r,take,use}=setup('22');
 const source=take(0,'COC-22-010','integration');
 const target=take(0,'COC-22-001','field');
 use(source,{target:{type:'unit',id:target}});
 assert.equal(r.units[source].attackCount,1);
 assert.equal(r.units[target].bonusAttackTurn,1);
 assert.equal(r.units[target].bonusAttackCount,1);
});
