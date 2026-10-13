import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-dragon-gold-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
function make(a='11',b='14'){
 const r={code:'DRAGON',status:'active',turn:0,turnNumber:1,phase:'MAIN',version:1,
  players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,a,'Dragon','a');I.createPlayer(r,b,'Opponent','b');
 r.players[0].turnsTaken=1;
 return r;
}
function idFor(r,who,cardId,zone){
 const id=r.players[who][zone].find(x=>r.units[x]?.cardId===cardId);
 assert.ok(id,cardId+' missing from '+zone);
 return id;
}
test('the dragon cards use automatic summon only, not a free normal summon',()=>{
 const r=make();
 const id=idFor(r,0,'COC-11-007','deck');
 I.move(r,id,'hand',0);
 assert.throws(()=>I.apply(r,0,'play',{unitId:id}),/자동으로만/);
 assert.ok(r.players[0].hand.includes(id));
});
test('token triggers Fafnir before independent Gold; converted token leaves no field slot',()=>{
 const r=make();
 const token=I.H.summonToken(r,1,'스톰 토큰',0,50);
 assert.ok(token,'original token creation succeeded');
 const fafnir=r.players[0].field.find(id=>r.units[id]?.cardId==='COC-11-007');
 assert.ok(fafnir,'Fafnir auto summons from the deck');
 assert.equal(r.units[fafnir].atk,10,'one treasure adds 10 attack');
 assert.equal(r.units[fafnir].hp,11,'one treasure adds 10 health');
 assert.equal(r.units[token],undefined,'token is converted to treasure, not destroyed');
 assert.equal(r.players[1].field.filter(Boolean).length,0);
 const gold=r.persistentEffects.find(e=>e.kind==='dragon-gold');
 assert.equal(gold.owner,0);
 assert.equal(gold.counters,1);
 assert.equal(gold.anchorId,fafnir);
 const goldId=idFor(r,0,'COC-11-008','grave');
 const ringId=idFor(r,0,'COC-11-009','hand');
 assert.equal(gold.sourceId,goldId);
 assert.equal(gold.data.ringId,ringId);
 assert.ok(r.players[0].field.includes(fafnir));
 assert.ok(r.logs.find(x=>x.text.includes('토큰 생성으로 파프니르 자동 소환')));
});
test('without Gold an ordinary token remains on its controller field',()=>{
 const r=make('03','14');
 const token=I.H.summonToken(r,0,'미라 병사',80,100);
 assert.ok(r.players[0].field.includes(token));
 assert.ok(r.units[token]);
 assert.equal(r.persistentEffects,undefined);
});
test('each own attack phase adds five treasures and buffs Fafnir by 50/50',()=>{
 const r=make();
 I.H.summonToken(r,1,'스톰 토큰',0,50);
 const fafnir=r.players[0].field.find(id=>r.units[id]?.cardId==='COC-11-007');
 I.apply(r,0,'phase',{});
 assert.equal(r.phase,'ATTACK');
 assert.equal(r.persistentEffects[0].counters,6);
 assert.equal(r.units[fafnir].atk,60);
 assert.equal(r.units[fafnir].hp,61);
});
test('Ring resolves before Gold deletion and grants player health and persistent attack',()=>{
 const r=make();
 I.H.summonToken(r,1,'스톰 토큰',0,50);
 const fafnir=r.players[0].field.find(id=>r.units[id]?.cardId==='COC-11-007');
 I.apply(r,0,'phase',{});
 const gold=idFor(r,0,'COC-11-008','grave');
 const ring=idFor(r,0,'COC-11-009','hand');
 I.H.destroy(r,fafnir);
 assert.ok(r.players[0].grave.includes(fafnir));
 assert.equal(r.players[0].hp,1060);
 assert.equal(r.players[0].playerAtkBonus,60);
 assert.ok(r.players[0].banished.includes(ring));
 assert.ok(r.players[0].banished.includes(gold));
 assert.equal(r.persistentEffects.length,0,'independent Gold expires after ring resolves');
 assert.deepEqual(r.logs.filter(e=>/니벨룽겐의 반지:|라인의 황금 지속 효과/.test(e.text)).map(e=>e.text.split(':')[0].split(' ')[0]),['니벨룽겐의','라인의']);
 assert.equal(r.effectStack.length,0);
 const dragonId=idFor(r,0,'COC-11-001','deck');
 I.move(r,dragonId,'integration',0);
 assert.equal(r.units[dragonId].atk,110,'player attack bonus carries into future integration');
});
test('both Dragon players can observe one token event and independently count treasure',()=>{
 const r=make('11','11');
 const token=I.H.summonToken(r,0,'스톰 토큰',0,50);
 assert.ok(token);
 assert.equal(r.persistentEffects.length,2);
 assert.deepEqual(r.persistentEffects.map(e=>e.owner),[0,1]);
 assert.ok(r.persistentEffects.every(e=>e.counters===1));
 assert.ok(r.players.every(p=>p.field.some(id=>r.units[id]?.cardId==='COC-11-007')));
 assert.equal(JSON.parse(JSON.stringify(r)).persistentEffects.length,2);
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
