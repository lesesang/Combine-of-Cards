import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-extra-response-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));

function setup(mode='pvp'){
 const r={code:'RESP22',players:[],units:{},logs:[],effects:[],turn:0,turnNumber:3,
   phase:'MAIN',status:'active',version:1,mode,pendingAttack:null,pendingManual:null,pendingExtraSummon:null};
 I.createPlayer(r,'22','Caster','a');
 I.createPlayer(r,'03','Opponent','b');
 r.players[0].turnsTaken=2;r.players[1].turnsTaken=2;
 const take=(cardId,zone)=>{
   const id=r.players[0].deck.find(id=>r.units[id].cardId===cardId)||
     r.players[0].extra.find(id=>r.units[id].cardId===cardId);
   assert.ok(id,cardId);
   if(zone)I.move(r,id,zone,0);
   return id;
 };
 const spell=take('COC-22-008','hand'),one=take('COC-22-002','hand'),two=take('COC-22-003','hand');
 const extra=take('COC-22-014');
 const summon=()=>I.apply(r,0,'extraSummon',{extraUnitId:extra,materials:[one,two],spellUnitId:spell});
 return {r,spell,one,two,extra,summon,take};
}

test('R22: valid extra summon pays costs before waiting, then opponent pass resolves',()=>{
 const {r,spell,one,two,extra,summon}=setup();
 const preview=summon();
 assert.equal(preview.version,2);
 assert.ok(preview.pendingExtraSummon);
 assert.equal(preview.pendingExtraSummon.materialCount,2);
 assert.equal(preview.pendingExtraSummon.card.id,'COC-22-014');
 assert.equal(preview.pendingExtraSummon.extraUnitId,undefined,'never expose private internal UID');
 assert.ok(r.players[0].grave.includes(spell));
 assert.ok(r.players[0].grave.includes(one));
 assert.ok(r.players[0].grave.includes(two));
 assert.ok(r.players[0].extra.includes(extra),'not summoned until response');
 assert.equal(r.players[0].field.includes(extra),false);
 assert.throws(()=>I.apply(r,0,'extraResponse',{choice:'pass'}),/상대의/);
 assert.throws(()=>I.apply(r,1,'extraResponse',{choice:'negate'}),/아직 지원하지/);
 assert.throws(()=>I.apply(r,0,'phase',{}),/대응 중/);
 assert.throws(()=>I.apply(r,0,'extraSummon',{}),/대응 중/);
 assert.equal(r.pendingExtraSummon.extraUnitId,extra);
 const result=I.apply(r,1,'extraResponse',{choice:'pass'});
 assert.equal(result.pendingExtraSummon,null);
 assert.ok(r.players[0].field.includes(extra));
 assert.equal(r.players[0].extra.includes(extra),false);
 assert.ok(r.players[0].grave.includes(spell),'spell cost is not refunded');
 assert.ok(r.players[0].grave.includes(one));
 assert.equal(I.publicState(r,1).players[0].hand,null,'opponent hand must stay private');
 assert.ok(!JSON.stringify(I.publicState(r,1)).includes(r.pendingExtraSummon?.extraUnitId||'__NEVER__'));
 assert.throws(()=>I.apply(r,1,'extraResponse',{choice:'pass'}),/상대의/);
});

test('R22: pending state survives JSON serialization with no automatic refund',()=>{
 const s=setup();s.summon();
 const restored=JSON.parse(JSON.stringify(s.r));
 assert.equal(restored.pendingExtraSummon.extraUnitId,s.extra);
 assert.ok(restored.players[0].grave.includes(s.one));
 I.apply(restored,1,'extraResponse',{choice:'pass'});
 assert.equal(restored.pendingExtraSummon,null);
 assert.ok(restored.players[0].field.includes(s.extra));
 assert.ok(restored.players[0].grave.includes(s.spell));
});

test('R22: invalid material, no spell, missing target cannot consume a cost',()=>{
 const s=setup(),before=structuredClone(s.r);
 assert.throws(()=>I.apply(s.r,0,'extraSummon',{extraUnitId:s.extra,materials:[s.one,s.one],spellUnitId:s.spell}),/소재/);
 assert.deepEqual(s.r,before);
 assert.throws(()=>I.apply(s.r,0,'extraSummon',{extraUnitId:s.extra,materials:[s.one,s.two]}),/주문/);
 assert.deepEqual(s.r,before);
});

test('R22: AI opponent passes its response via the same server action',()=>{
 const s=setup('ai');s.r.players[1].ai=true;
 s.summon();
 assert.ok(s.r.pendingExtraSummon);
 I.runAI(s.r);
 assert.equal(s.r.pendingExtraSummon,null);
 assert.ok(s.r.players[0].field.includes(s.extra));
});

test('R22: forfeiting during a response closes the window without restoring costs',()=>{
 const s=setup();s.summon();
 I.apply(s.r,1,'concede',{});
 assert.equal(s.r.pendingExtraSummon,null);
 assert.equal(s.r.status,'finished');
 assert.ok(s.r.players[0].grave.includes(s.spell));
 assert.ok(s.r.players[0].extra.includes(s.extra));
});

test('R22: pending summon is not a license to arbitrarily negate an opponent card',()=>{
 const s=setup();s.summon();
 const snapshot=structuredClone(s.r);
 assert.throws(()=>I.apply(s.r,1,'extraResponse',{choice:'negate',target:s.extra}),/아직 지원하지/);
 assert.deepEqual(s.r,snapshot);
});
