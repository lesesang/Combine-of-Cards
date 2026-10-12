import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {spellHandlerIds,hasAutoSpell} from '../src/automated-effects.mjs';
import {automationStatus} from '../src/automation-status.mjs';

const raw=fs.readFileSync(new URL('../public/data/catalog.json.gz.b64',import.meta.url),'utf8').trim();
const catalog=JSON.parse(zlib.gunzipSync(Buffer.from(raw,'base64')).toString('utf8'));
const cardIds=new Set(catalog.cards.map(c=>c.id));
const deckIds=new Set(catalog.decks.map(d=>d.id));

test('the approved catalog contains exactly 24 decks and 254 unique card records',()=>{
 assert.equal(catalog.decks.length,24);
 assert.equal(catalog.cards.length,254);
 assert.equal(deckIds.size,24,'duplicate deck IDs');
 assert.equal(cardIds.size,254,'duplicate card IDs');
});

test('all registered automatic handlers reference existing cards',()=>{
 assert.equal(new Set(spellHandlerIds).size,spellHandlerIds.length,'duplicate handler IDs');
 for(const id of spellHandlerIds){
  assert.ok(cardIds.has(id),'orphaned automation handler: '+id);
  assert.ok(hasAutoSpell(id),'handler lookup inconsistent: '+id);
 }
});

test('coverage never reports complete automation without an audited definition',()=>{
 const statuses=new Set(['manual','partial','basic']);
 for(const card of catalog.cards){
  const status=automationStatus(card);
  assert.ok(statuses.has(status),card.id+': unknown coverage status '+status);
  if(status==='basic'){
   assert.equal(card.effects?.length||0,0,card.id+': effect-bearing card misclassified as basic');
   assert.equal(card.conditions?.length||0,0,card.id+': conditional card misclassified as basic');
  }
 }
});

test('deleted deck families do not appear as playable deck names',()=>{
 const deleted=['합체 기계','코미컬','럭키','카지노이드','비트스타즈','파트너 몬스터즈','코브라','아홉꼬리'];
 for(const deck of catalog.decks)for(const word of deleted){
  assert.ok(!String(deck.name).includes(word),word+' unexpectedly remains playable');
 }
});
