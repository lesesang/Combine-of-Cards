import test from 'node:test';
import {gameTestInternals as I} from '../server.mjs';
test('temporary inspect canonical magic sword text',()=>{
 const card=I.cards.get('COC-21-002');
 console.log('SWORD_CANONICAL_DATA '+JSON.stringify(card));
});
