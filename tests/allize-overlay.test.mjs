import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'coc-allize-'));
process.env.DATA_DIR=directory;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));

function make(){
 const r={code:'ALLIZE',status:'active',version:1,mode:'pvp',turn:0,turnNumber:1,phase:'MAIN',
  players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null,pendingExtraSummon:null};
 I.createPlayer(r,'32','Elements','a');I.createPlayer(r,'03','Opponent','b');
 r.players[0].turnsTaken=1;r.players[1].turnsTaken=1;
 const ids=['COC-32-001','COC-32-002','COC-32-003'].map(cardId=>{
  const id=r.players[0].deck.find(u=>r.units[u].cardId===cardId);
  assert.ok(id,cardId);I.move(r,id,'field',0);return id;
 });
 const extra=r.players[0].extra.find(id=>r.units[id].cardId==='COC-32-015');
 assert.ok(extra,'Infinity extra must exist');
 return {r,ids,extra};
}

test('R16/R22: Allize materials are paid, then overlay under the host after response',()=>{
 const {r,ids,extra}=make();
 I.apply(r,0,'extraSummon',{extraUnitId:extra,materials:ids});
 assert.ok(r.pendingExtraSummon);
 assert.ok(ids.every(id=>r.players[0].grave.includes(id)),'materials paid before response');
 assert.ok(r.players[0].extra.includes(extra));
 I.apply(r,1,'extraResponse',{choice:'pass'});
 assert.ok(r.players[0].field.includes(extra));
 assert.deepEqual(r.units[extra].overlayMaterials,ids);
 assert.ok(ids.every(id=>I.H.zone(r,id)?.zone==='overlay'));
 assert.ok(ids.every(id=>!r.players[0].grave.includes(id)));
 assert.equal(r.players[0].field.filter(Boolean).length,1);
 assert.throws(()=>I.move(r,ids[0],'hand',0),/겹쳐진/);
});
for(const dest of ['grave','hand','deck','banished']){
 test('R16: all overlaid material cards accompany the host to '+dest,()=>{
  const {r,ids,extra}=make();
  I.apply(r,0,'extraSummon',{extraUnitId:extra,materials:ids});
  I.apply(r,1,'extraResponse',{choice:'pass'});
  const previousDeck=[...r.players[0].deck];
  I.move(r,extra,dest,0);
  assert.equal(r.units[extra].overlayMaterials,undefined);
  assert.ok(r.players[0][dest].includes(extra));
  assert.ok(ids.every(id=>r.players[0][dest].includes(id)));
  assert.ok(ids.every(id=>r.units[id].overlayHostId===undefined));
  assert.ok(ids.every(id=>I.H.zone(r,id)?.zone===dest));
  if(dest==='deck')assert.deepEqual(r.players[0].deck.filter(id=>previousDeck.includes(id)),previousDeck,'unrelated deck order never shuffled');
 });
}
test('R16: moving an overlaid host between controllers carries materials without using additional slots',()=>{
 const {r,ids,extra}=make();
 I.apply(r,0,'extraSummon',{extraUnitId:extra,materials:ids});
 I.apply(r,1,'extraResponse',{choice:'pass'});
 I.move(r,extra,'field',1);
 assert.ok(r.players[1].field.includes(extra));
 assert.ok(ids.every(id=>I.H.zone(r,id)?.zone==='overlay'));
 assert.equal(r.players[0].field.filter(Boolean).length,0);
 I.move(r,extra,'hand',0);
 assert.ok(ids.every(id=>r.players[0].hand.includes(id)));
 assert.ok(ids.every(id=>!r.players[1].hand.includes(id)));
});
test('R16: normal battlefield destruction of host releases material cards to grave',()=>{
 const {r,ids,extra}=make();
 I.apply(r,0,'extraSummon',{extraUnitId:extra,materials:ids});
 I.apply(r,1,'extraResponse',{choice:'pass'});
 I.H.destroy(r,extra);
 assert.ok([extra,...ids].every(id=>r.players[0].grave.includes(id)));
});
test('R16: rejecting invalid overlay construction is atomic',()=>{
 const {r,ids,extra}=make();
 const before=structuredClone(r);
 assert.throws(()=>I.attachOverlayMaterials(r,extra,[ids[0],ids[0]]),/소재/);
 assert.deepEqual(r,before);
 assert.throws(()=>I.attachOverlayMaterials(r,extra,ids),/필드/);
 assert.deepEqual(r,before);
});


test('R16: invalid later overlay reference cannot partly release earlier material',()=>{
 const {r,ids,extra}=make();
 I.apply(r,0,'extraSummon',{extraUnitId:extra,materials:ids});
 I.apply(r,1,'extraResponse',{choice:'pass'});
 delete r.units[ids.at(-1)].overlayHostId;
 const before=structuredClone(r);
 assert.throws(()=>I.move(r,extra,'grave',0),/얼라이즈 소재 연결 정보/);
 assert.deepEqual(r,before);
 assert.ok(r.players[0].field.includes(extra));
 assert.equal(r.units[ids[0]].overlayHostId,extra);
});
test('R15/R16: invalid attached equipment blocks overlay host exit before any material moves',()=>{
 const {r,ids,extra}=make();
 I.apply(r,0,'extraSummon',{extraUnitId:extra,materials:ids});
 I.apply(r,1,'extraResponse',{choice:'pass'});
 const equipment=I.instantiate(r,'COC-09-005',1);
 I.move(r,equipment,'hand',1);
 I.attachCard(r,equipment,extra);
 delete r.units[equipment].attachmentHostId;
 const before=structuredClone(r);
 assert.throws(()=>I.move(r,extra,'hand',0),/장착 카드 연결 정보/);
 assert.deepEqual(r,before);
 assert.ok(ids.every(id=>r.units[id].overlayHostId===extra));
});
test('R15/R16: valid overlay and equipment leave together for their own owners',()=>{
 const {r,ids,extra}=make();
 I.apply(r,0,'extraSummon',{extraUnitId:extra,materials:ids});
 I.apply(r,1,'extraResponse',{choice:'pass'});
 const equipment=I.instantiate(r,'COC-09-005',1);
 I.move(r,equipment,'hand',1);
 I.attachCard(r,equipment,extra);
 I.move(r,extra,'grave',0);
 assert.ok(ids.every(id=>r.players[0].grave.includes(id)));
 assert.ok(r.players[1].grave.includes(equipment));
 assert.equal(r.units[equipment].attachmentHostId,undefined);
 assert.equal(r.units[extra].attachments,undefined);
});
