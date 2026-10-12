import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gameTestInternals as x} from '../server.mjs';
const make=(a='08',b='03')=>{
 const r={status:'active',turn:0,turnNumber:1,phase:'MAIN',players:[],units:{},logs:[],effects:[]};
 x.createPlayer(r,a,'첫째','a');x.createPlayer(r,b,'둘째','b');
 return r;
};
const find=(r,i,cardId)=>r.players[i].deck.find(id=>r.units[id].cardId===cardId);
const place=(r,i,cardId)=>{const id=find(r,i,cardId);assert.ok(id,cardId);x.move(r,id,'field',i);return id};
test('summoning a predator apostle mills two of the opposing deck without triggering reload',()=>{
 const r=make('07','03'),id=place(r,0,'COC-07-002'),before=r.players[1].deck.length;
 x.runSummonEffects(r,0,id);assert.equal(r.players[1].grave.length,2);assert.equal(r.players[1].deck.length,before-2);assert.equal(r.players[1].reloads,0);
});
test('Kasa moves a selected field card to original owner hand',()=>{
 const r=make('08','03'),enemy=place(r,1,'COC-03-005'),caster=place(r,0,'COC-08-001');
 x.runSummonEffects(r,0,caster,{target:{type:'unit',id:enemy}});
 assert.equal(r.players[1].hand.includes(enemy),true);assert.equal(r.players[1].field.includes(enemy),false);
});
test('tsukumogami Neko steals control without losing original ownership',()=>{
 const r=make('08','03'),enemy=place(r,1,'COC-03-005'),caster=place(r,0,'COC-08-008');
 x.runSummonEffects(r,0,caster,{target:{type:'unit',id:enemy}});
 assert.equal(r.players[0].field.includes(enemy),true);assert.equal(r.units[enemy].owner,1);
 x.move(r,enemy,'grave',r.units[enemy].owner);assert.equal(r.players[1].grave.includes(enemy),true);
});
test('resurrection after one destruction happens exactly once',()=>{
 const r=make('10','03'),id=x.instantiate(r,'COC-10-011',0);x.move(r,id,'field',0);
 x.H.destroy(r,id);assert.ok(r.players[0].field.includes(id));assert.equal(r.units[id].revivedOnce,true);
 x.H.destroy(r,id);assert.ok(r.players[0].grave.includes(id));assert.ok(!r.players[0].field.includes(id));
});
test('shield converts damage instances into one point',()=>{
 const r=make('09','03'),id=place(r,0,'COC-09-002'),prior=r.units[id].hp;
 x.damageUnit(r,id,-80);assert.equal(r.units[id].hp,prior-1);
});
test('two-attack weapon can attack twice but not a third time',()=>{
 const r=make('09','03'),id=place(r,0,'COC-09-003'),u=r.units[id];
 assert.ok(x.attackAvailable(u,1));u.attackCountTurn=1;u.attackCount=1;assert.ok(x.attackAvailable(u,1));u.attackCount=2;assert.equal(x.attackAvailable(u,1),false);
});
test('F=HERO universe returns every other field card while keeping itself',()=>{
 const r=make('12','03'),own=place(r,0,'COC-12-001'),foe=place(r,1,'COC-03-005'),id=place(r,0,'COC-12-010');
 x.runSummonEffects(r,0,id);assert.ok(r.players[0].field.includes(id));assert.ok(r.players[0].deck.includes(own));assert.ok(r.players[1].deck.includes(foe));
});
test('terracotta emperor resets and resummons field monsters, forbidding same-turn attacks',()=>{
 const r=make('19','03'),foe=place(r,1,'COC-03-005'),id=find(r,0,'COC-19-006');
 x.move(r,id,'integration',0);x.runIntegrationOnEnter(r,0,id);
 assert.ok(r.players[1].field.includes(foe));assert.equal(r.units[foe].cannotAttackUntil,r.turnNumber);
});
test('Pyramid avatar raises current ally stats when integrated',()=>{
 const r=make('17','03'),id=place(r,0,'COC-17-007'),pId=find(r,0,'COC-17-001');const atk=r.units[id].atk,hp=r.units[id].hp;
 x.move(r,pId,'integration',0);x.runIntegrationOnEnter(r,0,pId);assert.equal(r.units[id].atk,atk+50);assert.equal(r.units[id].hp,hp+50);
});
