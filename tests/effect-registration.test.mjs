import test from 'node:test';
import assert from 'node:assert/strict';
import {
  declareEffect, declareAutomaticGroup, beginAutomaticTriggerOrder,
  chooseAutomaticTriggerOrder, resolveEffectStack, registerPersistent, tickPersistent
} from '../src/effect-runtime.mjs';

const pair = () => [
  {key:'a',effectId:'A',owner:0,payload:{amount:30}},
  {key:'b',effectId:'B',owner:0,payload:{amount:100}}
];

test('R02: invalid declarations cannot open an unresolvable trigger-order window',()=>{
  for (const invalid of [{sourceId:42},{exception:'unknown'},{payload:{callback:()=>1}}]) {
    const room={turn:0,turnNumber:3,effectSequence:5};
    const effects=pair();Object.assign(effects[1],invalid);
    const before=structuredClone(room);
    assert.throws(()=>beginAutomaticTriggerOrder(room,effects,0));
    assert.deepEqual(room,before);
    assert.equal(beginAutomaticTriggerOrder(room,pair(),0).awaiting,0);
  }
});

test('R02: trigger-order preflight reserves no sequence and rejects an overflowing group',()=>{
  const room={effectSequence:Number.MAX_SAFE_INTEGER-1};
  const before=structuredClone(room);
  assert.throws(()=>beginAutomaticTriggerOrder(room,pair(),0),/sequence overflow/);
  assert.deepEqual(room,before);
  room.effectSequence=8;
  beginAutomaticTriggerOrder(room,pair(),0);
  assert.equal(room.effectSequence,8,'choosing an order is not a declaration');
  assert.equal(room.effectStack,undefined);
  const restored=JSON.parse(JSON.stringify(room));
  chooseAutomaticTriggerOrder(restored,0,['b','a']);
  assert.deepEqual(restored.effectStack.map(e=>e.sequence),[9,10]);
  const executed=[];
  resolveEffectStack(restored,{getZone:()=>null,execute:e=>executed.push(e.effectId)});
  assert.deepEqual(executed,['A','B']);
});

test('R01: failed persistent registration leaves state untouched and retries with the next ID',()=>{
  for (const existing of [false,true]) {
    const room={turnNumber:3};
    if(existing) registerPersistent(room,{kind:'gold',owner:0,sourceId:'first'});
    const before=structuredClone(room);
    assert.throws(()=>registerPersistent(room,{
      kind:'gold',owner:0,sourceId:'second',data:{callback:()=>1}
    }));
    assert.deepEqual(room,before);
    const entry=registerPersistent(room,{kind:'gold',owner:0,sourceId:'second'});
    assert.equal(entry.id,'continuous-'+(existing?2:1));
  }
});

test('R01: persistent sequence overflow cannot create duplicate identities after restore',()=>{
  const room={persistentSequence:Number.MAX_SAFE_INTEGER};
  const before=structuredClone(room);
  assert.throws(()=>registerPersistent(room,{kind:'gold',owner:0,sourceId:'a'}),/sequence overflow/);
  assert.deepEqual(room,before);
});

test('R01: effect data that JSON cannot preserve is rejected before any registration',()=>{
  const cycle={};cycle.self=cycle;
  const badValues=[Infinity,NaN,1n,new Map([['amount',3]]),new Set([1]),new Date(),cycle,[undefined]];
  for (const value of badValues) {
    for (const register of [
      r=>declareEffect(r,{effectId:'A',owner:0,payload:{value}}),
      r=>declareAutomaticGroup(r,[...pair(),{key:'c',effectId:'C',owner:1,payload:{value}}],0),
      r=>beginAutomaticTriggerOrder(r,[pair()[0],{...pair()[1],payload:{value}}],0),
      r=>registerPersistent(r,{kind:'gold',owner:0,sourceId:'a',data:{value}})
    ]) {
      const room={turnNumber:3};
      assert.throws(()=>register(room),/JSON/);
      assert.deepEqual(room,{turnNumber:3});
    }
  }
});

test('R01: optional object fields are omitted before persistence and accepted data is detached',()=>{
  const body={unitId:'spell',targets:undefined,costCardId:undefined,target:{type:'player'}};
  const room={};
  const entry=declareEffect(room,{effectId:'spell',owner:1,payload:{body}});
  assert.deepEqual(entry.payload.body,{unitId:'spell',target:{type:'player'}});
  body.target.type='unit';
  assert.equal(entry.payload.body.target.type,'player');
  assert.deepEqual(JSON.parse(JSON.stringify(room)),room);
});

test('R01: persistent counters and lifetime survive JSON restoration without duplicate registration',()=>{
  const room={turnNumber:3};
  const data={ringId:'ring',choices:[null,1,true,'card']};
  const effect=registerPersistent(room,{
    kind:'gold',owner:0,sourceId:'spell',anchorId:'dragon',counters:5,
    data,expires:'anchor-destroyed'
  });
  data.ringId='other';
  assert.equal(effect.data.ringId,'ring');
  const restored=JSON.parse(JSON.stringify(room));
  assert.deepEqual(restored,room);
  const duplicate=registerPersistent(restored,{kind:'gold',owner:0,sourceId:'spell'});
  assert.equal(duplicate,restored.persistentEffects[0]);
  assert.equal(restored.persistentSequence,1);
  assert.equal(duplicate.counters,5);
  assert.equal(tickPersistent(restored,{type:'destroyed',unitId:'dragon'}),1);
});
