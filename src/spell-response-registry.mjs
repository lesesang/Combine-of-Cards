import {evolutionSpellIds} from './evolution.mjs';
import {choiceResponseSpellIds} from './spell-choice-batch.mjs';
// Audited declarations supported by the persisted opponent-pass spell window.
// This is not a list of fully automated cards or reactive counterspells.
import {batchResponseSpellIds,balanceResponseSpellIds} from './spell-response-targets.mjs';
export const responseSpellIds = Object.freeze([
  'COC-09-005','COC-09-006',
  'COC-08-009','COC-20-010','COC-23-010','COC-24-007',
  'COC-07-003','COC-13-007','COC-17-003',
  'COC-07-010','COC-08-007','COC-10-009','COC-19-004',
  'COC-20-005','COC-30-005',
  'COC-21-002', // Sword requires declaration-time validation of its chosen bearer.
  'COC-30-007','COC-07-004','COC-07-011','COC-17-004','COC-31-005',
  'COC-31-009', // BLOCK pays its selected hand discard in activation preflight.
  ...balanceResponseSpellIds,...batchResponseSpellIds,...choiceResponseSpellIds,
  'COC-20-003','COC-24-008','COC-26-008',...evolutionSpellIds
]);
