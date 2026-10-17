import {gainUnitStats} from './stat-gains.mjs';
import {queueCardRevival} from './death-revival.mjs';
export function recordFramDeath(r,controller){
 const id=r.players[controller].integration,u=id&&r.units[id];
 if(u?.cardId!=='COC-10-005')return;
 const revision=u.integrationRevision||0;
 if(u.framDeaths?.controller!==controller||u.framDeaths.revision!==revision)u.framDeaths={controller,revision,count:0};
 u.framDeaths.count++;
}
export function covenantReady(r,who){
 const id=r.players[who].integration,u=id&&r.units[id],h=u?.framDeaths;
 return u?.cardId==='COC-10-005'&&h?.controller===who&&h.revision===(u.integrationRevision||0)&&h.count>=3&&r.players[who].field.includes(null);
}
export function summonCovenant(r,who,H){
 if(!r.players[who].field.includes(null)){H.log(r,'effect','강령의 맹약: 빈 필드 소실로 소환 불발');return;}
 const id=H.instantiate(r,'COC-10-011',who);H.move(r,id,'hand',who);
 queueCardRevival(r,who,id,H,{kind:'covenant',originZone:'hand'});
 H.log(r,'effect','강령의 맹약: 빌헬름을 패에 생성하고 소환 예약');
}
export function drawLantern(r,who,H){
 const drawn=[];let emptied=false;
 // Two bounded monster draws. A missing monster for a draw invokes this
 // card's confirmed reload exception, retaining any non-monsters in deck.
 for(let attempt=0;attempt<2&&r.status==='active';attempt++){
  const p=r.players[who],monster=id=>(H.cards.get(r.units[id]?.cardId)?.type||'').includes('몬스터');
  let id=p.deck.find(monster);
  if(!id){
   H.reload(r,who);
   if(r.status!=='active')break;
   id=p.deck.find(monster);
   if(!id){H.drawFailure(r,who);break;}
  }
  H.move(r,id,'hand',who);drawn.push(id);
  if(!p.deck.length)emptied=true;
  H.log(r,'draw',`망령의 등불: ${H.name(r,id)} 공개 후 몬스터 드로우`);
 }
 if(r.status!=='active')return;
 if(emptied)for(const id of drawn){
  const u=r.units[id],z=u&&H.zone(r,id);
  if(z?.zone==='hand'&&z.player===who){if(u.hp===null)u.hp=0;gainUnitStats(r,id,{atk:100,hp:100});}
 }
 if(emptied)H.log(r,'effect','망령의 등불: 이 효과로 덱을 비워 가져온 몬스터 +100/+100');
}
