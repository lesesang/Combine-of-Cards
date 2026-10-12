import fs from 'node:fs';
import path from 'node:path';
const origin = process.argv[2] ?? 'public/data/source-cards.v1.3.json';
const src = JSON.parse(fs.readFileSync(origin, 'utf8'));
if(src.version !== '1.3' || src.decks.length !== 24) throw new Error('Expected canonical v1.3 24-deck input');
const catalog = {
  version: src.version,
  rulesVersion:'1.3',
  excludedDeckIds:src.excluded_decks.map(d=>d.deck_id),
  decks:src.decks.map(d=>({
    id:d.deck_id, name:d.deck_name, attribute:d.default_attribute,
    main:d.cards.filter(c=>c.zone==='main').map(c=>c.card_id),
    extra:d.cards.filter(c=>c.zone==='extra').map(c=>c.card_id),
    created:d.cards.filter(c=>c.zone==='created').map(c=>c.card_id)
  })),
  cards:src.decks.flatMap(d=>d.cards.map(c=>({
    id:c.card_id, deckId:d.deck_id, name:c.name, type:c.category,
    zone:c.zone, attribute:c.attribute, atk:c.attack, hp:c.hp,
    conditions:c.conditions.map(t=>t.text), effects:c.effects.map(t=>t.text),
    notes:[...(c.rulings||[]),...(c.notes||[])]
  })))
};
for(const deck of catalog.decks){
 if(deck.main.length<7 || deck.main.length>10 || deck.extra.length>7)throw new Error('Illegal deck '+deck.name);
 if(new Set(deck.main).size!==deck.main.length)throw new Error('Repeated card '+deck.name);
}
if(catalog.cards.length!==254)throw new Error('Incorrect cards '+catalog.cards.length);
fs.mkdirSync('public/data',{recursive:true});
fs.writeFileSync('public/data/catalog.json', JSON.stringify(catalog));
console.log(`${catalog.decks.length} decks, ${catalog.cards.length} cards, ${fs.statSync('public/data/catalog.json').size} bytes`);