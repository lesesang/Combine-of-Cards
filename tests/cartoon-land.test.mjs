import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-cartoon-land-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');

function make(){
 const r={code:'TOON12',status:'active',turn:0,turnNumber:1,phase:'MAIN',version:1,
  players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,'05','Cartoon','first');
 I.createPlayer(r,'03','Other','second');
 r.players[0].turnsTaken=1;
 const place=(who,cardId,to)=>{
  const id=r.players[who].deck.find(x=>r.units[x]?.cardId===cardId);
  assert.ok(id,cardId+' missing from deck');I.move(r,id,to,who);return id;
 };
 return {r,place};
}

test('Cartoon Land automatically destroys Demon Dragon before World Guide restores Land to 0/50',()=>{
 const {r,place}=make();
 const land=place(0,'COC-05-002','hand');
 const demon=place(0,'COC-05-001','field');
 const guide=r.players[0].deck.find(id=>r.units[id]?.cardId==='COC-05-008');
 assert.ok(guide);
 I.apply(r,0,'play',{unitId:land});
 assert.equal(r.units[land].hp,1);
 assert.equal(r.players[0].hp,900,'Land activation pays 100 HP');
 I.H.destroy(r,land);
 assert.ok(r.players[0].grave.includes(demon),'Demon Dragon is destroyed');
 assert.ok(r.players[0].grave.includes(guide),'World Guide is sent from deck');
 assert.ok(r.players[0].field.includes(land),'Land is restored on field');
 assert.equal(r.units[land].atk,0);
 assert.equal(r.units[land].hp,50);
 assert.equal(r.units[land].cannotAttack,true);
 const logs=r.logs.map(x=>x.text);
 const destroyed=logs.findIndex(x=>x.includes('카툰 데몬즈 드래곤 파괴'));
 const revived=logs.findIndex(x=>x.includes('체력 50으로 복구'));
 assert.ok(destroyed>=0&&revived>destroyed,'Demon Dragon resolves before Guide restore');
 assert.equal(r.effectStack?.length,0);
});

test('without Guide in deck Land stays destroyed while Demon Dragon still dies',()=>{
 const {r,place}=make();
 const land=place(0,'COC-05-002','hand');
 const demon=place(0,'COC-05-001','field');
 const guide=place(0,'COC-05-008','hand');
 I.apply(r,0,'play',{unitId:land});
 I.H.destroy(r,land);
 assert.ok(r.players[0].grave.includes(land));
 assert.ok(r.players[0].grave.includes(demon));
 assert.ok(r.players[0].hand.includes(guide));
});

test('Land battle immunity prevents a lethal battle hit but not direct effect destruction',()=>{
 const {r,place}=make();
 const land=place(0,'COC-05-002','hand');
 I.apply(r,0,'play',{unitId:land});
 const attacker=place(1,'COC-03-002','field');
 r.turn=1;r.phase='ATTACK';r.turnNumber=2;r.players[1].turnsTaken=1;
 I.apply(r,1,'attack',{attackerId:attacker,target:{type:'unit',id:land}});
 I.apply(r,0,'defend',{});
 assert.ok(r.players[0].field.includes(land),'cannot be destroyed by an attack');
 assert.equal(r.units[land].hp,1);
 assert.ok(r.players[0].deck.some(id=>r.units[id]?.cardId==='COC-05-008'),'World Guide not consumed');
 I.H.destroy(r,land);
 assert.equal(r.units[land].hp,50,'direct effect destruction triggers Guide resurrection');
});

test('World Guide cannot be manually cast from hand instead of triggering from deck',()=>{
 const {r,place}=make();
 const guide=place(0,'COC-05-008','hand');
 assert.throws(()=>I.apply(r,0,'play',{unitId:guide}),/자동 발동/);
 assert.ok(r.players[0].hand.includes(guide));
});

test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
