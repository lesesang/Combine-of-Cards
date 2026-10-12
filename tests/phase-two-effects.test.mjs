import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-phase-2-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
function make(a,b){
 const r={code:'TST456',status:'active',turn:0,turnNumber:1,phase:'MAIN',version:1,players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,a,'A','token1');I.createPlayer(r,b,'B','token2');
 const position=(who,id,to)=>{const unit=r.players[who].deck.find(i=>r.units[i].cardId===id);assert.ok(unit,id);I.move(r,unit,to,who);return unit};
 return {r,position};
}
test('envy validates a 250-stat sacrifice then destroys selected enemy',()=>{
 const {r,position}=make('21','03');const spell=position(0,'COC-21-004','hand');
 const ally=I.instantiate(r,'COC-21-009',0);I.move(r,ally,'field',0); /* Created-card instance: not in main deck. */ r.units[ally].hp=210;
 const enemy=position(1,'COC-03-002','field');
 I.apply(r,0,'play',{unitId:spell,costUnitIds:[ally],target:{type:'unit',id:enemy}});
 assert.ok(r.players[0].grave.includes(spell),'spent spell');
 assert.ok(r.players[0].grave.includes(ally),'sacrificed ally');
 assert.ok(r.players[1].grave.includes(enemy),'destroyed enemy');
});
test('Storm Knight exiles two chosen allies, halves an enemy attack, and stays fielded',()=>{
 const {r,position}=make('14','03');const knight=position(0,'COC-14-004','hand');
 const ally=position(0,'COC-14-005','field');const token=I.H.summonToken(r,0,'스톰 토큰',0,50);
 const enemy=position(1,'COC-03-002','field');
 assert.equal(r.units[enemy].atk,100);
 I.apply(r,0,'play',{unitId:knight,costUnitIds:[ally,token],target:{type:'unit',id:enemy}});
 assert.ok(r.players[0].banished.includes(ally));
 assert.equal(r.units[token],undefined,'token ceases existing after leaving field');
 assert.equal(r.units[enemy].atk,50);
 assert.ok(r.players[0].field.includes(knight));
});
test('an invalid sacrifice cannot consume the source spell or target',()=>{
 const {r,position}=make('21','03');const spell=position(0,'COC-21-004','hand');
 const ally=I.instantiate(r,'COC-21-009',0);I.move(r,ally,'field',0); /* Created-card instance: not in main deck. */ const enemy=position(1,'COC-03-002','field');
 assert.throws(()=>I.apply(r,0,'play',{unitId:spell,costUnitIds:[ally],target:{type:'unit',id:enemy}}),/250/);
 assert.ok(r.players[0].hand.includes(spell));
 assert.ok(r.players[0].field.includes(ally));
 assert.ok(r.players[1].field.includes(enemy));
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));