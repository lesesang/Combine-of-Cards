import assert from 'node:assert/strict';
import {batchResponseTargets} from '../../src/spell-response-targets.mjs';
export function batchFixture(I,cardId,caster=0){
 const deck=cardId.split('-')[1],other=1-caster;
 const r={code:'BATCH1',status:'active',version:1,turn:caster,turnNumber:5,phase:'MAIN',mode:'pvp',players:[],units:{},logs:[],effects:[]};
 I.createPlayer(r,caster===0?deck:'14','A','a'.repeat(64));
 I.createPlayer(r,caster===1?deck:'14','B','b'.repeat(64));
 r.players.forEach(p=>p.turnsTaken=3);
 const place=(who,id,to)=>{
  const uid=r.players[who].deck.find(uid=>r.units[uid].cardId===id);
  assert.ok(uid,`missing ${id} in ${r.players[who].deckId}`);I.move(r,uid,to,who);return uid;
 };
 const spell=place(caster,cardId,'hand');
 const target=place(other,'COC-14-005','field');r.units[target].hp=1000;r.units[target].atk=80;
 const counter=place(other,'COC-14-001','integration');
 const allyCard=I.catalog.cards.find(c=>c.deckId===deck&&c.type==='몬스터');
 const ally=allyCard?place(caster,allyCard.id,'field'):I.H.summonToken(r,caster,'batch ally',50,1000);r.units[ally].hp=1000;r.units[ally].atk=50;
 if(cardId==='COC-06-007')r.players[caster].roundPlays=5;
 if(cardId==='COC-08-006'){
  const second=I.catalog.cards.find(c=>c.deckId===deck&&c.type==='몬스터'&&c.attribute==='요괴'&&c.id!==allyCard.id);
  place(caster,second.id,'field');
 }
 const integrations={'COC-01-009':'COC-01-002','COC-14-003':'COC-14-001','COC-17-005':'COC-17-001','COC-17-006':'COC-17-001','COC-31-010':'COC-31-004'};
 if(integrations[cardId])place(caster,integrations[cardId],'integration');
 if(cardId==='COC-14-006')r.units[target].atk=350;
 if(cardId.startsWith('COC-32-')){
  const named={'COC-32-005':'플레임','COC-32-006':'워터','COC-32-007':'윈드','COC-32-008':'랜드'}[cardId];
  const c=I.catalog.cards.find(c=>c.deckId===deck&&c.type==='몬스터'&&c.name.includes(named));
  if(c.id!==allyCard.id)place(caster,c.id,'field');
 }
 if(cardId==='COC-30-002')r.destructionHistory=[1,2].map(()=>({turnNumber:3,activePlayer:caster,controller:other}));
 const kind=batchResponseTargets[cardId];
 const body={unitId:spell,...(kind?{target:{type:'unit',id:kind.endsWith('burning')?ally:target}}:{})};
 return {r,spell,target,counter,ally,body,caster,other,place};
}
export function assertBatchResult(f,cardId){
 const {r,target,ally,caster,other}=f,u=r.units[target],p=r.players;
 switch(cardId){
 case 'COC-01-004':case 'COC-27-006':assert.equal(u.hp,900);break;
 case 'COC-01-005':assert.ok(!p[other].field.includes(target));assert.equal(p[other].hand.length,1);break;
 case 'COC-01-009':assert.equal(p[caster].spellProtectionUntilOpponentTurn,4);assert.equal(p[other].noDirectAttackUntil,4);break;
 case 'COC-06-007':assert.equal(u.hp,700);break;
 case 'COC-08-006':case 'COC-30-001':case 'COC-32-008':assert.ok(p[other].grave.includes(target));break;
 case 'COC-14-003':assert.ok(p[other].banished.includes(target));break;
 case 'COC-14-006':assert.equal(p[other].noAttackUntil,4);break;
 case 'COC-17-005':assert.equal(u.hp,999);break;
 case 'COC-17-006':assert.equal(u.hp,999);assert.equal(p[other].hp,999);break;
 case 'COC-19-005':assert.equal(u.frozen,true);assert.equal(u.battleInvulnerable,true);break;
 case 'COC-20-004':assert.equal(p[caster].hp,900);assert.equal(r.units[ally].atk,150);break;
 case 'COC-20-011':assert.equal(r.units[ally].effectDestructionImmune,true);break;
 case 'COC-30-002':assert.equal(u.hp,800);break;
 case 'COC-30-006':assert.equal(u.diceMax,10);break;
 case 'COC-31-006':assert.ok(p[other].grave.includes(target));break;
 case 'COC-31-008':assert.ok(p[other].grave.includes(target));assert.ok(p[caster].grave.includes(ally));break;
 case 'COC-31-010':assert.equal(r.units[ally].atk,450);assert.equal(u.hp,1000);break;
 case 'COC-32-005':assert.equal(p[other].hp,999);break;
 case 'COC-32-006':assert.equal(p[caster].hp,1100);break;
 case 'COC-32-007':assert.equal(p[other].spellForbiddenUntil,4);break;
 default:assert.fail('missing expectation '+cardId);
 }
}
