import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-equipment-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
function room(){
 const r={code:'R15',status:'active',turn:0,turnNumber:3,phase:'MAIN',version:1,
 players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,'09','Smith','a');I.createPlayer(r,'03','Enemy','b');return r;
}
function create(r,id,who,to){const uid=I.instantiate(r,id,who);I.move(r,uid,to,who);return uid;}
test('R15: equipment is one physical card, not simultaneously in the hand and field',()=>{
 const r=room(),host=create(r,'COC-09-002',0,'integration'),equipment=create(r,'COC-09-005',0,'hand');
 I.attachCard(r,equipment,host);
 assert.ok(!r.players[0].hand.includes(equipment));
 assert.deepEqual(r.units[host].attachments,[equipment]);
 assert.equal(r.units[equipment].attachmentHostId,host);
 assert.equal(JSON.parse(JSON.stringify(r)).units[equipment].attachmentHostId,host);
 assert.throws(()=>I.move(r,equipment,'grave',0),/장착 중/);
 assert.deepEqual(r.units[host].attachments,[equipment]);
});
test('R15: host moves to grave, hand, deck and banished with equipped card to original owner',()=>{
 for(const destination of ['grave','hand','deck','banished']){
  const r=room(),host=create(r,'COC-09-002',0,'integration'),equipment=create(r,'COC-09-005',1,'hand');
  I.attachCard(r,equipment,host);
  I.move(r,host,destination,0);
  assert.ok(r.players[0][destination].includes(host));
  assert.ok(r.players[1][destination].includes(equipment));
  assert.equal(r.units[equipment].attachmentHostId,undefined);
  assert.equal(r.units[host].attachments,undefined);
 }
});
test('R15: changing host field controller preserves attachment without duplicating its UID',()=>{
 const r=room(),host=create(r,'COC-09-002',0,'field'),equipment=create(r,'COC-09-005',0,'hand');
 I.attachCard(r,equipment,host);
 I.move(r,host,'field',1);
 assert.ok(r.players[1].field.includes(host));
 assert.deepEqual(r.units[host].attachments,[equipment]);
 assert.ok(!r.players[0].hand.includes(equipment));
 I.move(r,host,'grave',r.units[host].owner);
 assert.ok(r.players[0].grave.includes(host));
 assert.ok(r.players[0].grave.includes(equipment));
});
test('R15: invalid attachment input rejects without moving either card',()=>{
 const r=room(),host=create(r,'COC-09-002',0,'integration'),equipment=create(r,'COC-09-005',0,'hand'),other=create(r,'COC-09-006',0,'hand');
 I.attachCard(r,equipment,host);
 const before=structuredClone(r);
 assert.throws(()=>I.attachCard(r,equipment,host),/장착할 카드/);
 assert.throws(()=>I.attachCard(r,other,equipment),/장착할 카드/);
 assert.throws(()=>I.attachCard(r,host,host),/장착할 카드/);
 assert.deepEqual(r,before);
});
test('R15: destroyed host releases attached card to its original owner grave',()=>{
 const r=room(),host=create(r,'COC-09-002',0,'field'),equipment=create(r,'COC-09-005',0,'hand');
 I.attachCard(r,equipment,host);
 I.H.destroy(r,host);
 assert.ok(r.players[0].grave.includes(host));
 assert.ok(r.players[0].grave.includes(equipment));
 assert.equal(r.units[equipment].attachmentHostId,undefined);
});


test('R15: detach one of two attachments without moving host or the other card',()=>{
 const r=room(),host=create(r,'COC-09-002',0,'integration');
 const sword=create(r,'COC-09-005',0,'hand'),shield=create(r,'COC-09-006',0,'hand');
 I.attachCard(r,sword,host);I.attachCard(r,shield,host);
 const serialized=JSON.parse(JSON.stringify(r));
 assert.equal(I.detachCard(serialized,sword,'grave',{cause:'card-effect'}),sword);
 assert.equal(serialized.players[0].integration,host);
 assert.deepEqual(serialized.units[host].attachments,[shield]);
 assert.equal(serialized.units[shield].attachmentHostId,host);
 assert.ok(serialized.players[0].grave.includes(sword));
 assert.equal(serialized.units[sword].attachmentHostId,undefined);
 assert.ok(!serialized.players[0].hand.includes(shield));
 I.move(serialized,host,'hand',0);
 assert.ok(serialized.players[0].hand.includes(host));
 assert.ok(serialized.players[0].hand.includes(shield));
 assert.ok(serialized.players[0].grave.includes(sword));
});
test('R15: detach uses equipment original owner even after opponent captures host',()=>{
 for(const destination of ['grave','hand','deck','banished']){
  const r=room(),host=create(r,'COC-09-002',0,'field'),equipment=create(r,'COC-09-005',1,'hand');
  I.attachCard(r,equipment,host);
  I.move(r,host,'field',1);
  I.detachCard(r,equipment,destination,{cause:'host-effect'});
  assert.ok(r.players[1][destination].includes(equipment));
  assert.ok(!r.players[0][destination]?.includes(equipment));
  assert.ok(r.players[1].field.includes(host));
  assert.equal(r.units[host].attachments,undefined);
  assert.equal(r.units[equipment].attachmentHostId,undefined);
 }
});
test('R15: invalid detach does not alter saved attachment state',()=>{
 const r=room(),host=create(r,'COC-09-002',0,'field');
 const equipment=create(r,'COC-09-005',0,'hand');
 I.attachCard(r,equipment,host);
 const snapshot=structuredClone(r);
 assert.throws(()=>I.detachCard(r,equipment,'field',{cause:'card-effect'}),/장착 해제/);
 assert.throws(()=>I.detachCard(r,host,'grave',{cause:'card-effect'}),/장착 해제/);
 assert.throws(()=>I.detachCard(r,'forged','grave',{cause:'card-effect'}),/장착 해제/);
 assert.deepEqual(r,snapshot);
 I.detachCard(r,equipment,'hand',{cause:'card-effect'});
 const after=structuredClone(r);
 assert.throws(()=>I.detachCard(r,equipment,'grave',{cause:'card-effect'}),/장착 해제/);
 assert.deepEqual(r,after);
});

test('R15 confirmed: no voluntary unequip or generic player action',()=>{
 const r=room(),host=create(r,'COC-09-002',0,'integration'),equipment=create(r,'COC-09-005',0,'hand');
 I.attachCard(r,equipment,host);
 const original=structuredClone(r);
 assert.throws(()=>I.detachCard(r,equipment,'grave'),/임의로 할 수 없습니다/);
 assert.throws(()=>I.detachCard(r,equipment,'grave',{cause:'voluntary'}),/임의로 할 수 없습니다/);
 assert.throws(()=>I.apply(r,0,'detach',{unitId:equipment}),/알 수 없는 행동/);
 assert.deepEqual(r,original,'no voluntary unequip may mutate physical or effect state');
 I.detachCard(r,equipment,'grave',{cause:'card-effect'});
 assert.ok(r.players[0].grave.includes(equipment));
});
