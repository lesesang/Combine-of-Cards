import fs from 'node:fs';
import zlib from 'node:zlib';
const b64=fs.readFileSync('public/data/catalog.json.gz.b64','utf8').trim();
const data=JSON.parse(zlib.gunzipSync(Buffer.from(b64,'base64')));
if(data.version!=='1.3'||data.decks.length!==24||data.cards.length!==254)throw Error('Expected 24 decks and 254 cards');
const excluded=new Set(data.excludedDeckIds);
for(const d of data.decks){if(excluded.has(d.id))throw Error('Removed deck included: '+d.name);if(d.main.length<7||d.main.length>10||d.extra.length>7)throw Error('Deck size invalid: '+d.name);if(new Set(d.main).size!==d.main.length)throw Error('Duplicate main cards: '+d.name)}
console.log('v1.3 catalog verified: 24 decks, 254 card entries');
