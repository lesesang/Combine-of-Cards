export const REMAINING_FIELD_IDS=['COC-08-003','COC-10-005','COC-23-002','COC-24-003','COC-26-003','COC-31-004'];
export function remainingFieldFixture(I,cardId,who=0){
 const r={code:'LATEAB',status:'active',version:1,turn:who,turnNumber:5,phase:'MAIN',mode:'pvp',players:[],units:{},logs:[],effects:[]};
 I.createPlayer(r,'31','A','a'.repeat(64));I.createPlayer(r,'31','B','b'.repeat(64));
 r.players.forEach(p=>{p.turnsTaken=3;for(const zone of ['deck','hand','grave','extra','banished'])p[zone]=[];p.field=[null,null,null];p.integration=null;});r.units={};
 const add=(cid,owner,zone)=>{const id=I.instantiate(r,cid,owner);I.move(r,id,zone,owner);return id;};
 const integration=['COC-10-005','COC-31-004'].includes(cardId),source=add(cardId,who,integration?'integration':'field');
 const own=add('COC-21-009',who,'field'),foe=add('COC-21-009',1-who,'field'),wind=add('COC-12-002',1-who,'field');
 const cost=add('COC-31-005',who,'hand'),croix=add('COC-31-001',who,'grave');
 // Enough draws to isolate summon/cost effects from reload damage.
 for(let i=0;i<4;i++)add('COC-31-005',who,'deck');
 let rider;if(cardId==='COC-23-002')rider=add('COC-23-001',who,'integration');
 const body={sourceUnitId:source,target:{type:'unit',id:['COC-24-003','COC-26-003'].includes(cardId)?own:foe},costTarget:{type:'unit',id:own},costCardId:cost};
 return {r,who,cardId,source,own,foe,wind,cost,croix,rider,body,add,integration};
}
