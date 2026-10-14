import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {evolutionRules,evolutionSpellIds,natureEvolutionCosts} from '../src/evolution.mjs';
import {deckSearchSpellIds} from '../src/deck-search.mjs';
import {evolutionSearchFixture as fixture} from './helpers/evolution-search-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-evolution-http-'));process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const fixtures=[...evolutionSpellIds,...deckSearchSpellIds].map((cardId,index)=>{
 const f=fixture(I,cardId);f.r.code='E'+String(index).padStart(5,'0');return {...f,cardId};
});
const storage=path.join(dir,'rooms.json');fs.writeFileSync(storage,JSON.stringify(Object.fromEntries(fixtures.map(f=>[f.r.code,f.r]))));
let server,base,seq=0;
async function restart(){if(server?.listening)await new Promise(ok=>server.close(ok));
 const {createApp}=await import(`../server.mjs?evolution=${++seq}`);server=createApp();
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`;}
async function call(code,who,body,suffix=''){
 const res=await fetch(base+'/api/rooms/'+code+(body?'/actions':suffix),{method:body?'POST':'GET',
 headers:{authorization:'Bearer '+(who===0?'a':'b').repeat(64),'content-type':'application/json'},body:typeof body==='string'?body:body?JSON.stringify(body):undefined});
 return {status:res.status,state:await res.json()};
}
test.after(async()=>{if(server?.listening)await new Promise(ok=>server.close(ok));fs.rmSync(dir,{recursive:true,force:true});});
test('evolution/search HTTP: eleven declarations roll back failures and restore paid responses and private selections',async()=>{
 await restart();const saved=new Map();
 const nature=fixtures.find(f=>f.cardId==='COC-30-009'),preview='/evolution-costs?unitId='+nature.spell;
 const beforePreview=fs.readFileSync(storage,'utf8');
 assert.equal((await call(nature.r.code,1,null,preview)).status,403);
 assert.equal((await call(nature.r.code,0,null,'/evolution-costs?unitId=missing')).status,409);
 const costs=await call(nature.r.code,0,null,preview);assert.equal(costs.status,200);
 assert.deepEqual(costs.state.choices.map(x=>x.id),natureEvolutionCosts(nature.r,0,nature.spell,I.cards));
 assert.equal(fs.readFileSync(storage,'utf8'),beforePreview);
 for(const f of fixtures){
  const before=fs.readFileSync(storage,'utf8');
  const corrupt=JSON.stringify({type:'play',...f.body,expectedVersion:1}).slice(0,-1)+',"extra":1e309}';
  const failed=await call(f.r.code,0,corrupt);assert.equal(failed.status,500,f.cardId);assert.match(failed.state.details,/JSON/);
  assert.equal(fs.readFileSync(storage,'utf8'),before);
  const declared=await call(f.r.code,0,{type:'play',...f.body,expectedVersion:1});assert.equal(declared.status,200,f.cardId);
  assert.equal(declared.state.pendingSpell.card.id,f.cardId);assert.equal(declared.state.pendingDeckSearch,null);
  assert.equal(declared.state.effectStack,undefined);assert.equal(declared.state.players[1].hand,null);saved.set(f.r.code,declared.state);
 }
 assert.equal((await call(nature.r.code,0,null,preview)).status,409);
 await restart();
 for(const f of fixtures){
  assert.deepEqual((await call(f.r.code,0)).state,saved.get(f.r.code));
  assert.equal((await call(f.r.code,0,{type:'spellResponse',choice:'pass',expectedVersion:2})).status,403);
  const result=await call(f.r.code,1,{type:'spellResponse',choice:'pass',expectedVersion:2});assert.equal(result.status,200);
  assert.equal(result.state.pendingSpell,null);
  if(evolutionRules[f.cardId]){
   const actual=JSON.parse(fs.readFileSync(storage,'utf8'))[f.r.code];
   assert.equal(actual.units[f.source].cardId,evolutionRules[f.cardId].target);
   assert.equal(actual.units[f.source].atk,(Number(I.cards.get(evolutionRules[f.cardId].target).atk)||0)+50);
   if(f.cardId==='COC-30-009'){assert.equal(actual.players[0].hp,1800);assert.ok(f.body.costDeckIds.every(id=>actual.players[0].grave.includes(id)));}
  }else{
   assert.equal(result.state.pendingDeckSearch.choices,undefined);
   const own=(await call(f.r.code,0)).state;assert.ok(own.pendingDeckSearch.choices.length);saved.set(f.r.code,own);
  }
 }
 await restart();
 for(const f of fixtures.filter(f=>deckSearchSpellIds.includes(f.cardId))){
  const view=(await call(f.r.code,0)).state;assert.deepEqual(view,saved.get(f.r.code));
  const selected=view.pendingDeckSearch.choices.at(-1).id,before=fs.readFileSync(storage,'utf8');
  assert.equal((await call(f.r.code,1,{type:'deckSearch',unitId:selected,expectedVersion:3})).status,403);
  assert.equal((await call(f.r.code,0,{type:'deckSearch',unitId:'missing',expectedVersion:3})).status,409);
  assert.equal((await call(f.r.code,0,{type:'phase',expectedVersion:3})).status,409);
  assert.equal(fs.readFileSync(storage,'utf8'),before);
  const chosen=await call(f.r.code,0,{type:'deckSearch',unitId:selected,expectedVersion:3});assert.equal(chosen.status,200);
  assert.equal(chosen.state.pendingDeckSearch,null);assert.ok(chosen.state.players[0].hand.some(u=>u.id===selected));
  assert.equal((await call(f.r.code,0,{type:'deckSearch',unitId:selected,expectedVersion:3})).status,409);
  assert.equal((await call(f.r.code,1)).state.players[0].hand,null);
 }
});
