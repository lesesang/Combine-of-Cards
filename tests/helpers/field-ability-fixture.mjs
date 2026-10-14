export function fieldAbilityFixture(I,cardId,who=0){
 const r={code:'ABILTY',status:'active',version:1,turn:who,turnNumber:5,phase:'MAIN',mode:'pvp',players:[],units:{},logs:[],effects:[]};
 I.createPlayer(r,'12','A','a'.repeat(64));I.createPlayer(r,'12','B','b'.repeat(64));r.players.forEach(p=>p.turnsTaken=3);
 const add=(cid,owner,zone)=>{const id=I.instantiate(r,cid,owner);I.move(r,id,zone,owner);return id;};
 const integration=['COC-13-001','COC-22-010'].includes(cardId);
 const source=add(cardId,who,integration?'integration':'field');
 const target=add('COC-03-005',cardId==='COC-22-010'?who:1-who,'field');
 Object.assign(r.units[target],{atk:50,hp:80});
 const cost=add('COC-12-001',who,'hand'),search=add('COC-03-001',who,'deck');
 const wind=add('COC-12-002',1-who,'field');
 const body={sourceUnitId:source,target:{type:'unit',id:target},costCardId:cost};
 return {r,who,cardId,source,target,cost,search,wind,body,add,integration};
}
