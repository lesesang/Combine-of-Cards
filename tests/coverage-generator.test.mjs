import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('coverage regeneration preserves manual notes and read-only CI check rejects stale or invented evidence',()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'coc-coverage-'));
 try{
  for(const dir of ['src','scripts','docs','public','tests'])fs.cpSync(path.join(root,dir),path.join(temporary,dir),{recursive:true});
  fs.copyFileSync(path.join(root,'server.mjs'),path.join(temporary,'server.mjs'));
  const notes=path.join(temporary,'docs/AUTOMATION_NOTES.md');
  const sentinel=fs.readFileSync(notes,'utf8')+'\n수동 판정 설명 보존 테스트\n';fs.writeFileSync(notes,sentinel);
  const run=(...args)=>spawnSync(process.execPath,['scripts/audit-coverage.mjs',...args],{cwd:temporary,encoding:'utf8'});
  let result=run();assert.equal(result.status,0,result.stderr);assert.equal(fs.readFileSync(notes,'utf8'),sentinel);
  const report=path.join(temporary,'docs/AUTOMATION_COVERAGE.md'),expected=fs.readFileSync(report,'utf8');
  result=run();assert.equal(result.status,0,result.stderr);assert.equal(fs.readFileSync(report,'utf8'),expected);
  result=run('--check');assert.equal(result.status,0,result.stderr);
  fs.writeFileSync(report,expected+'stale\n');result=run('--check');assert.notEqual(result.status,0);assert.match(result.stderr,/Stale generated report/);
  assert.equal(fs.readFileSync(report,'utf8'),expected+'stale\n','CI must not silently repair a stale report');
  fs.writeFileSync(report,expected);
  const manifest=path.join(temporary,'docs/effect-coverage.json'),effects=JSON.parse(fs.readFileSync(manifest,'utf8'));
  effects[0].tests[0].name='nonexistent test';fs.writeFileSync(manifest,JSON.stringify(effects));
  result=run('--check');assert.notEqual(result.status,0);assert.match(result.stderr,/Missing regression test/);
  effects[0].status='complete';fs.writeFileSync(manifest,JSON.stringify(effects));
  result=run('--check');assert.notEqual(result.status,0);assert.match(result.stderr,/cannot be certified/);
  assert.equal(fs.readFileSync(notes,'utf8'),sentinel);
 }finally{fs.rmSync(temporary,{recursive:true,force:true})}
});
