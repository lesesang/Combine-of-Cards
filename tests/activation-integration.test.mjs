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
 assert.ok(r.players[0].grave.includes(a));assert.ok(r.players[0].grave.includes(b));assert.ok(r.players[0].field.includes(id),'간드레이드래곤은 자신의 전체 파괴 효과에서 제외된다');
});
test('incorrect elemental wizard rejects LAND spell even if FLAME is present',()=>{
 const {r,position}=room('32','03');const spell=position(0,'COC-32-008','hand');position(0,'COC-32-001','field');
 assert.throws(()=>I.apply(r,0,'play',{unitId:spell}),/랜드/);
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
test('Storm Fannir mills one random deck card then creates the storm token',()=>{
 const {r,position}=room('14','03');const id=position(0,'COC-14-005','hand');const before=r.players[0].deck.length;
 I.apply(r,0,'play',{unitId:id});
 assert.equal(r.players[0].deck.length,before-1);
 assert.equal(r.players[0].grave.length,1);
 assert.ok(r.players[0].field.some(mid=>mid&&r.units[mid].created&&r.units[mid].tokenCard.name==='스톰 토큰'));
});
test('Storm Knight removes one friendly monster, then creates a storm token',()=>{
 const {r,position}=room('14','03');const id=position(0,'COC-14-004','hand'),material=position(0,'COC-14-005','field');
 I.apply(r,0,'play',{unitId:id,costUnitIds:[material]});
 assert.ok(r.players[0].banished.includes(material));
 assert.ok(r.players[0].field.includes(id));
 assert.ok(r.players[0].field.some(mid=>mid&&r.units[mid].created));
});
test('Mummy general requires and releases a mummy token without consuming other cards',()=>{
 const {r,position}=room('17','03');const id=position(0,'COC-17-008','hand');
 const soldier=I.H.summonToken(r,0,'미라 병사',80,100);
 I.apply(r,0,'play',{unitId:id,costUnitIds:[soldier]});
 assert.ok(r.players[0].field.includes(id));assert.ok(!r.units[soldier]);
});
test('Gandrae Dragon destroys every other field monster but not itself',()=>{
 const {r,position}=room('27','03');
 const id=position(0,'COC-27-004','hand');
 const ally=position(0,'COC-27-001','field');
 const enemy=position(1,'COC-03-002','field');
 const enemy2=position(1,'COC-03-005','field');
 I.apply(r,0,'play',{unitId:id});
 assert.ok(r.players[0].field.includes(id),'summoned Gandrae Dragon survives');
 assert.ok(!r.players[0].grave.includes(id),'Gandrae Dragon is not destroyed');
 for(const target of [ally,enemy,enemy2]){
  assert.ok(r.players[r.units[target].owner].grave.includes(target),'other monster destroyed: '+target);
 }
 assert.equal(r.players[0].field.filter(Boolean).length,1,'only Gandrae Dragon remains on controller side');
 assert.equal(r.players[1].field.filter(Boolean).length,0,'enemy field is cleared');
});
