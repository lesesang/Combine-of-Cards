import assert from 'node:assert/strict';
import {EXTRA_RECIPES} from '../../src/extra-summons.mjs';
export function extraCounterFixture(I,cardId,caster=0){
 const deck=cardId.slice(4,6),other=1-caster;
 const r={code:'EXTR01',status:'active',version:1,turn:caster,turnNumber:5,phase:'MAIN',mode:'pvp',players:[],units:{},logs:[],effects:[]};
 I.createPlayer(r,caster===0?deck:'14','A','a'.repeat(64));I.createPlayer(r,caster===1?deck:'14','B','b'.repeat(64));r.players.forEach(p=>p.turnsTaken=3);
 const place=(who,cid,to)=>{const p=r.players[who],id=[...p.deck,...p.extra].find(id=>r.units[id].cardId===cid);assert.ok(id,cid);if(to)I.move(r,id,to,who);return id;};
 const counter=place(other,'COC-14-001','integration'),extra=place(caster,cardId),recipe=EXTRA_RECIPES[cardId];
 const p=r.players[caster];
 const matches=(uid,part)=>{const c=I.cards.get(r.units[uid].cardId);return c.type.includes('몬스터')&&(part.kind==='id'?c.id===part.value:part.kind==='prefix'?c.name.startsWith(part.value):part.kind==='attribute'?c.attribute===part.value:part.value.some(n=>c.name.includes(n)));};
 const choose=(index,used)=>{if(index===recipe.parts.length)return used;for(const uid of p.deck)if(!used.includes(uid)&&matches(uid,recipe.parts[index])){const found=choose(index+1,[...used,uid]);if(found)return found;}};
 const materials=choose(0,[]);assert.ok(materials,cardId);
 const fieldOnly=['wakeup','infinity'].includes(recipe.method);materials.forEach(uid=>I.move(r,uid,fieldOnly?'field':'hand',caster));
 if(recipe.method==='hero')place(caster,'COC-12-009','integration');
 const spellCard=recipe.method==='wakeup'?'COC-32-009':recipe.method==='fusion'?{'22':'COC-22-008','26':'COC-26-007','27':'COC-27-009'}[deck]:null;
 const spell=spellCard?place(caster,spellCard,'hand'):null;
 return {r,caster,other,counter,extra,materials,spell,recipe,body:{extraUnitId:extra,materials,...(spell?{spellUnitId:spell}:{})}};
}
