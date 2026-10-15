import {FIELD_RESPONSE_IDS,prepareFieldEffect,payFieldEffect,resolveFieldEffect} from './field-ability-effects.mjs';
// All currently registered activated field effects share audited legality/cost
// and resolution helpers. The HTTP server uses queueFieldAbility for responses.
export const FIELD_ABILITY_IDS=FIELD_RESPONSE_IDS;
export function applyFieldAbility(r,who,body,H){
 const plan=prepareFieldEffect(r,who,body,H);
 payFieldEffect(r,who,plan,H);resolveFieldEffect(r,who,plan,H);
 return {supported:true,cardId:plan.cardId};
}
