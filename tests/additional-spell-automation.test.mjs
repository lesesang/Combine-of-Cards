import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {castAutomatedSpell,hasAutoSpell} from '../src/automated-effects.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-spells-round3-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
function room(a='01',b='03'){
 const r={code:'SP3ABC',status:'active',turn:0,turnNumber:1,phase:'MAIN',version:1,players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,a,'A','token-1');
 I.createPlayer(r,b,'B','token-2');
 r.players[0].turnsTaken=1;
 const place=(who,cardId,zone)=>{
  const id=r.players[who].deck.find(x=>r.units[x].cardId===cardId);
  assert.ok(id,'missing fixture card: '+cardId);
  I.move(r,id,zone,who);return id;
 };
 return {r,place};
}
test('v1.3 selected spell IDs have callable automatic handlers',()=>{
 for(const id of ['COC-01-004','COC-01-005','COC-05-006','COC-05-007','COC-30-004','COC-31-006','COC-31-008'])
  assert.equal(hasAutoSpell(id),true,id);
});
test('G cutting tool damages one field monster by exactly 100',()=>{
 const {r,place}=room();
 const spell=place(0,'COC-01-004','hand'),target=place(1,'COC-03-002','field');
 r.units[target].hp=101;
 I.apply(r,0,'play',{unitId:spell,target:{type:'unit',id:target}});
 assert.equal(r.units[target].hp,1);
 assert.ok(r.players[0].grave.includes(spell));
});
test('G dimension wrench returns a field monster to its original owner before the draw',()=>{
 const {r,place}=room();
 const spell=place(0,'COC-01-005','hand'),target=place(1,'COC-03-002','field');
 I.apply(r,0,'play',{unitId:spell,target:{type:'unit',id:target}});
 assert.equal(r.players[1].field.includes(target),false);
 assert.ok(r.players[1].hand.includes(target),'returned card is next draw under existing deck-top rule');
});
test('Cartoon arrows rejects duplicate and Cartoon-monster targets without consuming spell',()=>{
 const {r,place}=room('05','03');
 const spell=place(0,'COC-05-006','hand'),toon=place(0,'COC-05-003','field'),enemy=place(1,'COC-03-002','field');
 assert.throws(()=>I.apply(r,0,'play',{unitId:spell,targets:[enemy,enemy]}),/두 장/);
 assert.throws(()=>I.apply(r,0,'play',{unitId:spell,targets:[toon,enemy]}),/카툰/);
 assert.ok(r.players[0].hand.includes(spell));
});
test('Cartoon arrows applies damage to exactly two valid non-Toon monsters',()=>{
 const {r,place}=room('05','03');
 const spell=place(0,'COC-05-006','hand');
 const a=place(1,'COC-03-002','field'),b=place(1,'COC-03-005','field');
 r.units[a].hp=1;r.units[b].hp=1;
 I.apply(r,0,'play',{unitId:spell,targets:[a,b]});
 assert.ok(r.players[1].grave.includes(a));
 assert.ok(r.players[1].grave.includes(b));
});
test('Ultra Cartoon Hand requires Cartoon Land and a free slot, then steals and marks Toon',()=>{
 const {r,place}=room('05','03');
 const spell=place(0,'COC-05-007','hand'),target=place(1,'COC-03-002','field');
 assert.throws(()=>I.apply(r,0,'play',{unitId:spell,target:{type:'unit',id:target}}),/카툰 랜드/);
 place(0,'COC-05-002','field');
 I.apply(r,0,'play',{unitId:spell,target:{type:'unit',id:target}});
 assert.ok(r.players[0].field.includes(target));
 assert.equal(r.units[target].treatedAsToon,true);
 I.move(r,target,'grave',1);
 assert.equal(r.units[target].treatedAsToon,undefined,'temporary status resets after leaving field');
});
test('Magician hat coin heads reduce non-Mage attack and destroy at zero',()=>{
 const {r,place}=room('31','03');
 const target=place(1,'COC-03-002','field');
 r.units[target].atk=100;
 const spell=I.cards.get('COC-31-006');
 castAutomatedSpell(r,0,spell,{target:{type:'unit',id:target}},{...I.H,roll:()=>1});
 assert.ok(r.players[1].grave.includes(target));
});
test('Magician DARKNESS on heads destroys all field monsters, not integrations',()=>{
 const {r,place}=room('31','03');
 const own=place(0,'COC-31-001','field'),enemy=place(1,'COC-03-002','field');
 castAutomatedSpell(r,0,I.cards.get('COC-31-008'),{}, {...I.H,roll:()=>1});
 assert.ok(r.players[0].grave.includes(own));
 assert.ok(r.players[1].grave.includes(enemy));
});
test('Spider surge keeps its spell in hand only when its rolled damage kills a monster',()=>{
 const {r,place}=room('30','03');
 const spell=place(0,'COC-30-004','hand'),target=place(1,'COC-03-002','field');
 r.units[target].hp=1;
 I.apply(r,0,'play',{unitId:spell,target:{type:'unit',id:target}});
 assert.ok(r.players[0].hand.includes(spell),'spell is reusable after lethal spell damage');
 assert.ok(r.players[1].grave.includes(target));
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
