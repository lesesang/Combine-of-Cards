import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {compileEffectInventory} from '../scripts/effect-inventory.mjs';
const packed=fs.readFileSync(new URL('../public/data/catalog.json.gz.b64',import.meta.url),'utf8').trim();
const catalog=JSON.parse(zlib.gunzipSync(Buffer.from(packed,'base64')).toString('utf8'));
const reviewed=JSON.parse(fs.readFileSync(new URL('../docs/effect-coverage.json',import.meta.url),'utf8'));
test('R27: every condition/effect from all 254 cards has an indexed row',()=>{
 const inv=compileEffectInventory(catalog,reviewed);
 assert.equal(inv.counts.cards,254);
 assert.equal(inv.counts.reviewedEffects,4);
 assert.equal(inv.counts.effects,inv.records.filter(x=>x.kind==='effect').length);
 assert.equal(inv.counts.conditions,inv.records.filter(x=>x.kind==='condition').length);
 assert.equal(inv.counts.reviewedEffects+inv.counts.unverifiedEffects,inv.counts.effects);
 const id=new Set(inv.records.map(x=>[x.cardId,x.kind,x.number].join(':')));
 assert.equal(id.size,inv.records.length,'card/condition/effect identity must be unique');
 for(const card of catalog.cards){
  assert.equal(inv.records.filter(r=>r.cardId===card.id&&r.kind==='effect').length,card.effects.length,card.id);
  assert.equal(inv.records.filter(r=>r.cardId===card.id&&r.kind==='condition').length,card.conditions.length,card.id);
 }
 assert.ok(inv.records.some(x=>x.status==='unverified'),'unknown status must not become complete');
 assert.ok(!inv.records.some(x=>x.status==='complete'));
});
test('R27: stale or invented proof is rejected instead of silently claiming full support',()=>{
 const changed=structuredClone(reviewed);
 changed[0].sourceText='invented text';
 assert.throws(()=>compileEffectInventory(catalog,changed),/outdated effect proof/);
 const wrong=[...reviewed,{...reviewed[0]}];
 assert.throws(()=>compileEffectInventory(catalog,wrong),/outdated effect proof/);
 const fake=[...reviewed,{...reviewed[0],cardId:'COC-99-999'}];
 assert.throws(()=>compileEffectInventory(catalog,fake),/outdated effect proof/);
});
test('R27: official R28 piercing damage basis is confirmed but implementation proof remains partial',()=>{
 const record=reviewed.find(e=>e.cardId==='COC-12-013'&&e.effectNumber===2);
 assert.equal(record.status,'partial');
 assert.match(record.resolution,/다이스/);
 assert.doesNotMatch(record.remaining,/공식 확인/);
});
