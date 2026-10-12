import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'coc-matrix-'));
process.env.DATA_DIR=temporary;
process.env.NODE_ENV='test';
const {createApp}=await import('../server.mjs');
const app=createApp();
const url=await new Promise(ok=>app.listen(0,'127.0.0.1',()=>ok('http://127.0.0.1:'+app.address().port)));
const catalog=await (await fetch(url+'/api/catalog')).json();
const result={tested:0,failures:[],aiStops:[],totalActions:0};
async function api(route,{method='GET',token,body}={}){
 const response=await fetch(url+route,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 return {http:response.status,...await response.json()};
}
try {
 for(const d of catalog.decks){
  const x=await api('/api/ai',{method:'POST',body:{deckId:'30',aiDeckId:d.id,difficulty:'hard'}});
  if(x.http!==201){result.failures.push([d.id,x]);continue;}
  let state=x.state,attempts=0;
  while(attempts++<35&&state.status==='active'){
   const type=state.pendingAttack?.stage==='response'?'defend':state.phase==='DRAW'?'draw':'phase';
   const action=await api('/api/rooms/'+x.code+'/actions',{method:'POST',token:x.token,body:{type,expectedVersion:state.version,skipAttack:true}});
   result.totalActions++;
   if(action.http!==200){result.failures.push({deck:d.id,turn:state.turn,phase:state.phase,type,action});break;}
   state=action;
  }
  if(state.logs.some(e=>e.type==='ai'&&e.text.includes('AI 판정 중단')))result.aiStops.push({name:d.name,logs:state.logs.filter(e=>e.type==='ai').map(e=>e.text)});
  result.tested++;
 }
 console.log(JSON.stringify(result,null,2));
 if(result.failures.length||result.aiStops.length)process.exitCode=1;
} finally {
 await new Promise(ok=>app.close(ok));
 fs.rmSync(temporary,{recursive:true,force:true});
}
