import test from 'node:test';
import assert from 'node:assert/strict';
import {gameTestInternals as I} from '../server.mjs';
import {planActivation} from '../src/activation-rules.mjs';

function room(a='22',b='03') {
  const r={players:[],units:{},logs:[],effects:[],turn:0,turnNumber:3,
    phase:'MAIN',status:'active',version:1,pendingAttack:null,pendingManual:null};
  I.createPlayer(r,a,'A','a');I.createPlayer(r,b,'B','b');
  for(const p of r.players)p.turnsTaken=2;
  return r;
}
function take(r,who,cardId,zone){
  const id=Object.keys(r.units).find(id=>r.units[id].owner===who&&r.units[id].cardId===cardId);
  assert.ok(id,'missing '+cardId);
  if(zone)I.move(r,id,zone,who);
  return id;
}

test('R11: a returned card is inserted randomly without reordering the existing deck',()=>{
  const r=room(),id=r.players[0].deck[0];
  I.move(r,id,'hand',0);
  const unchanged=[...r.players[0].deck],indices=new Set();
  for(let i=0;i<90;i++){
    I.move(r,id,'deck',0);
    const d=r.players[0].deck,index=d.indexOf(id);
    assert.ok(index>=0&&index<=unchanged.length);
    assert.deepEqual(d.filter(x=>x!==id),unchanged);
    indices.add(index);
    I.move(r,id,'hand',0);
  }
  assert.ok(indices.size>1,'returned card must not always land at deck top');
  assert.deepEqual(r.players[0].deck,unchanged);
});

test('R13: magic wave requires five earlier cards, excluding its own activation',()=>{
  const r=room('06','03'),id=take(r,0,'COC-06-007','hand');
  const validate=()=>planActivation({room:r,who:0,unitId:id,cards:I.cards});
  r.players[0].roundPlays=4;
  assert.throws(validate,/5장/);
  r.players[0].roundPlays=5;
  assert.equal(validate().verified,true);
});

test('R29: frozen, forbidden and zero-ATK units still have a spendable attack opportunity',()=>{
  for(const change of [
    u=>{u.atk=0},
    u=>{u.frozen=true},
    u=>{u.cannotAttack=true},
    u=>{u.cannotAttackUntil=3}
  ]){
    const r=room(),source=take(r,0,'COC-22-008','grave'),unitId=take(r,0,'COC-22-001','field');
    change(r.units[unitId]);r.players[0].noAttackUntil=2;
    I.apply(r,0,'graveAbility',{sourceUnitId:source,costUnitId:unitId});
    assert.ok(r.players[0].hand.includes(source));
    assert.equal(r.units[unitId].attackCount,1);
    assert.equal(I.attackAvailable(r.units[unitId],3),false);
  }
});

test('R29: a remaining zero-attack monster can declare and resolve a no-dice, no-damage attack',()=>{
  const r=room('12','03'),id=take(r,0,'COC-12-001','field');
  r.units[id].atk=0;r.phase='ATTACK';
  const hp=r.players[1].hp;
  I.apply(r,0,'attack',{attackerId:id,target:{type:'player'}});
  assert.equal(r.units[id].attackCount,1,'the chance is spent at declaration');
  I.apply(r,1,'defend',{});
  assert.equal(r.players[1].hp,hp);
  assert.equal(r.pendingAttack,null);
  assert.match(r.logs.at(-1).text,/공격력 0: 다이스 없음/);
  assert.throws(()=>I.apply(r,0,'attack',{attackerId:id,target:{type:'player'}}),/공격 가능한/);
});

test('R21: attack declaration consumes the opportunity even if the target leaves during response',()=>{
  const r=room('12','03'),attacker=take(r,0,'COC-12-001','field'),target=take(r,1,'COC-03-005','field');
  r.phase='ATTACK';
  I.apply(r,0,'attack',{attackerId:attacker,target:{type:'unit',id:target}});
  assert.equal(r.units[attacker].attackCount,1);
  I.move(r,target,'hand',1);
  I.apply(r,1,'defend',{});
  assert.equal(r.pendingAttack.stage,'retarget');
  assert.equal(r.units[attacker].attackCount,1);
  I.apply(r,0,'retarget',{target:{type:'player'}});
  I.apply(r,1,'defend',{});
  assert.equal(r.units[attacker].attackCount,1,'retarget never consumes a second attack');
});

test('R28: piercing uses the dice result, not attack stat or unrelated bonus damage',()=>{
  const r=room('12','03'),attacker=take(r,0,'COC-12-013','field'),partner=take(r,0,'COC-12-006','field');
  const target=take(r,1,'COC-03-005','field');
  assert.ok(partner);
  r.units[attacker].atk=260;r.units[attacker].diceMin=20;r.units[attacker].diceMax=20;
  r.units[target].hp=30;r.phase='ATTACK';
  I.apply(r,0,'attack',{attackerId:attacker,target:{type:'unit',id:target}});
  I.apply(r,1,'defend',{});
  assert.ok(r.players[1].grave.includes(target),'the separate HERO bonus causes destruction');
  assert.equal(r.players[1].hp,1000,'20 dice damage does not pierce 30 pre-destruction HP');
});

test('R05/R06: a single token creation credits only its controller Gold when both exist',()=>{
  const r=room('11','11');
  I.H.summonToken(r,0,'스톰 토큰',0,50);
  assert.deepEqual(r.persistentEffects.map(e=>e.owner),[0,1]);
  assert.deepEqual(r.persistentEffects.map(e=>e.counters),[1,0]);
  I.H.summonToken(r,1,'스톰 토큰',0,50);
  assert.deepEqual(r.persistentEffects.map(e=>e.counters),[1,1]);
});

test('R05/R07: later token release counts as another event without double conversion or destruction',()=>{
  const r=room('11','03');
  const fafnir=take(r,0,'COC-11-007','banished');
  const spare=I.H.summonToken(r,0,'테스트 토큰',0,50);
  assert.ok(r.players[0].field.includes(spare));
  I.move(r,fafnir,'deck',0);
  I.H.summonToken(r,1,'스톰 토큰',0,50);
  assert.equal(r.persistentEffects[0].counters,1);
  I.move(r,spare,'grave',0,{tokenAction:'릴리스'});
  assert.equal(r.persistentEffects[0].counters,2);
  assert.equal(r.units[spare],undefined);
  assert.equal(r.logs.filter(e=>e.type==='destroy'&&e.text.includes('테스트 토큰')).length,0);
});

function tokenCostFixture(){
 const r=room('14','11');
 const fafnir=r.players[1].deck.find(id=>r.units[id].cardId==='COC-11-007');
 assert.ok(fafnir);
 I.move(r,fafnir,'banished',1);
 const tokens=[I.H.summonToken(r,0,'스톰 토큰',0,50),I.H.summonToken(r,0,'스톰 토큰',0,50)];
 assert.ok(tokens.every(id=>r.players[0].field.includes(id)));
 I.move(r,fafnir,'deck',1);
 I.H.summonToken(r,1,'스톰 토큰',0,50);
 assert.equal(r.persistentEffects?.[0]?.owner,1);
 assert.equal(r.persistentEffects[0].counters,1);
 return {r,tokens};
}

test('R05: a token excluded as a real summon cost counts as use exactly once',()=>{
 const {r,tokens}=tokenCostFixture();
 const source=take(r,0,'COC-14-004','hand');
 I.apply(r,0,'play',{unitId:source,costUnitIds:[tokens[0]]});
 assert.equal(r.persistentEffects[0].counters,2);
 assert.equal(r.units[tokens[0]],undefined);
 assert.ok(r.players[0].integration===source);
 assert.ok(r.players[0].field.includes(tokens[1]));
});

test('R05: every token destroyed as an explicit summon cost emits one use event',()=>{
 const {r,tokens}=tokenCostFixture();
 const source=take(r,0,'COC-14-001','hand');
 I.apply(r,0,'play',{unitId:source,costUnitIds:tokens});
 assert.equal(r.persistentEffects[0].counters,3);
 assert.ok(tokens.every(id=>!r.units[id]));
 assert.equal(r.players[0].integration,source);
 assert.equal(r.logs.filter(e=>e.type==='destroy'&&e.text.includes('스톰 토큰')).length,2);
});
