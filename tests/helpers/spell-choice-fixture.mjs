import assert from 'node:assert/strict';
import {batchFixture} from './spell-batch-fixture.mjs';
export function choiceFixture(I,cardId,caster=0){
 const f=batchFixture(I,cardId,caster),{r,other,place}=f;
 f.body.target={type:'unit',id:f.target};
 if(cardId==='COC-03-007')place(other,'COC-14-008','grave');
 if(cardId==='COC-05-006'){
  f.second=place(other,'COC-14-008','field');r.units[f.second].hp=1000;
  f.body.targets=[f.target,f.second];
 }
 if(cardId==='COC-05-007'){f.land=place(caster,'COC-05-002','field');r.units[f.land].hp=1;}
 if(cardId==='COC-14-009')f.body.option=1;
 if(cardId==='COC-23-009'){place(caster,'COC-23-001','integration');f.body.option=1;}
 if(cardId==='COC-27-010'){f.fighter=place(caster,'COC-27-008','field');f.body.target.id=f.fighter;}
 if(cardId==='COC-30-004')r.units[f.target].hp=1;
 if(cardId==='COC-30-011'){r.players[caster].natureSpellTurns=[1,3];f.body.target={type:'player',player:other};}
 f.costTop=r.players[caster].deck[0];
 return f;
}
export function assertChoiceResult(f,cardId){
 const {r,caster,other,target,spell}=f,p=r.players;
 switch(cardId){
 case 'COC-03-007':assert.equal(r.units[target].hp,999);break;
 case 'COC-03-008':assert.equal(r.units[target].hp,1001);break;
 case 'COC-05-002':assert.ok(p[caster].field.includes(spell));assert.equal(r.units[spell].hp,1);assert.equal(p[caster].hp,900);break;
 case 'COC-05-006':assert.equal(r.units[target].hp,999);assert.equal(r.units[f.second].hp,999);break;
 case 'COC-05-007':assert.ok(p[caster].field.includes(target));assert.equal(r.units[target].treatedAsToon,true);break;
 case 'COC-14-002':assert.equal(p[caster].field.filter(Boolean).length,3);assert.ok(p[caster].grave.includes(f.costTop));break;
 case 'COC-14-009':assert.equal(p[other].hp,950);assert.equal(r.units[target].hp,950);break;
 case 'COC-23-009':assert.ok(p[other].grave.includes(target));break;
 case 'COC-27-010':assert.equal(p[caster].hp,800);assert.equal(r.units[f.fighter].superiorClaw,true);break;
 case 'COC-30-004':assert.ok(p[other].grave.includes(target));assert.ok(p[caster].hand.includes(spell));break;
 case 'COC-30-011':assert.equal(p[other].hp,800);break;
 case 'COC-31-007':assert.ok(p[caster].field.includes(target));assert.equal(r.units[target].owner,other);assert.equal(p[caster].hp,800);break;
 default:assert.fail(cardId);
 }
}
