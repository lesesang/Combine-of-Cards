import {prepareResponseTargets} from './spell-response-targets.mjs';
// These handlers operate on the copying player's real resources, choices and
// continuations. None requires pretending that the original spell was played.
export const EXTENDED_COPY_SPELLS=Object.freeze([
 'COC-01-008','COC-03-006','COC-05-005','COC-05-006','COC-05-007',
 'COC-06-002','COC-06-003','COC-06-004','COC-06-008','COC-07-008','COC-07-010',
 'COC-09-005','COC-09-006','COC-09-007','COC-10-008','COC-10-010',
 'COC-11-010','COC-13-008','COC-14-002','COC-14-007','COC-14-008','COC-14-009',
 'COC-17-002','COC-17-004','COC-19-002','COC-19-007','COC-20-010',
 'COC-21-006','COC-22-007','COC-23-010','COC-24-006','COC-24-007','COC-27-005','COC-30-002'
]);
export function prepareExtendedCopy(r,who,cid,body,H,number=1){
 const selected={};
 for(const key of ['target','targets','option','effectTargetRevision','effectTargetZone','effectTargetPlayer','copyTargetRevision','tradeSourceRevision','tradeCandidates','blackMetalRevision','temperingSourceId','temperingRevision','mercuryEffect','mercuryTargets','mindChangeHost','mindChangeRevision'])
  if(body[key]!==undefined)selected[key]=structuredClone(body[key]);
 return prepareResponseTargets(r,who,cid,selected,H,{ignoreConditions:true,copiedEffectNumber:number});
}
export function beginCopiedHandDiscard(r,who,H){
 const choices=r.players[1-who].hand.map(id=>({id,revision:r.units[id].zoneRevision||0}));
 if(!choices.length)return;
 const sourceId=r.players[who].integration;
 r.pendingDeckSearch={who,cardId:'COC-13-008',copyHandDiscard:true,sourceId,
  sourceRevision:r.units[sourceId].integrationRevision||0,choices};
 H.log(r,'effect','원죄·카드 뺏기: 상대 패를 확인하고 묘지로 보낼 1장 선택');
}
function handChoices(r,p){
 const u=r.units[p.sourceId];
 if(r.players[p.who].integration!==p.sourceId||u?.cardId!=='COC-21-001'||u.effectsNegated||(u.integrationRevision||0)!==p.sourceRevision)return [];
 return p.choices.filter(c=>r.players[1-p.who].hand.includes(c.id)&&(r.units[c.id]?.zoneRevision||0)===c.revision);
}
export function copiedHandView(r,viewer,cards){
 const p=r.pendingDeckSearch;
 return {who:p.who,cardId:p.cardId,copyHandDiscard:true,zone:'hand',...(viewer===p.who?{choices:handChoices(r,p).map(c=>({id:c.id,card:cards.get(r.units[c.id].cardId)}))}:{})};
}
export function chooseCopiedHand(r,who,id,H){
 const p=r.pendingDeckSearch;
 if(!p?.copyHandDiscard||p.who!==who)H.fail(403,'복사한 카드 뺏기 선택권자가 아닙니다.');
 const legal=handChoices(r,p);
 if(!legal.length){r.pendingDeckSearch=null;return;}
 if(!legal.some(c=>c.id===id))H.fail(409,'현재 상대 패에 남아 있는 후보를 선택하세요.');
 r.pendingDeckSearch=null;H.move(r,id,'grave',r.units[id].owner);
 H.log(r,'effect','원죄·카드 뺏기: 선택한 상대 패 1장을 묘지로 보냄');
}
