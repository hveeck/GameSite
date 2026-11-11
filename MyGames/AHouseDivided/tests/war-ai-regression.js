/* Standalone regression checks against the shipped AI and coalition logic.
   Run with: node tests/war-ai-regression.js */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
function extract(source,name){
 const re=new RegExp('function '+name+'\\('),m=re.exec(source);if(!m)throw Error('Missing '+name);
 const start=m.index,open=source.indexOf('{',start);let depth=0,end=open;
 // Curly strings/comments in these functions don't contain unmatched braces.
 for(let i=open;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth){end=i+1;break}}
 return source.slice(start,end);
}
const root=path.join(__dirname,'..');
const coal=fs.readFileSync(path.join(root,'coalitions.js'),'utf8');
const mil=fs.readFileSync(path.join(root,'military.js'),'utf8');
function testCoalitionSurvival(){
 const countries=[{id:0},{id:1},{id:2},{id:3}],holdings=[[0,1],[2],[3],[4]];
 const c={id:1,leaders:[0,1],sides:[[0,2],[1,3]],ownedPairs:new Set(['0:1','0:3','2:1','2:3'])};
 let wars=[[0,3],[2,3]],ended=false;
 const ctx={countries,c,coalitionWars:new Map([[1,c]]),wars,
  validPartner:id=>holdings[id].length>0,coalitionKey:(a,b)=>[a,b].sort().join(':'),
  alliance:()=>false,atWar:(a,b)=>ctx.wars.some(w=>w.includes(a)&&w.includes(b)),
  endCoalition:()=>{ended=true}};
 vm.createContext(ctx);vm.runInContext(extract(coal,'reconcileCoalitions'),ctx);
 holdings[1]=[];ctx.reconcileCoalitions();
 assert.strictEqual(ended,false,'allied war must survive main defender capitulation');
 assert.strictEqual(c.leaders[1],3,'surviving defender becomes coalition leader');
 assert(ctx.atWar(0,3)&&ctx.atWar(2,3),'surviving allies remain at war');
 assert(!ctx.wars.some(w=>w.includes(1)),'defeated country cannot remain at war');
}
function testEmergencyAI(){
 let nextId=4;
 const countries=[{id:0,treasury:100},{id:1,treasury:240}];
 const territories=[{i:0,owner:0,p:30,e:18},{i:1,owner:1,p:25,e:10},{i:2,owner:0,p:15,e:3},{i:3,owner:1,p:5,e:8}];
 const countyGraph=[[1,2],[0,3],[0,3],[1,2]];
 const armies=[{id:1,owner:1,county:3,strength:15,quality:'elite',route:[],travelDays:0,lastMovementDay:0,entrench:0},{id:2,owner:1,county:3,strength:9,quality:'militia',route:[],travelDays:0,lastMovementDay:0,entrench:0}];
 const ctx={countries,territories,countyGraph,armies,daysElapsed:35,gameMode:'player',humanId:0,
  validCountries:()=>countries,enemies:id=>[1-id],atWar:(a,b)=>a!==b,
  ownedArmies:id=>armies.filter(a=>a.owner===id),countryStats:c=>({holdings:territories.filter(t=>t.owner===c.id)}),
  divisionRecruitPrice:q=>q==='elite'?65:25,
  countryDivisionRecruitPrice:(c,q)=>q==='elite'?65:25,
  aiMilitaryRecruitmentCapacity:(c,q)=>({affordable:c.treasury>70,price:q==='elite'?65:25}),
  createArmy:(id,county,strength,quality)=>{const a={id:++nextId,owner:id,county,strength,quality,route:[],travelDays:0,lastMovementDay:0};armies.push(a);return a},
  fieldStrength:a=>a.strength,divisionTraits:q=>({combat:q==='elite'?1.45:.9,pace:q==='elite'?1:1.6}),
  shortestCountyRoute:(src,dest)=>src===dest?[]:src===3&&dest===1?[1]:null};
 vm.createContext(ctx); const code=extract(mil,'emergencyAiWarResponse').replace('if(!borders.length)continue;','if(!borders.length)continue;');ctx.console=console;vm.runInContext(code,ctx);ctx.emergencyAiWarResponse();
 const a=armies.filter(x=>x.owner===1);

 assert(a.length>2,'AI recruits while attacked and treasury is available');
 assert(countries[1].treasury<240,'AI pays for emergency recruits');
 assert(a.some(x=>x.route?.at(-1)===0||x.route?.at(-1)===2), 'AI actually orders attacks into enemy territory');
 assert(a.some(x=>x.plan?.threshold===0),'AI offensive stance allows attacks regardless of strategic strength');
 // Simulate an actual game-time move/assault instead of merely checking plans.
 let assaults=0;
 Object.assign(ctx,{
  alliance:()=>false,rand:()=>.5,retreatDisplacedArmies:()=>{},restorePeaceArmies:()=>{},
  resolveArmyAssault:(attacker,target)=>{assaults++;territories[target].owner=attacker.owner;return true},
  armyAdvantage:()=>.8,armyMessage:'',undefendedCaptureBonus:()=>1,
 });
 vm.runInContext(extract(mil,'moveArmies'),ctx);
 ctx.moveArmies(7);
 assert(assaults>0,'AI units with an accessible exposed border must actually fight within one weekly advance');
 assert(territories.some(t=>t.owner===1&&[0,2].includes(t.i)),'AI invasion must capture enemy territory');

}
function testPeaceUI(){
 const src=fs.readFileSync(path.join(root,'peace-deals.js'),'utf8');
 assert(src.includes('peaceRequireCounties'),'county checkbox is present');
 assert(src.includes('peaceCapitulationOnly'),'capitulation checkbox is present');
 assert(src.includes('onchange=()=>{if(total.checked)require.checked=false'),'choices are mutually exclusive');
 assert(src.includes('peaceCapitulationOnly.has(pactKey(sender,receiver))'),'capitulation-only suppresses new offers');
}
testCoalitionSurvival();testEmergencyAI();testPeaceUI();console.log('PASS: coalition survival, AI emergency attacks and recruitment, clear peace choices');
