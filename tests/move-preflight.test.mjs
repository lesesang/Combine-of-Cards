import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-move-preflight-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));

function room(){
 const r={code:'MOVE54',status:'active',turn:0,turnNumber:3,phase:'MAIN',version:1,
  players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,'03','Owner','a');I.createPlayer(r,'09','Opponent','b');
 return r;
}
function make(r,who,cardId,to){
 const id=I.instantiate(r,cardId,who);I.move(r,id,to,who);return id;
}

test('R15/R16: invalid destination never unlinks or resets a normal monster',()=>{
 const r=room(),uid=make(r,0,'COC-03-002','field');
 r.units[uid].atk=173;r.units[uid].frozen=true;
 const before=structuredClone(r);
 for(const dest of ['extra','void','',null,undefined]){
  assert.throws(()=>I.move(r,uid,dest,0),/이동 위치/);
  assert.deepEqual(r,before,'failed move must not alter any field stat or location');
 }
 I.move(r,uid,'grave',0);
 assert.ok(r.players[0].grave.includes(uid));
});

test('R15/R16: malformed destination never deletes a created token or creates events',()=>{
 const r=room(),token=I.H.summonToken(r,0,'테스트 토큰',80,100);
 assert.ok(token);
 const before=structuredClone(r);
 assert.throws(()=>I.move(r,token,'other',0,{tokenAction:'릴리스'}),/이동 위치/);
 assert.deepEqual(r,before);
 assert.ok(r.units[token]?.created);
 I.move(r,token,'grave',0,{tokenAction:'릴리스'});
 assert.equal(r.units[token],undefined);
});

test('R15: bad destination leaves host and attached equipment physically intact',()=>{
 const r=room(),host=make(r,0,'COC-03-002','field');
 const attached=make(r,1,'COC-09-005','hand');
 I.attachCard(r,attached,host);
 const before=structuredClone(r);
 assert.throws(()=>I.move(r,host,'discard',0),/이동 위치/);
 assert.deepEqual(r,before);
 I.move(r,host,'grave',0);
 assert.ok(r.players[0].grave.includes(host));
 assert.ok(r.players[1].grave.includes(attached));
});

test('R16: invalid owner or destination never releases overlaid materials',()=>{
 const r=room(),host=make(r,0,'COC-03-002','field'),material=make(r,0,'COC-03-005','hand');
 I.attachOverlayMaterials(r,host,[material]);
 const before=structuredClone(r);
 for(const owner of [-1,2,'0',100]){
  assert.throws(()=>I.move(r,host,'grave',owner),/소유자 또는 조종자/);
  assert.deepEqual(r,before);
 }
 assert.throws(()=>I.move(r,host,'nowhere',0),/이동 위치/);
 assert.deepEqual(r,before);
 I.move(r,host,'hand',0);
 assert.ok(r.players[0].hand.includes(host));
 assert.ok(r.players[0].hand.includes(material));
});
