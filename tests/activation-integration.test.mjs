import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-activation-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
function room(a='12',b='03'){
 const r={code:'TST123',status:'active',turn:0,turnNumber:1,phase:'MAIN',version:1,players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,a,'A','token-1');I.createPlayer(r,b,'B','token-2');
 const position=(who,cardId,zone)=>{
  const id=r.players[who].deck.find(id=>r.units[id].cardId===cardId);
  assert.ok(id,'missing '+cardId);I.move(r,id,zone,who);return id;
 };
 return {r,position};
}
test('the server rejects a Universe summon without two selected field costs',()=>{
 const {r,position}=room('12','03');const id=position(0,'COC-12-010','hand');
 position(0,'COC-12-001','field');position(0,'COC-12-002','field');
 assert.throws(()=>I.apply(r,0,'play',{unitId:id}),/2장/);
});
test('server pays both field costs before summoning Universe',()=>{
 const {r,position}=room('12','03');const id=position(0,'COC-12-010','hand');
 const a=position(0,'COC-12-001','field'),b=position(0,'COC-12-002','field');
 I.apply(r,0,'play',{unitId:id,costUnitIds:[a,b]});
 assert.ok(r.players[0].field.includes(id));assert.ok(r.players[0].grave.includes(a));assert.ok(r.players[0].grave.includes(b));
});
test('server discards all non-self hand cards when summoning Gandrae Dragon',()=>{
 const {r,position}=room('27','03');const id=position(0,'COC-27-004','hand');
 const a=position(0,'COC-27-001','hand'),b=position(0,'COC-27-003','hand');
 I.apply(r,0,'play',{unitId:id});
 assert.ok(r.players[0].grave.includes(a));assert.ok(r.players[0].grave.includes(b));assert.ok(r.players[0].grave.includes(id)); // Its effect destroys the entire field, itself included.
});
test('incorrect elemental wizard rejects LAND spell even if FLAME is present',()=>{
 const {r,position}=room('32','03');const spell=position(0,'COC-32-008','hand');position(0,'COC-32-001','field');
 assert.throws(()=>I.apply(r,0,'play',{unitId:spell}),/랜드/);
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));