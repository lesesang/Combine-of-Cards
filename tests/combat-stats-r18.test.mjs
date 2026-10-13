import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {actualAttack,treatedAttackForCondition} from '../src/combat-stats.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-r18-atk-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));

function room(){
 const r={code:'R18ATK',status:'active',turn:0,turnNumber:3,phase:'ATTACK',version:1,
  players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,'22','Black Metal','a');
 I.createPlayer(r,'03','Enemy','b');
 r.players[0].turnsTaken=2;r.players[1].turnsTaken=2;
 return r;
}

test('R18: Magician remains actual 50, treated 250 only for condition comparisons',()=>{
 const r=room(),source=I.instantiate(r,'COC-22-015',0);
 I.move(r,source,'field',0);
 const unit=r.units[source];
 assert.equal(I.cards.get(unit.cardId).name,'블랙 메탈 매지션');
 assert.equal(actualAttack(unit),50);
 assert.equal(treatedAttackForCondition(unit),250);
 assert.equal(I.actualAttack(unit),50);
 assert.equal(I.treatedAttackForCondition(unit),250);
 assert.equal(unit.atk,50,'condition check does not overwrite mutable actual attack');
 assert.equal(unit.baseAtk,50);
 assert.equal(actualAttack({...unit,atk:70}),70);
 assert.equal(treatedAttackForCondition({...unit,atk:70}),250);
 assert.equal(treatedAttackForCondition({...unit,atk:300}),300);
 assert.equal(treatedAttackForCondition({cardId:'OTHER',atk:50}),50);
});

test('R18: Magician normal attack uses 1d50, not treated condition value 250',()=>{
 const r=room(),source=I.instantiate(r,'COC-22-015',0);
 I.move(r,source,'field',0);
 const defender=I.instantiate(r,'COC-03-002',1);
 I.move(r,defender,'field',1);
 r.units[source].diceMin=50;
 r.units[source].diceMax=50;
 r.units[defender].hp=500;
 I.apply(r,0,'attack',{attackerId:source,target:{type:'unit',id:defender}});
 assert.equal(r.pendingAttack.attackerId,source);
 I.apply(r,1,'defend',{});
 assert.equal(r.units[defender].hp,450);
 assert.ok(r.logs.some(e=>e.type==='damage'&&e.text.includes('1d50 = 50')));
 assert.equal(r.units[source].atk,50);
});

test('R18: attack fields are finite, clamped, integer, and distinct from treated value',()=>{
 assert.equal(actualAttack({atk:-5}),0);
 assert.equal(actualAttack({atk:51.9}),51);
 assert.equal(actualAttack({atk:Infinity}),0);
 assert.equal(actualAttack({atk:NaN}),0);
 assert.equal(actualAttack(null),0);
 assert.equal(treatedAttackForCondition({cardId:'COC-22-015',atk:-5}),250);
});
