import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {automationStatus} from '../src/automation-status.mjs';
import {spellHandlerIds} from '../src/automated-effects.mjs';

const root=new URL('../',import.meta.url);
const raw=fs.readFileSync(new URL('public/data/catalog.json.gz.b64',root),'utf8').trim();
const catalog=JSON.parse(zlib.gunzipSync(Buffer.from(raw,'base64')).toString('utf8'));
const report=fs.readFileSync(new URL('docs/AUTOMATION_COVERAGE.md',root),'utf8');
function actual(){
 const totals={manual:0,partial:0,basic:0};
 for(const card of catalog.cards){const status=automationStatus(card);assert.ok(status in totals,card.id+': unrecognized status');totals[status]++;}
 return totals;
}
test('automation coverage documentation reflects actual card registry',()=>{
 const totals=actual();
 const handlerCount=Number(report.match(/주문 핸들러 (\d+)개/)?.[1]);
 assert.equal(handlerCount,spellHandlerIds.length,'documented spell-handler count is stale');
 const match=report.match(/부분 지원 (\d+)개, 일반 카드만 (\d+)개, 수동\/미지원 (\d+)개/);
 assert.ok(match,'coverage summary missing');
 assert.deepEqual([Number(match[1]),Number(match[2]),Number(match[3])],
  [totals.partial,totals.basic,totals.manual],'documented statuses do not match current implementation');
 assert.equal(catalog.cards.length,254);
 assert.equal(catalog.decks.length,24);
 assert.equal(totals.manual+totals.partial+totals.basic,254);
});
test('coverage registry never advertises completed automation for a partially supported card',()=>{
 assert.equal(new Set(spellHandlerIds).size,spellHandlerIds.length);
 for(const id of spellHandlerIds)assert.ok(catalog.cards.some(c=>c.id===id),'unknown card registered: '+id);
 assert.ok(catalog.cards.every(c=>automationStatus(c)!=='complete'),'full certification requires card-specific proof');
});

test('card-level audit rows agree with runtime support for each card',()=>{
 const rows=report.split('\n').filter(line=>/^\| COC-\d{2}-\d{3} \|/.test(line));
 const byId=new Map(rows.map(line=>{
  const parts=line.split('|').map(x=>x.trim());
  return [parts[1],parts[3]];
 }));
 assert.equal(rows.length,253,'only the one basic card is omitted from the detailed support table');
 for(const card of catalog.cards){
  const expected=automationStatus(card);
  const display=byId.get(card.id);
  if(expected==='basic'){assert.equal(display,undefined);continue;}
  assert.equal(display,expected==='partial'?'부분 지원':'미지원',card.id+': outdated support label');
 }
});
