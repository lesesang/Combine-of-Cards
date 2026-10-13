import test from 'node:test';
import assert from 'node:assert/strict';
import {
 declareEffect, declareAutomaticGroup, resolveEffectStack,
 registerPersistent, endPersistent, tickPersistent
} from '../src/effect-runtime.mjs';

const room = () => ({turn:0,turnNumber:3,effectStack:[],persistentEffects:[]});
const present = id => id === 'a' ? {zone:'field',player:0} : id === 'b' ? {zone:'field',player:1} : null;

test('a declared chain resolves last in, first out without introducing functions into saved state',()=>{
 const r=room();
 declareEffect(r,{effectId:'A',sourceId:'a',owner:0,payload:{amount:3}});
 declareEffect(r,{effectId:'B',sourceId:'b',owner:1,payload:{amount:7}});
 assert.equal(JSON.stringify(r.effectStack).includes('function'),false);
 const executed=[];
 const outcomes=resolveEffectStack(r,{getZone:present,execute:item=>executed.push(item.effectId)});
 assert.deepEqual(executed,['B','A']);
 assert.deepEqual(outcomes.map(x=>x.status),['resolved','resolved']);
 assert.equal(r.effectStack.length,0);
});

test('a field source removed before resolution negates an ordinary effect',()=>{
 const r=room();
 declareEffect(r,{effectId:'A',sourceId:'a',owner:0});
 const outputs=resolveEffectStack(r,{getZone:()=>({zone:'grave',player:0}),execute:()=>assert.fail('must not execute')});
 assert.equal(outputs[0].status,'negated-source-moved');
});

test('destroy triggers, graveyard triggers, paid self costs and independently registered effects survive source departure',()=>{
 for(const exception of ['destroy-trigger','graveyard','self-cost','independent']){
  const r=room();declareEffect(r,{effectId:exception,sourceId:'a',owner:0,exception});
  const resolved=resolveEffectStack(r,{getZone:()=>null,execute:()=>{}});
  assert.equal(resolved[0].status,'resolved',exception);
 }
});

test('wrong-side source control negates a normal field activation',()=>{
 const r=room();declareEffect(r,{effectId:'stolen',sourceId:'a',owner:0});
 const result=resolveEffectStack(r,{getZone:()=>({zone:'field',player:1}),execute:()=>assert.fail('wrong controller')});
 assert.equal(result[0].status,'negated-source-moved');
});

test('same-priority automatic triggers declare active player first, opponent second',()=>{
 const r=room();
 declareAutomaticGroup(r,[
  {key:'enemy',effectId:'enemy',owner:1,sourceId:'b'},
  {key:'ally',effectId:'ally',owner:0,sourceId:'a'}
 ],0);
 assert.deepEqual(r.effectStack.map(e=>e.effectId),['ally','enemy']);
 const outcomes=[];
 resolveEffectStack(r,{getZone:present,execute:e=>outcomes.push(e.effectId)});
 assert.deepEqual(outcomes,['enemy','ally']);
});

test('higher explicit-priority triggers resolve before lower priority even with LIFO',()=>{
 const r=room();
 declareAutomaticGroup(r,[
  {key:'gold',effectId:'gold',owner:0,sourceId:'a',priority:0},
  {key:'ring',effectId:'ring',owner:0,sourceId:'a',priority:10}
 ],0);
 const results=[];
 resolveEffectStack(r,{getZone:present,execute:e=>results.push(e.effectId)});
 assert.deepEqual(results,['ring','gold']);
});

test('custom automatic trigger order must mention every trigger exactly once',()=>{
 const r=room();
 const pair=[{key:'a',effectId:'A',owner:0},{key:'b',effectId:'B',owner:0}];
 assert.throws(()=>declareAutomaticGroup(r,pair,0,['a','a']),/ordering/);
 assert.equal(r.effectStack.length,0);
 declareAutomaticGroup(r,pair,0,['b','a']);
 assert.deepEqual(r.effectStack.map(e=>e.effectId),['B','A']);
});

test('persistent effect is separate from a source card, retains counters, and expires on anchor destruction',()=>{
 const r=room();
 const gold=registerPersistent(r,{
  kind:'dragon-gold',owner:0,sourceId:'gold-card',anchorId:'fafnir-unit',
  counters:3,expires:'anchor-destroyed'
 });
 gold.counters += 5;
 assert.equal(registerPersistent(r,{kind:'dragon-gold',owner:0,sourceId:'gold-card'}).id,gold.id);
 assert.equal(JSON.parse(JSON.stringify(r)).persistentEffects[0].counters,8);
 assert.equal(tickPersistent(r,{type:'zone-changed',unitId:'gold-card',to:'grave'}),0);
 assert.equal(tickPersistent(r,{type:'destroyed',unitId:'other-unit'}),0);
 assert.equal(tickPersistent(r,{type:'destroyed',unitId:'fafnir-unit'}),1);
 assert.equal(r.persistentEffects.length,0);
});

test('source-left-field and end-of-turn lifetimes are independently tracked',()=>{
 const r=room();
 registerPersistent(r,{kind:'equip',owner:0,sourceId:'x',expires:'source-left-field'});
 registerPersistent(r,{kind:'temporary',owner:1,sourceId:'y',expires:'turn-end'});
 assert.equal(tickPersistent(r,{type:'zone-changed',unitId:'x',to:'integration'}),0);
 assert.equal(tickPersistent(r,{type:'zone-changed',unitId:'x',to:'hand'}),1);
 assert.equal(tickPersistent(r,{type:'turn-ended',turnNumber:3,activePlayer:0}),0);
 assert.equal(tickPersistent(r,{type:'turn-ended',turnNumber:3,activePlayer:1}),1);
 assert.equal(endPersistent(r,()=>true),0);
});

test('new nested effects are pushed safely during resolution',()=>{
 const r=room();declareEffect(r,{effectId:'first',owner:0,sourceId:'a'});
 const executed=[];
 resolveEffectStack(r,{getZone:present,execute:e=>{
  executed.push(e.effectId);
  if(e.effectId==='first')declareEffect(r,{effectId:'reaction',owner:1,sourceId:'b'});
 }});
 assert.deepEqual(executed,['first','reaction']);
 assert.equal(r.effectStack.length,0);
});
