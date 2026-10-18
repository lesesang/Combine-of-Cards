// Straw Doll shares applications to a monster, not a second activation of the
// source card. Costs, dice, draws and player-side clauses are never replayed.
import {expandSharedRecipients} from './shared-state.mjs';
const ID='COC-21-008';
export function linkStraw(r,sourceId,targetId,H){
 const source=r.units[sourceId],target=r.units[targetId],a=H.zone(r,sourceId),b=H.zone(r,targetId);
 if(source?.cardId!==ID||source.effectsNegated||a?.zone!=='field'||b?.zone!=='field'||sourceId===targetId)
  H.fail(409,'밀짚인형과 공유할 다른 필드 몬스터를 선택하세요.');
 source.strawLink={id:targetId,sourceRevision:source.fieldRevision||0,sourceController:a.player,
  targetRevision:target.fieldRevision||0,targetController:b.player};
 H.log(r,'effect',`나태한 밀짚인형: ${H.name(r,targetId)}와 효과 적용 공유`);
}
export function sharedEffectRecipients(r,ids,H){
 return expandSharedRecipients(r,ids);
}
export function applySharedUnitEffect(r,ids,H,apply,{exclude=[]}={}){
 // Snapshot before mutation: destroying/negating the doll does not cancel the
 // already-shared application. A leave/re-entry during resolution does cancel it.
 const targets=sharedEffectRecipients(r,ids,H).filter(id=>!exclude.includes(id)).map(id=>{
  const z=H.zone(r,id),u=r.units[id];
  return {id,zone:z?.zone,player:z?.player,revision:(z?.zone==='integration'?u?.integrationRevision:u?.fieldRevision)||0};
 });
 const results=new Map();
 for(const t of targets){
  const u=r.units[t.id],z=u&&H.zone(r,t.id);
  if(!u||!['field','integration'].includes(t.zone)||z?.zone!==t.zone||z.player!==t.player||((t.zone==='integration'?u.integrationRevision:u.fieldRevision)||0)!==t.revision)continue;
  results.set(t.id,apply(t.id,u,z));
 }
 return results;
}
export function destroySharedUnits(r,ids,H,meta={},options={}){
 const targets=sharedEffectRecipients(r,ids,H).filter(id=>!options.exclude?.includes(id));
 if(H.destroyBatch){
  // The server's batch helper intentionally accepts field monsters only.
  // Stroberia also targets integration hosts; preserve that existing scope.
  const hosts=targets.flatMap(id=>{
   const z=H.zone(r,id),u=r.units[id];
   return z?.zone==='integration'?[{id,player:z.player,revision:u.integrationRevision||0}]:[];
  });
  H.destroyBatch(r,targets.filter(id=>H.zone(r,id)?.zone==='field'),meta);
  for(const t of hosts){
   const z=H.zone(r,t.id),u=r.units[t.id];
   if(z?.zone==='integration'&&z.player===t.player&&(u.integrationRevision||0)===t.revision)H.destroy(r,t.id,meta);
  }
  return;
 }
 return applySharedUnitEffect(r,ids,H,id=>H.destroy(r,id,meta),options);
}
export function hurtSharedUnits(r,ids,amount,H,meta={}){
 return applySharedUnitEffect(r,ids,H,id=>H.hurt(r,id,amount,meta));
}
export function moveSharedUnits(r,ids,to,H,meta={},options={}){
 return applySharedUnitEffect(r,ids,H,(id,u)=>H.move(r,id,to,u.owner,meta),options);
}
export function captureSharedUnits(r,ids,who,H,{reserve=0}={}){
 // The declared targets take the available slots first. A shared recipient
 // never invalidates the paid action merely because the remaining field is full.
 return applySharedUnitEffect(r,ids,H,(id,u,z)=>{
  if(z.zone!=='field'||z.player===who||r.players[who].field.filter(id=>id===null).length<=reserve)return false;
  H.capture(r,who,id);return true;
 });
}
