import {declareAutomaticGroup,resolveEffectStack} from './effect-runtime.mjs';

export const CARTOON_IDS = Object.freeze({
  demonDragon:'COC-05-001',
  land:'COC-05-002',
  guide:'COC-05-008'
});

/**
 * Land is already in its owner's graveyard when this destroy-trigger is raised.
 * Cartoon Demon Dragon must be destroyed BEFORE World Guide brings Land back.
 * All entries are data, so the chain uses the same serializable LIFO runtime.
 */
export function onCartoonLandDestroyed(room,landId,controller,H) {
  if(room.units[landId]?.cardId!==CARTOON_IDS.land)return [];
  const dragonIds=room.players[controller].field.filter(
    id=>id&&room.units[id]?.cardId===CARTOON_IDS.demonDragon
  );
  const guideId=room.players[controller].deck.find(
    id=>room.units[id]?.cardId===CARTOON_IDS.guide
  );
  const declarations=[];
  if(guideId)declarations.push({
    key:'world-guide',effectId:'cartoon-land-restore',sourceId:guideId,
    owner:controller,priority:0,exception:'destroy-trigger',
    payload:{landId,guideId}
  });
  for(const [i,id] of dragonIds.entries())declarations.push({
    key:'dragon-'+i,effectId:'cartoon-dragon-destroy',sourceId:id,
    owner:controller,priority:10,exception:'destroy-trigger',
    payload:{dragonId:id}
  });
  if(!declarations.length)return [];
  declareAutomaticGroup(room,declarations,room.turn===0||room.turn===1?room.turn:controller);
  const results=resolveEffectStack(room,{
    getZone:id=>H.zone(room,id),
    execute:entry=>{
      if(entry.effectId==='cartoon-dragon-destroy'){
        const d=entry.payload.dragonId;
        if(H.zone(room,d)?.zone==='field'){
          H.destroy(room,d);
          H.log(room,'effect','카툰 랜드 파괴 연쇄: 카툰 데몬즈 드래곤 파괴를 먼저 처리');
        }
      } else if(entry.effectId==='cartoon-land-restore'){
        const g=entry.payload.guideId;
        if(H.zone(room,g)?.zone!=='deck')return;
        H.move(room,g,'grave',controller);
        if(H.zone(room,landId)?.zone==='grave'&&room.players[controller].field.includes(null)){
          H.move(room,landId,'field',controller);
          const land=room.units[landId];
          land.atk=0;
          land.hp=50;
          land.cannotAttack=true;
          H.log(room,'effect','카툰 월드 가이드: 카툰 랜드를 체력 50으로 복구');
        }else{
          H.log(room,'effect','카툰 월드 가이드: 복구할 필드 공간 또는 묘지의 카툰 랜드가 없어 실패');
        }
      }
    }
  });
  return results;
}
