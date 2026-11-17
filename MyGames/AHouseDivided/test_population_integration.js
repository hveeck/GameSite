// Regression checks for military economics, integration, and homeland recruitment.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const ctx={console,Math,daysElapsed:0,geomReady:true,gameMode:'player',humanId:1,aiChallenge:'medium',
  territories:[{owner:1,coreOwner:1,p:.45,i:0,e:1,res:1,infra:1}, {owner:1,coreOwner:2,p:.7,i:1,e:1,res:1,infra:1}],
  countries:[null,{id:1,stability:65,readiness:65,treasury:200,budget:{diplomacy:4},industryBonus:0, taxPolicy:'normal',ideology:'republicanism',initialCount:1}],
  militaryPosture:()=>({tier:'balanced'}),enemies:()=>ctx.wartime?[2]:[],countryStats(c){const holdings=ctx.territories.filter(t=>t.owner===c.id);return {holdings,pop:holdings.reduce((n,t)=>n+t.p,0),economy:1.5,resources:1,industry:1}},
  validCountries(){return [ctx.countries[1]]},clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),invalidate:()=>{},
  advanceCabinet:()=>{},armyDisplay:()=>{},update:()=>{},cabinetStatus:()=>'<p>Cabinet</p>',
  document:{getElementById:()=>({textContent:'',title:''})},
  recurringLedger:()=>({net:0}),revenueEstimate:()=>10};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/population-mercenaries.js','utf8'),ctx);
const E=(s)=>vm.runInContext(s,ctx);
assert.equal(E('coreRecruitCounties(1).length'),1,'occupied land must not recruit');
assert.equal(E('countyIntegration(territories[1])'),0);
assert.equal(E('canSupplyManpower(countries[1],"mercenary",18)'),true);
const homePop=ctx.territories[0].p;
assert(Math.abs(E('manpowerCapacity(countries[1])')-homePop*.05)<1e-9,'normal capacity is 5% eligible people');
E('initManpower(countries[1])');
const opening=E('countries[1].manpowerPool');
E('spendManpower(countries[1],"militia",9)');
assert(Math.abs(E('countries[1].manpowerPool')-(opening-.00108))<1e-9,'militia spend 1080 from one reserve');
assert.equal(ctx.territories[0].p,homePop,'soldiers remain counted in total civilian population');
const after=E('countries[1].manpowerPool');
E('spendManpower(countries[1],"mercenary",20)');
assert.equal(E('countries[1].manpowerPool'),after,'mercenaries require no recruits');
assert(E('setRecruitmentRate(countries[1],15)'));
assert(Math.abs(E('manpowerCapacity(countries[1])')-homePop*.15)<1e-9,'mobilization gives 15% capacity');
assert(!E('setRecruitmentRate(countries[1],3)'), 'policy is locked for 90 days');
E('daysElapsed=90');
assert(E('setRecruitmentRate(countries[1],3)'));
assert(Math.abs(E('countries[1].manpowerPool')-(homePop*.03-.00108))<1e-9,'limited policy preserves previously spent recruits');
E('daysElapsed=180');
assert(E('setRecruitmentRate(countries[1],10)'));
assert(Math.abs(E('countries[1].manpowerPool')-(homePop*.10-.00108))<1e-9,'expanded reserve preserves already spent recruits');
const beforeMonth=E('countries[1].manpowerPool');
E('advanceCabinet(31)');
assert(Math.abs(E('countries[1].manpowerPool')-(beforeMonth+E('manpowerCapacity(countries[1])')-homePop*.10))<1e-9,'manpower changes only through newly integrated population, not monthly reserve refill');
assert(ctx.countries[1].stability<65,'expanded mobilization causes ongoing stability cost');
assert(ctx.territories[1].integrationProgress>0,'integration progresses');
assert(ctx.countries[1].stability<65,'conquered population causes regular stability pressure');
E('territories[1].integrationForOwner=1;territories[1].integrationProgress=.99;');
assert.equal(E('coreRecruitCounties(1).length'),2,'fully integrated counties become recruiting territory');
assert(E('manpowerCapacity(countries[1])')>homePop*.10,'integrating counties gradually expand pool');
E('territories[1].owner=2;');
assert.equal(E('countyIntegration(territories[1])'),1,'former core owner recovers core land');
E('territories[1].owner=1;territories[1].integrationForOwner=2;');
assert.equal(E('countyIntegration(territories[1])'),0,'reconquest by old invader cannot inherit other owner integration');
E('territories[1].owner=2;resetManpower(countries[1]);daysElapsed=270;gameMode="watch";');
const oldAI=ctx.countries[1].stability;
E('advanceCabinet(31)');
assert.equal(E('recruitmentRate(countries[1])'),3,'AI can choose the limited policy in peace');
E('daysElapsed=360;countries[1].manpowerUsed=.022;');
ctx.wartime=true;
E('advanceCabinet(31)');
assert.equal(E('recruitmentRate(countries[1])'),10,'AI can expand under wartime manpower pressure');
assert(ctx.countries[1].stability>oldAI,'AI received the same limited-policy stability benefit');
const wartimeStability=ctx.countries[1].stability;
E('daysElapsed=450;countries[1].manpowerUsed=.045;');
E('advanceCabinet(31)');
assert.equal(E('recruitmentRate(countries[1])'),15,'AI can mobilize under heavier reserve pressure');
assert(ctx.countries[1].stability<wartimeStability,'AI pays the same expanded-policy stability penalty');
E('countries[1].manpowerUsed=manpowerCapacity(countries[1]);globalThis.unit={quality:"militia",strength:9};reinforceDivision(countries[1],unit,2);');
assert.equal(E('unit.strength'),9,'reinforcements cannot exceed the shared reserve');
console.log('PASS: 3/5/10/15 shared recruitment policies, cooldown, reinforcement, AI selection, no refill, mercenaries and integration.');
