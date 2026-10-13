// Card automation coverage is deliberately conservative: partial is never complete.
import {hasAutoSpell} from './automated-effects.mjs';
import {SUPPORTED_EXTRA_IDS} from './extra-summons.mjs';
import {FIELD_ABILITY_IDS} from './field-abilities.mjs';

export const summonAutomations = new Set([
 'COC-05-010','COC-07-002','COC-08-001','COC-08-008','COC-10-003',
 'COC-10-004','COC-12-010','COC-14-005','COC-19-006','COC-27-003',
 'COC-27-004','COC-31-001','COC-31-002','COC-31-003',
 'COC-12-003','COC-12-004','COC-27-001','COC-23-003','COC-24-002',
 'COC-26-002','COC-23-004','COC-20-009','COC-10-001','COC-10-007'
]);
export const passiveAutomations = new Set([
 'COC-01-001','COC-09-001','COC-11-001','COC-07-001','COC-07-007',
 'COC-09-002','COC-09-003','COC-10-011','COC-05-001','COC-12-006',
 'COC-12-008','COC-10-006','COC-21-007','COC-08-002','COC-09-004',
 'COC-12-007','COC-21-008','COC-21-010'
]);
export const combatAutomations = new Set([
 'COC-12-011','COC-12-008','COC-26-011','COC-32-001',
 'COC-32-003','COC-32-011','COC-32-013'
]);
export const integrationAutomations = new Set([
 'COC-05-009','COC-17-001','COC-19-006','COC-30-010'
]);
export const dragonAutomations = new Set(['COC-11-007','COC-11-008','COC-11-009']);
export const cartoonTriggerAutomations = new Set(['COC-05-008']);
export function automationStatus(card){
 if(card.type==='주문'&&hasAutoSpell(card.id))return 'partial';
 if(summonAutomations.has(card.id)||passiveAutomations.has(card.id)||integrationAutomations.has(card.id)||combatAutomations.has(card.id)||FIELD_ABILITY_IDS.includes(card.id)||SUPPORTED_EXTRA_IDS.includes(card.id)||dragonAutomations.has(card.id)||cartoonTriggerAutomations.has(card.id))return 'partial';
 if(!card.effects?.length&&!card.conditions?.length)return 'basic';
 return 'manual';
}
