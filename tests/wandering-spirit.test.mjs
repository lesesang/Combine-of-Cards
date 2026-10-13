import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-wandering-spirit-'));
process.env.DATA_DIR=dir;
const {gameTestInternals:I}=await import('../server.mjs');
function game(){
 const r={code:'SPIRIT',status:'active',turn:0,turnNumber:1,phase:'MAIN',version:1,
  players:[],units:{},logs:[],effects:[],pendingAttack:null,pendingManual:null};
 I.createPlayer(r,'03','A','token-a');I.createPlayer(r,'03','B','token-b');
 r.players[0].turnsTaken=1;
 const place=(who,cardId,to)=>{
  const id=r.players[who].deck.find(id=>r.units[id].cardId===cardId);
  assert.ok(id,'missing card '+cardId);
  I.move(r,id,to,who);return id;
 };
 return {r,place};
}
test('wandering spirit has the confirmed 0 ATK / 1 HP without a currently integrated Beria',()=>{
 const {r,place}=game();
 const spirit=place(0,'COC-03-005','hand');
 I.apply(r,0,'play',{unitId:spirit});
 assert.ok(r.players[0].field.includes(spirit));
 assert.equal(r.units[spirit].atk,0);
 assert.equal(r.units[spirit].hp,1);
});
test('wandering spirit copies Beria current ATK into both ATK and HP when summoned',()=>{
 const {r,place}=game();
 const beria=place(0,'COC-03-001','integration');
 r.units[beria].atk=237;
 const spirit=place(0,'COC-03-005','hand');
 I.apply(r,0,'play',{unitId:spirit});
 assert.equal(r.units[spirit].atk,237);
 assert.equal(r.units[spirit].hp,237);
 assert.equal(r.units[beria].atk,237);
 const restored=JSON.parse(JSON.stringify(r));
 assert.equal(restored.units[spirit].hp,237);
});
test('zero ATK Beria gives the spirit zero HP and the normal state-based grave transition',()=>{
 const {r,place}=game();
 const beria=place(0,'COC-03-001','integration');
 r.units[beria].atk=0;
 const spirit=place(0,'COC-03-005','hand');
 I.apply(r,0,'play',{unitId:spirit});
 assert.ok(r.players[0].grave.includes(spirit));
 assert.ok(!r.players[0].field.includes(spirit));
});
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
