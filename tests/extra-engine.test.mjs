import test from 'node:test';
import assert from 'node:assert/strict';
import {gameTestInternals as I} from '../server.mjs';
function start(deckId){
 const r={players:[],units:{},logs:[],effects:[],turn:0,turnNumber:1,phase:'MAIN',status:'active'};
 I.createPlayer(r,deckId,'A','secret-a');I.createPlayer(r,'03','B','secret-b');
 const pick=(cardId,zone)=>{
  const p=r.players[0],id=[...p.deck,...p.extra].find(u=>r.units[u].cardId===cardId);
  assert.ok(id,cardId);
  if(zone)I.move(r,id,zone,0);
  return id;
 };
 return {r,pick};
}
test('extra summon actually consumes F=HERO materials and occupies field',()=>{
 const {r,pick}=start('12'),extra=pick('COC-12-011'),a=pick('COC-12-001','hand'),b=pick('COC-12-002','field');
 pick('COC-12-009','integration');
 const result=I.performExtraSummon(r,0,{extraUnitId:extra,materials:[a,b]});
 assert.equal(result.method,'hero');
 assert.ok(r.players[0].field.includes(extra));
 assert.ok(r.players[0].grave.includes(a));
 assert.ok(r.players[0].grave.includes(b));
 assert.equal(r.players[0].extra.includes(extra),false);
});
test('refused fusion does not spend materials or move cards',()=>{
 const {r,pick}=start('12'),extra=pick('COC-12-011'),a=pick('COC-12-001','hand'),b=pick('COC-12-002','field');
 const before=JSON.stringify(r.players);
 assert.throws(()=>I.performExtraSummon(r,0,{extraUnitId:extra,materials:[a,b]}),/용기의 패왕/);
 assert.equal(JSON.stringify(r.players),before);
});
test('Wakey wakeup consumes flame and returns spell at end of turn',()=>{
 const {r,pick}=start('32'),extra=pick('COC-32-011'),flame=pick('COC-32-001','field'),spell=pick('COC-32-009','hand');
 I.performExtraSummon(r,0,{extraUnitId:extra,materials:[flame],spellUnitId:spell});
 assert.ok(r.players[0].grave.includes(flame));
 assert.ok(r.players[0].grave.includes(spell));
 I.processEndOfTurn(r);
 assert.ok(r.players[0].hand.includes(spell));
});
