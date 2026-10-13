import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {castAutomatedSpell} from '../src/automated-effects.mjs';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-batch-destruction-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
function make(a='31',b='03'){
 const r={code:'BAT123',status:'active',turn:0,turnNumber:1,phase:'MAIN',version:1,players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,a,'A','token-a');I.createPlayer(r,b,'B','token-b');r.players[0].turnsTaken=1;
 const place=(who,cardId,zone)=>{
  const id=r.players[who].deck.find(mid=>r.units[mid].cardId===cardId);
  assert.ok(id,'missing '+cardId);I.move(r,id,zone,who);return id;
 };
 return {r,place};
}
test('empty batch cannot consume a waiting first-destruction effect',()=>{
 const {r}=make();r.players[0].hp=400;r.effects.push({type:'firstDestroyHeal',player:0,turn:1});
 I.H.destroyBatch(r,[]);
 assert.equal(r.players[0].hp,400);
 assert.equal(r.effects.length,1);
});
test('simultaneous destruction uses highest HP snapshot, regardless of target order',()=>{
 const {r,place}=make();
 const small=place(1,'COC-03-002','field'),big=place(1,'COC-03-005','field');
 r.units[small].hp=70;r.units[big].hp=340;
 r.players[0].hp=400;
 r.effects.push({type:'firstDestroyHeal',player:0,turn:1});
 I.H.destroyBatch(r,[small,big]);
 assert.equal(r.players[0].hp,740,'heal by 340, not 70');
 assert.equal(r.effects.length,0);
 assert.ok(r.players[1].grave.includes(small)&&r.players[1].grave.includes(big));
});
test('DARKNESS coin heads resolve both monster destructions as a batch',()=>{
 const {r,place}=make();
 const own=place(0,'COC-31-001','field'),a=place(1,'COC-03-002','field'),b=place(1,'COC-03-005','field');
 r.units[own].hp=30;r.units[a].hp=250;r.units[b].hp=350;
 r.players[0].hp=500;r.effects.push({type:'firstDestroyHeal',player:0,turn:1});
 castAutomatedSpell(r,0,I.cards.get('COC-31-008'),{}, {...I.H,roll:()=>1});
 assert.equal(r.players[0].hp,850);
 assert.equal(r.players[0].field.filter(Boolean).length,0);
 assert.equal(r.players[1].field.filter(Boolean).length,0);
});
test('Gandrae destroys the other monsters as a batch, excluding itself',()=>{
 const {r,place}=make('27','03');
 const source=place(0,'COC-27-004','hand'),ally=place(0,'COC-27-001','field');
 const enemy=place(1,'COC-03-002','field'),enemy2=place(1,'COC-03-005','field');
 r.units[ally].hp=40;r.units[enemy].hp=190;r.units[enemy2].hp=320;
 r.players[0].hp=450;r.effects.push({type:'firstDestroyHeal',player:0,turn:1});
 I.apply(r,0,'play',{unitId:source});
 assert.ok(r.players[0].field.includes(source));
 assert.ok(!r.players[0].grave.includes(source));
 assert.equal(r.players[0].hp,770,'largest destroyed HP heals once');
 assert.ok(r.players[0].grave.includes(ally));
 assert.ok(r.players[1].grave.includes(enemy)&&r.players[1].grave.includes(enemy2));
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
