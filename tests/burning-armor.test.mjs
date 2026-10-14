import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-burning-armor-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
function make(){
 const r={code:'ARM123',status:'active',turn:0,turnNumber:1,phase:'MAIN',version:1,players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,'20','A','a');I.createPlayer(r,'03','B','b');r.players[0].turnsTaken=1;
 const place=(who,cardId,to)=>{
  const id=r.players[who].deck.find(x=>r.units[x].cardId===cardId);
  assert.ok(id,'missing '+cardId);I.move(r,id,to,who);return id;
 };
 return {r,place};
}
test('Burning Armor rejects invalid monster targets without losing the spell',()=>{
 const {r,place}=make();
 const burn=place(0,'COC-20-001','field'),other=place(1,'COC-03-002','field'),spell=place(0,'COC-20-011','hand');
 assert.throws(()=>I.apply(r,0,'play',{unitId:spell,target:{type:'unit',id:other}}),/버닝데몬즈/);
 assert.ok(r.players[0].hand.includes(spell));
 assert.ok(r.players[0].field.includes(burn));
});
test('Burning Armor blocks direct effect destruction, but 0 HP still destroys monster',()=>{
 const {r,place}=make();
 const target=place(0,'COC-20-001','field'),spell=place(0,'COC-20-011','hand');
 I.apply(r,0,'play',{unitId:spell,target:{type:'unit',id:target}});
 I.apply(r,1,'spellResponse',{choice:'pass'});
 assert.equal(r.units[target].effectDestructionImmune,true);
 I.H.destroy(r,target);
 assert.ok(r.players[0].field.includes(target),'direct effect destruction is prevented');
 assert.ok(!r.players[0].grave.includes(target));
 I.H.hurt(r,target,r.units[target].hp);
 assert.ok(r.players[0].grave.includes(target),'lethal damage still destroys');
 assert.equal(r.units[target].effectDestructionImmune,undefined);
});
test('simultaneous batch excludes protected monsters from pre-destruction HP maximum',()=>{
 const {r,place}=make();
 const protectedMonster=place(0,'COC-20-001','field'),spell=place(0,'COC-20-011','hand');
 const victim=place(1,'COC-03-002','field');
 I.apply(r,0,'play',{unitId:spell,target:{type:'unit',id:protectedMonster}});
 I.apply(r,1,'spellResponse',{choice:'pass'});
 r.units[protectedMonster].hp=500;r.units[victim].hp=80;
 r.players[0].hp=400;r.effects.push({type:'firstDestroyHeal',player:0,turn:1});
 I.H.destroyBatch(r,[protectedMonster,victim]);
 assert.ok(r.players[0].field.includes(protectedMonster));
 assert.ok(r.players[1].grave.includes(victim));
 assert.equal(r.players[0].hp,480,'highest actually destroyed monster was 80 HP');
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
