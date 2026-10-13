/**
 * R03/R27: enumerate every published card's conditions and effects without
 * claiming that a card-level "partial" mark certifies every individual effect.
 * The reviewed register remains curated; missing evidence stays unverified.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function compileEffectInventory(catalog, reviewed=[]) {
 if(!catalog||!Array.isArray(catalog.cards)||!Array.isArray(reviewed))throw new TypeError('catalog and reviewed records required');
 const cards=new Map();
 for(const card of catalog.cards){
  if(typeof card.id!=='string'||cards.has(card.id)||!Array.isArray(card.effects)||!Array.isArray(card.conditions))throw new Error('invalid or duplicate card in inventory: '+card.id);
  cards.set(card.id,card);
 }
 const proof=new Map();
 for(const entry of reviewed){
  const card=cards.get(entry.cardId),key=entry.cardId+':'+entry.effectNumber;
  if(!card||!Number.isInteger(entry.effectNumber)||entry.effectNumber<1||
     card.effects[entry.effectNumber-1]!==entry.sourceText||proof.has(key)||
     !['partial','provisional'].includes(entry.status)||!entry.tests?.length){
   throw new Error('unverified or outdated effect proof: '+key);
  }
  proof.set(key,entry);
 }
 const records=[];
 for(const card of catalog.cards){
  for(const [i,text] of card.conditions.entries())records.push({
   cardId:card.id,kind:'condition',number:i+1,text,status:'unverified'
  });
  for(const [i,text] of card.effects.entries()){
   const found=proof.get(card.id+':'+(i+1));
   records.push({cardId:card.id,kind:'effect',number:i+1,text,
    status:found?.status||'unverified',
    proofRef:found?'docs/effect-coverage.json#'+card.id+':'+(i+1):null});
  }
 }
 const counts={cards:cards.size,conditions:records.filter(x=>x.kind==='condition').length,
  effects:records.filter(x=>x.kind==='effect').length,reviewedEffects:proof.size,
  unverifiedEffects:records.filter(x=>x.kind==='effect'&&x.status==='unverified').length};
 if(counts.reviewedEffects+counts.unverifiedEffects!==counts.effects)throw new Error('effect inventory not exhaustive');
 return {version:catalog.version||'1.3',counts,records};
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const packed=fs.readFileSync(path.join(root,'public/data/catalog.json.gz.b64'),'utf8').trim();
 const catalog=JSON.parse(zlib.gunzipSync(Buffer.from(packed,'base64')).toString('utf8'));
 const reviewed=JSON.parse(fs.readFileSync(path.join(root,'docs/effect-coverage.json'),'utf8'));
 const inventory=compileEffectInventory(catalog,reviewed);
 if(process.argv.includes('--check')){
  if(catalog.decks.length!==24||inventory.counts.cards!==254||inventory.counts.reviewedEffects!==reviewed.length)throw new Error('incomplete official card/effect inventory');
  console.log('Effect inventory verified:',JSON.stringify(inventory.counts));
 }else if(process.argv.includes('--json'))console.log(JSON.stringify(inventory,null,2));
 else console.log(JSON.stringify(inventory.counts,null,2));
}
