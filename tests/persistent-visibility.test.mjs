import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coc-persistent-view-'));
process.env.DATA_DIR=tmp;
const {gameTestInternals:I}=await import('../server.mjs');
function room(){
 const r={code:'VIS123',status:'active',turn:0,turnNumber:1,phase:'MAIN',version:1,
  players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,'11','Dragon','alice');
 I.createPlayer(r,'14','Enemy','bob');
 return r;
}
test('both players see the persistent treasure count but never private source identifiers',()=>{
 const r=room();
 I.H.summonToken(r,1,'스톰 토큰',0,50);
 const self=I.publicState(r,0),other=I.publicState(r,1);
 assert.deepEqual(self.persistentEffects,other.persistentEffects);
 assert.deepEqual(self.persistentEffects,[{kind:'dragon-gold',owner:0,counters:1}]);
 assert.ok(!JSON.stringify(self.persistentEffects).includes('ringId'));
 assert.equal(self.players[1].hand,null,'opposing hand is still hidden');
 assert.equal(other.players[0].hand,null,'own hand secrecy is symmetric');
});
test('Ring player attack bonus is visible while opponent hand remains private',()=>{
 const r=room();
 I.H.summonToken(r,1,'스톰 토큰',0,50);
 const source=r.players[0].field.find(id=>r.units[id]?.cardId==='COC-11-007');
 I.H.destroy(r,source);
 const state=I.publicState(r,0);
 assert.equal(state.players[0].playerAtkBonus,10);
 assert.deepEqual(state.persistentEffects,[]);
 assert.equal(state.players[1].hand,null);
});
test('browser renders server-supplied persistent effects using readable labels',()=>{
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(source,/function persistentStatus\(g,playerIndex\)/);
 assert.match(source,/라인의 황금 · 보물/);
 assert.match(source,/플레이어 공격력/);
 assert.match(source,/persistentStatus\(g,g\.you\)/);
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
