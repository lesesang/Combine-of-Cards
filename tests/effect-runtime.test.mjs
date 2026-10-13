import test from 'node:test';
import assert from 'node:assert/strict';
import {
 declareEffect, declareAutomaticGroup, beginAutomaticTriggerOrder, chooseAutomaticTriggerOrder, resolveEffectStack,
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

test('R02: choice is required only for competing own triggers with equal priority',()=>{
 const r=room();
 const e=[{key:'a',owner:0,effectId:'A',sourceId:'a',priority:0},
  {key:'b',owner:0,effectId:'B',sourceId:'a',priority:0},
  {key:'c',owner:1,effectId:'C',sourceId:'b',priority:0}];
 assert.deepEqual(beginAutomaticTriggerOrder(r,e,0),{pending:true,awaiting:0});
 assert.equal(r.effectStack.length,0);
 const serialized=JSON.parse(JSON.stringify(r));
 assert.equal(serialized.pendingTriggerOrder.effects.length,3);
 assert.throws(()=>chooseAutomaticTriggerOrder(serialized,1,['c']),/controller/);
 assert.throws(()=>chooseAutomaticTriggerOrder(serialized,0,['a','a']),/exactly once/);
 assert.equal(serialized.effectStack.length,0);
 assert.deepEqual(chooseAutomaticTriggerOrder(serialized,0,['b','a']),{pending:false,awaiting:null});
 assert.equal(serialized.pendingTriggerOrder,null);
 assert.deepEqual(serialized.effectStack.map(e=>e.effectId),['B','A','C']);
 const ran=[];resolveEffectStack(serialized,{getZone:present,execute:e=>ran.push(e.effectId)});
 assert.deepEqual(ran,['C','A','B']);
});
test('R02: active owner selects first, non-active owner second; priority still wins',()=>{
 const r=room();
 const fx=[
  {key:'na',owner:1,effectId:'NA',priority:0},
  {key:'nb',owner:1,effectId:'NB',priority:0},
  {key:'aa',owner:0,effectId:'AA',priority:0},
  {key:'ab',owner:0,effectId:'AB',priority:0},
  {key:'forced',owner:0,effectId:'forced',priority:10}
 ];
 assert.equal(beginAutomaticTriggerOrder(r,fx,0).awaiting,0);
 assert.equal(chooseAutomaticTriggerOrder(r,0,['ab','forced','aa']).awaiting,1);
 assert.equal(chooseAutomaticTriggerOrder(r,1,['nb','na']).pending,false);
 const ran=[];resolveEffectStack(r,{getZone:()=>null,execute:e=>ran.push(e.effectId)});
 assert.deepEqual(ran,['forced','NA','NB','AA','AB']);
});
test('R02: unambiguous group resolves automatically and pending choices are exclusive',()=>{
 const r=room();
 const one=[{key:'a',owner:0,effectId:'A'},{key:'b',owner:1,effectId:'B'}];
 assert.equal(beginAutomaticTriggerOrder(r,one,0).pending,false);
 assert.deepEqual(r.effectStack.map(x=>x.effectId),['A','B']);
 assert.throws(()=>beginAutomaticTriggerOrder(r,one,0),/cannot open/);
 resolveEffectStack(r,{getZone:()=>null,execute:()=>{}});
 const conflict=[{key:'a',owner:0,effectId:'A'},{key:'b',owner:0,effectId:'B'}];
 beginAutomaticTriggerOrder(r,conflict,0);
 assert.throws(()=>beginAutomaticTriggerOrder(r,conflict,0),/cannot open/);
 assert.throws(()=>chooseAutomaticTriggerOrder(r,0,['a','other']),/exactly once/);
 assert.equal(r.pendingTriggerOrder.awaiting[0],0);
});

test('R26: detects an exact self-generating effect cycle without declaring a loss',()=>{
 const r=room();r.turnNumber=6;
 declareEffect(r,{effectId:'loop',sourceId:'a',owner:0,payload:{mode:'again'}});
 let actions=0;
 assert.throws(()=>resolveEffectStack(r,{
  getZone:present,
  fingerprint:state=>String(state.turnNumber),
  execute:effect=>{actions++;declareEffect(r,{effectId:effect.effectId,sourceId:'a',owner:0,payload:{mode:'again'}})}
 }),e=>e.code==='EFFECT_CYCLE'&&/no game-state progress/.test(e.message));
 assert.equal(actions,1);
 assert.equal(r.effectStack.length,1,'unresolved effect remains to diagnose, not silently discarded');
 assert.equal(r.winner,undefined,'the safety guard never fabricates a victor');
});
test('R26: legal finite repetitions that change HP/counters are not mistaken for cycles',()=>{
 const r=room();r.players=[{hp:1000}];r.progress=0;
 declareEffect(r,{effectId:'gain',owner:0,payload:{points:1}});
 const executed=[];
 const result=resolveEffectStack(r,{
  getZone:()=>null,
  fingerprint:state=>JSON.stringify({hp:state.players[0].hp,progress:state.progress}),
  execute:effect=>{
   r.progress++;r.players[0].hp+=effect.payload.points;executed.push(effect.effectId);
   if(r.progress<180)declareEffect(r,{effectId:'gain',owner:0,payload:{points:1}});
  }
 });
 assert.equal(result.length,180);
 assert.equal(executed.length,180);
 assert.equal(r.players[0].hp,1180);
 assert.equal(r.effectStack.length,0);
});
test('R26: hard safety cap preserves unresolved effects and does not assign a loss',()=>{
 const r=room();
 declareEffect(r,{effectId:'self',owner:0});
 assert.throws(()=>resolveEffectStack(r,{
  getZone:()=>null,
  execute:()=>declareEffect(r,{effectId:'self',owner:0})
 }),e=>e.code==='EFFECT_SAFETY_LIMIT');
 assert.equal(r.effectStack.length,1);
 assert.equal(r.winner,undefined);
});
test('R26: invalid cycle fingerprint is rejected instead of weakening protection',()=>{
 const r=room();declareEffect(r,{effectId:'x',owner:0});
 assert.throws(()=>resolveEffectStack(r,{getZone:()=>null,execute:()=>{},fingerprint:()=>42}),/bounded string/);
 assert.equal(r.effectStack.length,1);
});

test('R02: a failed final declaration preserves the awaiting choice',()=>{
 const r=room();
 const fx=[{key:'a',owner:0,effectId:'A'},{key:'b',owner:0,effectId:'B'}];
 beginAutomaticTriggerOrder(r,fx,0);
 const before=structuredClone(r.pendingTriggerOrder);
 r.effectStack=Array.from({length:256},(_,i)=>({sequence:i+1,effectId:'occupied'}));
 assert.throws(()=>chooseAutomaticTriggerOrder(r,0,['b','a']),/safe limit/);
 assert.deepEqual(r.pendingTriggerOrder,before,'the player may retry after stack capacity is available');
 r.effectStack=[];
 assert.equal(chooseAutomaticTriggerOrder(r,0,['b','a']).pending,false);
 assert.deepEqual(r.effectStack.map(e=>e.effectId),['B','A']);
});

test('R01/R02: batch declaration cannot partially spend stack capacity',()=>{
 const r=room();
 r.effectStack=Array.from({length:255},(_,i)=>({sequence:i+1,effectId:'existing-'+i}));
 r.effectSequence=255;
 const before=structuredClone(r);
 const group=[{key:'first',owner:0,effectId:'A'},{key:'second',owner:1,effectId:'B'}];
 assert.throws(()=>declareAutomaticGroup(r,group,0),/safe limit/);
 assert.deepEqual(r,before,'neither first trigger nor sequence may commit');
 r.effectStack.pop();
 assert.equal(declareAutomaticGroup(r,group,0).length,2);
 assert.equal(r.effectStack.length,256);
 assert.equal(r.effectSequence,257);
});

test('R01/R02: invalid later trigger cannot leave earlier trigger declared',()=>{
 const r=room();
 declareEffect(r,{effectId:'existing',owner:0});
 const before=structuredClone(r);
 assert.throws(()=>declareAutomaticGroup(r,[
  {key:'a',owner:0,effectId:'first',priority:0},
  {key:'b',owner:1,effectId:'second',priority:0,exception:'unknown'}
 ],0),/unknown resolution exception/);
 assert.deepEqual(r,before);
 assert.equal(declareAutomaticGroup(r,[
  {key:'a',owner:0,effectId:'first'},
  {key:'b',owner:1,effectId:'second',exception:'independent'}
 ],0).length,2);
});

test('R02: final trigger choice remains pending after partial-capacity failure',()=>{
 const r=room();
 beginAutomaticTriggerOrder(r,[
  {key:'a',owner:0,effectId:'A'},
  {key:'b',owner:0,effectId:'B'}
 ],0);
 r.effectStack=Array.from({length:255},(_,i)=>({sequence:i+1,effectId:'prior-'+i}));
 const before=structuredClone(r);
 assert.throws(()=>chooseAutomaticTriggerOrder(r,0,['b','a']),/safe limit/);
 assert.deepEqual(r,before);
 r.effectStack.pop();
 const result=chooseAutomaticTriggerOrder(r,0,['b','a']);
 assert.equal(result.pending,false);
 assert.equal(r.effectStack.length,256);
 assert.deepEqual(r.effectStack.slice(-2).map(e=>e.effectId),['B','A']);
});

test('R26: failed individual declaration does not consume sequence or create stack',()=>{
 const r=room();r.effectSequence=17;delete r.effectStack;
 const before=structuredClone(r);
 assert.throws(()=>declareEffect(r,{owner:0,effectId:'bad-payload',
  payload:{notSerializable:()=>1}}));
 assert.deepEqual(r,before,'structured-clone rejection must not mutate game state');
 const entry=declareEffect(r,{owner:0,effectId:'after'});
 assert.equal(entry.sequence,18);
 assert.equal(r.effectSequence,18);
 assert.equal(r.effectStack.length,1);
});
test('R26: sequence overflow rejects without consuming the current maximum',()=>{
 const r=room();r.effectSequence=Number.MAX_SAFE_INTEGER;
 const before=structuredClone(r);
 assert.throws(()=>declareEffect(r,{owner:0,effectId:'overflow'}),/sequence overflow/);
 assert.deepEqual(r,before);
});


test('R01: failed effect execution restores room and retains the pending effect',()=>{
 const r=room();
 r.players=[{hp:1000,grave:[]}];
 declareEffect(r,{effectId:'cost-and-roll',owner:0,sourceId:'a'});
 const before=structuredClone(r);
 assert.throws(()=>resolveEffectStack(r,{
  getZone:()=>({zone:'field',player:0}),
  execute:()=>{
   r.players[0].hp-=30;
   r.players[0].grave.push('moved-card');
   declareEffect(r,{effectId:'nested',owner:0});
   throw new Error('delayed effect failure');
  }
 }),/delayed effect failure/);
 assert.deepEqual(r,before);
 const output=resolveEffectStack(r,{
  getZone:()=>({zone:'field',player:0}),
  execute:()=>{r.players[0].hp-=30;}
 });
 assert.deepEqual(output.map(x=>x.status),['resolved']);
 assert.equal(r.players[0].hp,970);
 assert.equal(r.effectStack.length,0);
});
test('R01: failing source-zone lookup does not consume the effect',()=>{
 const r=room();
 declareEffect(r,{effectId:'zone-check',owner:0,sourceId:'a'});
 const before=structuredClone(r);
 assert.throws(()=>resolveEffectStack(r,{
  getZone:()=>{r.someTransientValue=123;throw new Error('location unavailable');},
  execute:()=>{}
 }),/location unavailable/);
 assert.deepEqual(r,before);
});
test('R01: failed result callback restores the step and does not report it completed',()=>{
 const r=room();
 declareEffect(r,{effectId:'report',owner:0});
 const before=structuredClone(r);
 assert.throws(()=>resolveEffectStack(r,{
  getZone:()=>null,
  execute:()=>{r.phase='CHANGED';},
  onResult:()=>{throw new Error('result callback failed');}
 }),/result callback failed/);
 assert.deepEqual(r,before);
});
test('R01: a later step fails without rolling back an earlier successful step',()=>{
 const r=room();r.players=[{hp:1000}];
 declareEffect(r,{effectId:'bad',owner:0});
 declareEffect(r,{effectId:'good',owner:0});
 assert.throws(()=>resolveEffectStack(r,{
  getZone:()=>null,
  execute:e=>{
   if(e.effectId==='good')r.players[0].hp+=50;
   else{r.players[0].hp-=400;throw Error('bad follow-up');}
  }
 }),/bad follow-up/);
 assert.equal(r.players[0].hp,1050,'earlier successful resolution remains committed');
 assert.deepEqual(r.effectStack.map(e=>e.effectId),['bad']);
});
