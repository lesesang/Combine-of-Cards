import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {effectUsedThisTurn,markEffectUsed,requireUnusedEffect,migrateLegacyEffectUsage,ELEMENTAL_MAGICIAN_IDS} from '../src/effect-usage.mjs';
import {fieldAbilityFixture} from './helpers/field-ability-fixture.mjs';
import {extraCounterFixture} from './helpers/extra-counter-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-physical-use-'));process.env.DATA_DIR=dir;
const {gameTestInternals:I}=await import('../server.mjs');test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
test('physical effect usage: identical card copies each activate while one UID cannot reuse after movement or restore',()=>{
 const f=fieldAbilityFixture(I,'COC-12-013'),second=f.add('COC-12-013',0,'field'),secondCost=f.add('COC-12-008',0,'hand');
 I.apply(f.r,0,'ability',f.body);I.apply(f.r,1,'abilityResponse',{choice:'pass'});
 const target=f.add('COC-03-005',1,'field');I.move(f.r,f.source,'hand',0);I.move(f.r,f.source,'field',0);
 const before=structuredClone(f.r);assert.throws(()=>I.apply(f.r,0,'ability',{...f.body,costCardId:secondCost,target:{id:target}}),/이번 턴/);assert.deepEqual(f.r,before);
 I.apply(f.r,0,'ability',{sourceUnitId:second,costCardId:secondCost,target:{id:target}});I.apply(f.r,1,'abilityResponse',{choice:'pass'});
 const restored=JSON.parse(JSON.stringify(f.r));assert.ok(effectUsedThisTurn(restored,0,f.source,1));assert.ok(effectUsedThisTurn(restored,0,second,1));assert.ok(restored.players[1].grave.includes(target));
 I.move(restored,second,'field',1);assert.ok(effectUsedThisTurn(restored,1,second,1));
});
test('physical effect usage: different cards with the same text and identical legacy field cards are independent',()=>{
 const f=fieldAbilityFixture(I,'COC-24-003');f.r.units[f.source].hp=100;
 const same=f.add('COC-24-003',0,'field'),other=f.add('COC-26-003',0,'field');
 for(const sourceUnitId of [f.source,same,other])I.apply(f.r,0,'ability',{sourceUnitId,target:{id:f.source}});
 for(const sourceUnitId of [f.source,same,other])assert.throws(()=>I.apply(f.r,0,'ability',{sourceUnitId,target:{id:f.source}}),/이번 턴/);
});
test('physical effect usage: two Fusion Up copies have separate fusion and grave recovery limits',()=>{
 const f=extraCounterFixture(I,'COC-22-014');const add=(cid,to)=>{const id=I.instantiate(f.r,cid,0);if(to==='extra')f.r.players[0].extra.push(id);else I.move(f.r,id,to,0);return id;};
 const second=add('COC-22-008','hand'),extra2=add('COC-22-014','extra'),materials2=[add('COC-22-002','hand'),add('COC-22-003','hand')];
 I.apply(f.r,0,'extraSummon',f.body);I.apply(f.r,1,'extraResponse',{choice:'pass'});
 I.apply(f.r,0,'extraSummon',{extraUnitId:extra2,materials:materials2,spellUnitId:second});I.apply(f.r,1,'extraResponse',{choice:'pass'});
 I.move(f.r,f.extra,'grave',0);I.move(f.r,extra2,'grave',0);
 const payer1=add('COC-22-001','field'),payer2=add('COC-22-001','field');
 for(const [sourceUnitId,costUnitId] of [[f.spell,payer1],[second,payer2]]){
  I.apply(f.r,0,'graveAbility',{sourceUnitId,costUnitId});assert.ok(f.r.players[0].hand.includes(sourceUnitId));assert.ok(effectUsedThisTurn(f.r,0,sourceUnitId,1));assert.ok(effectUsedThisTurn(f.r,0,sourceUnitId,2));
 }
});
test('physical effect usage: AI selects the unused physical copy of an already used card',()=>{
 const f=fieldAbilityFixture(I,'COC-12-013',1),second=f.add('COC-12-013',1,'field');f.r.aiDifficulty='hard';
 I.apply(f.r,1,'ability',f.body);I.apply(f.r,0,'abilityResponse',{choice:'counter',sourceUnitId:f.wind});I.apply(f.r,1,'abilityResponse',{choice:'pass'});
 f.add('COC-12-008',1,'hand');assert.equal(I.chooseAIFieldAbility(f.r).sourceUnitId,second);
});
test('physical effect usage: legacy single-source records migrate once and ambiguous history never locks every copy',()=>{
 const f=fieldAbilityFixture(I,'COC-13-005');f.r.players[0].abilityUsed={'COC-13-005':5};migrateLegacyEffectUsage(f.r);assert.ok(effectUsedThisTurn(f.r,0,f.source,1));assert.equal(f.r.players[0].abilityUsed,undefined);
 const g=fieldAbilityFixture(I,'COC-13-005'),second=g.add('COC-13-005',0,'field');g.r.players[0].abilityUsed={'COC-13-005':5};migrateLegacyEffectUsage(g.r);
 assert.equal(effectUsedThisTurn(g.r,0,g.source,1),false);assert.equal(effectUsedThisTurn(g.r,0,second,1),false);assert.equal(g.r.legacyEffectUsageUnresolved.length,1);const before=structuredClone(g.r);migrateLegacyEffectUsage(g.r);assert.deepEqual(g.r,before);
 const h=fieldAbilityFixture(I,'COC-13-005');h.add('COC-13-005',0,'field');h.r.players[0].abilityUsed={'COC-13-005':5};h.r.pendingAbility={who:0,cardId:'COC-13-005',sourceId:h.source};migrateLegacyEffectUsage(h.r);assert.ok(effectUsedThisTurn(h.r,0,h.source,1));
});

test('physical effect usage: Elemental Magician first effects share one use per player per turn only',()=>{
 for(const first of ELEMENTAL_MAGICIAN_IDS){
  const f=fieldAbilityFixture(I,'COC-12-013'),ids=ELEMENTAL_MAGICIAN_IDS.map(cid=>f.add(cid,0,'hand')),others=ELEMENTAL_MAGICIAN_IDS.map(cid=>f.add(cid,1,'hand'));
  const source=ids[ELEMENTAL_MAGICIAN_IDS.indexOf(first)];markEffectUsed(f.r,0,source,1);
  for(const id of ids){assert.throws(()=>requireUnusedEffect(f.r,0,id,1),/이번 턴/);assert.equal(effectUsedThisTurn(f.r,0,id,2),false);}
  for(const id of others)assert.equal(effectUsedThisTurn(f.r,1,id,1),false);
  markEffectUsed(f.r,1,others[0],1);assert.ok(others.every(id=>effectUsedThisTurn(f.r,1,id,1)));
  const extraCopy=f.add(first,0,'hand');assert.ok(effectUsedThisTurn(f.r,0,extraCopy,1));
  const restored=JSON.parse(JSON.stringify(f.r));assert.ok(effectUsedThisTurn(restored,0,extraCopy,1));restored.turnNumber++;assert.ok(ids.every(id=>!effectUsedThisTurn(restored,0,id,1)));assert.ok(others.every(id=>!effectUsedThisTurn(restored,1,id,1)));
  assert.equal(effectUsedThisTurn(f.r,0,f.source,1),false); // unrelated effects stay independent
 }
});
