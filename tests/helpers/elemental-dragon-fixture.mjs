export function elementalDragonFixture(I,cid='COC-32-012',who=0){
 const r={code:'DRAGON',status:'active',version:1,turn:who,turnNumber:5,phase:'MAIN',mode:'pvp',players:[],units:{},logs:[],effects:[]};
 I.createPlayer(r,'32','A','a'.repeat(64));I.createPlayer(r,'32','B','b'.repeat(64));
 r.players.forEach(p=>{p.turnsTaken=3;for(const z of ['deck','hand','grave','extra','banished'])p[z]=[];p.field=[null,null,null];p.integration=null;});r.units={};
 const f={r};
 const add=(card,owner=who,zone='field')=>{const r=f.r,id=I.instantiate(r,card,owner);if(zone==='extra')r.players[owner].extra.push(id);else I.move(r,id,zone,owner);return id;};
 const source=add(cid),foe=add('COC-21-009',1-who);r.units[foe].hp=400;
 for(const player of [0,1])for(let i=0;i<8;i++)add('COC-32-005',player,'deck');
 const body={sourceUnitId:source,...(cid==='COC-32-012'?{target:{type:'unit',id:foe}}:{})};
 return Object.assign(f,{who,cid,source,foe,body,add});
}
export function matureTerra(I,f){
 // Advance through genuine END -> next player DRAW transitions.
 for(let i=0;i<4;i++){f.r.phase='END';I.apply(f.r,f.r.turn,'phase',{});}
 f.r.phase='MAIN';
}
