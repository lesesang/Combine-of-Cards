import {test} from 'node:test';
import assert from 'node:assert/strict';
import {castAutomatedSpell} from '../src/automated-effects.mjs';

function harness(){
  const r={mode:'ai',turnNumber:1,players:[0,1].map(()=>({hp:1000,grave:[],field:[null,null,null],hand:[],deck:[],integration:null})),units:{},effects:[]};
  const H={roll:n=>n,randomInt:()=>0,fail:(code,msg)=>{const e=new Error(msg);e.status=code;throw e;},outcome:()=>{},move:()=>{},draw:()=>{},mill:()=>{},zone:()=>null,healUnit:()=>{},hurt:()=>{},destroy:()=>{},summonToken:()=>null,name:()=>'',attribute:()=>'',originalOwner:()=>0,cardNamed:()=>null,evolve:()=>{},search:()=>null,type:()=>''};
  const cast=(id,body={})=>castAutomatedSpell(r,0,{id,attribute:'원소'},body,H);
  return {r,H,cast};
}

test('selected own player receives Spirit Rest healing',()=>{
  const {r,cast}=harness();r.players[0].grave=['a','b'];
  cast('COC-03-008',{target:{type:'player',player:0}});
  assert.equal(r.players[0].hp,1200);assert.equal(r.players[1].hp,1000);
});
test('invalid player and missing unit targets are rejected, never silently redirected',()=>{
  const {r,cast}=harness();r.players[0].grave=['a'];
  assert.throws(()=>cast('COC-03-008',{target:{type:'player',player:4}}),/선택할 수 없는 플레이어/);
  assert.throws(()=>cast('COC-03-007',{target:{type:'unit',id:'nonexistent'}}),/선택할 수 없는 카드/);
  assert.equal(r.players[0].hp,1000);assert.equal(r.players[1].hp,1000);
});
test('Burning Demon Burst resolves both players damage together',()=>{
  const {r,H,cast}=harness();r.players[0].hp=100;r.players[1].hp=150;
  let called=0;H.outcome=()=>{called++;assert.equal(r.players[0].hp,-100);assert.equal(r.players[1].hp,-50)};
  cast('COC-20-005');assert.equal(called,1);
});
test('Mercury storm requires exactly two distinct field targets at 3 elemental uses',()=>{
  const {r,H,cast}=harness();r.players[0].roundElementUses=2;r.players[0].field=['a','b',null];r.units.a={};r.units.b={};
  H.zone=(rr,id)=>['a','b'].includes(id)?{zone:'field',player:0}:null;
  assert.throws(()=>cast('COC-06-004',{targets:['a','a']}),/두 장/);
  assert.throws(()=>cast('COC-06-004',{targets:['a','nobody']}),/필드에 없습니다/);
  const destroyed=[];H.destroy=(rr,id)=>destroyed.push(id);
  cast('COC-06-004',{targets:['b','a']});assert.deepEqual(destroyed,['b','a']);
});
test('fifth card play meets wave minimum threshold, fourth does not',()=>{
  const {r,cast}=harness();r.players[0].roundPlays=3;
  assert.throws(()=>cast('COC-06-007',{target:{type:'player',player:1}}),/5회/);
  r.players[0].roundPlays=4;
  cast('COC-06-007',{target:{type:'player',player:1}});
  assert.equal(r.players[1].hp,700);
});

test('ROYAL STRAIGHT FLUSH applies both heads attack and tails health adjustment',()=>{
 const {r,H,cast}=harness();r.players[0].integration='shuu';r.units.shuu={cardId:'COC-31-004',atk:0};
 r.players[0].field=['ally',null,null];r.units.ally={atk:50,hp:100};
 r.players[1].field=['foe',null,null];r.units.foe={atk:100,hp:1000};
 let flips=0;H.roll=()=>[1,2,1,2,1][flips++];H.hurt=(rr,id,n)=>{rr.units[id].hp-=n};
 cast('COC-31-010');
 assert.equal(r.units.ally.atk,290);assert.equal(r.units.foe.hp,800);assert.equal(flips,5);
});
test('G-attack damages both selected player and caster then sets integration attack to zero',()=>{
 const {r,H,cast}=harness();r.players[0].integration='g';r.units.g={cardId:'COC-01-001',atk:200};
 let seen;H.outcome=()=>{seen=[r.players[0].hp,r.players[1].hp]};
 cast('COC-01-008',{target:{type:'player',player:1}});
 assert.deepEqual(seen,[800,800]);assert.equal(r.units.g.atk,0);
});
