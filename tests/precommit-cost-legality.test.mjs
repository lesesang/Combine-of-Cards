import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-cost-legality-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));

function room(deck='14',mode='pvp'){
 const r={code:'PREPAY',players:[],units:{},logs:[],effects:[],mode,status:'active',
  turn:0,turnNumber:3,phase:'MAIN',version:1,pendingAttack:null,
  pendingExtraSummon:null,pendingSpell:null,pendingTriggerOrder:null,pendingManual:null};
 I.createPlayer(r,deck,'Caster','a');I.createPlayer(r,'03','Enemy','b');
 r.players[0].turnsTaken=2;r.players[1].turnsTaken=2;
 const take=(who,cardId,to)=>{
  const id=r.players[who].deck.find(uid=>r.units[uid].cardId===cardId);
  assert.ok(id,'missing '+cardId);
  if(to)I.move(r,id,to,who);
  return id;
 };
 return {r,take};
}

test('R20: a forbidden spell cannot consume a valid field-sacrifice cost',()=>{
 const {r,take}=room('21');
 const spell=take(0,'COC-21-004','hand');
 const sacrifice=r.players[0].deck.find(uid=>I.cards.get(r.units[uid].cardId)?.type==='몬스터');
 assert.ok(sacrifice,'the sacrifice must be a real deck monster');
 I.move(r,sacrifice,'field',0);
 const victim=take(1,'COC-03-002','field');
 r.units[sacrifice].atk=160;r.units[sacrifice].hp=120;
 r.players[0].spellForbiddenUntil=r.players[0].turnsTaken;
 const before=structuredClone(r);
 assert.throws(()=>I.apply(r,0,'play',{unitId:spell,costUnitIds:[sacrifice],
  target:{type:'unit',id:victim}}),/주문 사용 금지/);
 assert.deepEqual(r,before,'no paid costs, token events or card use counts after prohibition');
});

test('R20: unsupported AI spell is rejected before its usage or planned action',()=>{
 const {r,take}=room('01','ai');
 const spell=take(0,'COC-01-007','hand');
 const before=structuredClone(r);
 assert.throws(()=>I.apply(r,0,'play',{unitId:spell}),/자동 판정을 지원하지 않습니다/);
 assert.deepEqual(r,before);
});

test('R20: occupying the integration zone does not destroy two summon materials',()=>{
 const {r,take}=room('14');
 const source=take(0,'COC-14-001','hand');
 const first=take(0,'COC-14-008','field');
 const second=take(0,'COC-14-009','field');
 const occupant=take(0,'COC-14-004','integration');
 const before=structuredClone(r);
 assert.throws(()=>I.apply(r,0,'play',{unitId:source,costUnitIds:[first,second]}),/이미 일체화/);
 assert.deepEqual(r,before);
 assert.ok(r.players[0].integration===occupant);
});

test('R20: protected second material rejects before first sacrifice is destroyed',()=>{
 const {r,take}=room('14');
 const source=take(0,'COC-14-001','hand');
 const first=take(0,'COC-14-008','field');
 const second=take(0,'COC-14-009','field');
 r.units[second].effectDestructionImmune=true;
 const before=structuredClone(r);
 assert.throws(()=>I.apply(r,0,'play',{unitId:source,costUnitIds:[first,second]}),/파괴 비용/);
 assert.deepEqual(r,before);
});

test('R20: valid two-material destruction still summons after both costs are paid',()=>{
 const {r,take}=room('14');
 const source=take(0,'COC-14-001','hand');
 const first=take(0,'COC-14-008','field');
 const second=take(0,'COC-14-009','field');
 I.apply(r,0,'play',{unitId:source,costUnitIds:[first,second]});
 assert.ok(r.players[0].integration===source);
 assert.ok(r.players[0].grave.includes(first));
 assert.ok(r.players[0].grave.includes(second));
 assert.equal(r.players[0].roundPlays,1);
});

test('R20: a full monster field rejects an ordinary summon without costs',()=>{
 const {r,take}=room('22');
 const source=take(0,'COC-22-001','hand');
 const occupants=['COC-22-002','COC-22-003','COC-22-004']
  .map(id=>take(0,id,'field'));
 const before=structuredClone(r);
 assert.throws(()=>I.apply(r,0,'play',{unitId:source}),/필드 세 칸/);
 assert.deepEqual(r,before);
 assert.ok(occupants.every(uid=>r.players[0].field.includes(uid)));
});
