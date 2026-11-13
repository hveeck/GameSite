// Regression checks for military economics, integration, and homeland recruitment.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const ctx={console,Math,daysElapsed:0,geomReady:true,gameMode:'player',humanId:1,aiChallenge:'medium',
  territories:[{owner:1,coreOwner:1,p:.45,i:0,e:1,res:1,infra:1}, {owner:1,coreOwner:2,p:.7,i:1,e:1,res:1,infra:1}],
  countries:[null,{id:1,stability:65,readiness:65,treasury:200,budget:{diplomacy:4},industryBonus:0, taxPolicy:'normal',ideology:'republicanism',initialCount:1}],
  enemies:()=>[],countryStats(c){const holdings=ctx.territories.filter(t=>t.owner===c.id);return {holdings,pop:holdings.reduce((n,t)=>n+t.p,0),economy:1.5,resources:1,industry:1}},
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
let before=ctx.territories[0].p;
E('spendManpower(countries[1],"militia",9)');
assert(ctx.territories[0].p<before,'militia recruitment must consume population');
const popAfter=ctx.territories[0].p;
E('spendManpower(countries[1],"mercenary",18)');
assert.equal(ctx.territories[0].p,popAfter,'mercenaries must not consume population');
E('advanceCabinet(31)');
assert(ctx.territories[1].integrationProgress>0,'integration progresses');
assert(ctx.countries[1].stability<65,'conquered population causes regular stability pressure');
E('territories[1].integrationForOwner=1;territories[1].integrationProgress=.99;');
assert.equal(E('coreRecruitCounties(1).length'),2,'fully integrated counties become recruiting territory');
E('territories[1].owner=2;');
assert.equal(E('countyIntegration(territories[1])'),1,'former core owner recovers core land');
E('territories[1].owner=1;territories[1].integrationForOwner=2;');
assert.equal(E('countyIntegration(territories[1])'),0,'reconquest by old invader cannot inherit other owner integration');
console.log('PASS: original land, mercenary manpower, recruited population, county integration, stability, eligible territory, capture reset.');
