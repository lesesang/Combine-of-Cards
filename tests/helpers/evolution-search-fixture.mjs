import {batchFixture} from './spell-batch-fixture.mjs';
import {evolutionRules,natureEvolutionCosts} from '../../src/evolution.mjs';
export function evolutionSearchFixture(I,cardId,caster=0){
 const f=batchFixture(I,cardId,caster),rule=evolutionRules[cardId];
 if(rule){
  f.source=f.place(caster,rule.source||'COC-03-001','integration');
  f.oldCard=f.r.units[f.source].cardId;f.r.units[f.source].atk+=50;
  f.r.units[f.source].attackCountTurn=f.r.turnNumber;f.r.units[f.source].attackCount=1;
  if(cardId==='COC-20-007')f.r.players[caster].hp=500;
  if(cardId==='COC-30-009')f.body.costDeckIds=natureEvolutionCosts(f.r,caster,f.spell,I.cards).slice(0,2);
 }
 if(cardId==='COC-20-003')f.r.players[caster].hp=600;
 return f;
}
