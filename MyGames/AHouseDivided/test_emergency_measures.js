const assert=require('assert'); const vm=require('vm');const fs=require('fs');
const countries=[{id:0,stability:70,readiness:60,treasury:120,warExhaustion:30},{id:1,stability:62,readiness:55,treasury:125,warExhaustion:30}];
let active=false,day=0;const env={window:{},countries,humanId:0,gameMode:'player',aiChallenge:'medium',
 enemies:()=>active?[1]:[],daysElapsed:0,log:()=>{},renderGovernance:()=>{},renderCabinet:()=>{},
 renderNationalFront:()=>{},divisionRecruitPrice:()=>100,countryDivisionRecruitPrice:(c,q)=>c.id===0?env.divisionRecruitPrice(q):120,
 clamp:(v,low,hi)=>Math.max(low,Math.min(hi,v)),recurringLedger:()=>({net:-5}),
 ownedArmies:()=>[],initManpower:()=>{},recruitmentChangeDays:()=>0,recruitmentRate:()=>10,
 recruitmentPolicies:{10:{name:'Standard',description:'Regular'}},recruitmentPolicy:()=>({description:'regular'}),
 frontSection:null,gameMode:'player',console};
vm.createContext(env);vm.runInContext(fs.readFileSync(__dirname+'/emergency-measures.js','utf8'),env);
const funcs=env.window.houseDividedEmergency;
assert.equal(funcs.canAct(countries[0]),false);
active=true;env.daysElapsed=0;funcs.syncWar(countries[0]);
assert.equal(funcs.canAct(countries[0]),false);env.daysElapsed=179;assert.equal(funcs.canAct(countries[0]),false);
assert.equal(funcs.setMeasure(countries[0],'warTaxes',true),false);
env.daysElapsed=180;assert.equal(funcs.canAct(countries[0]),true);
assert.equal(funcs.setMeasure(countries[0],'warTaxes',true),true);
assert.equal(countries[0].stability,67);
assert.equal(funcs.setMeasure(countries[0],'warProduction',true),true);
assert.equal(env.divisionRecruitPrice('militia'),85);
assert.equal(env.countryDivisionRecruitPrice(countries[0],'elite'),85);
assert.equal(env.countryDivisionRecruitPrice(countries[1],'elite'),120);
assert.equal(funcs.setMeasure(countries[0],'propaganda',true),true);
env.window.updateEmergencyMeasures(countries[0],1);
assert(Math.abs(countries[0].stability-67.05)<1e-8);
assert.equal(countries[0].warExhaustion,29.5);
// Peace ends all measures immediately, no finite 12-month timer.
env.daysElapsed=1100;assert(funcs.init(countries[0]).warTaxes);
active=false;funcs.syncWar(countries[0]);assert(Object.values(countries[0].emergencyMeasures).every(x=>!x));
assert.equal(countries[0].emergencyWarStarted,null);
// Reg AI receives no policies at all, even after long wars.
active=true;env.daysElapsed=1200;funcs.syncWar(countries[1]);env.daysElapsed=1500;env.window.updateEmergencyMeasures(countries[1],1);
assert(Object.values(countries[1].emergencyMeasures).every(x=>!x));
// Hard AI has policy options after six months.
env.aiChallenge='hard';env.window.updateEmergencyMeasures(countries[1],1);
assert.equal(countries[1].emergencyMeasures.warTaxes,true);
console.log('PASS emergency measures: eligibility, taxes, production, propaganda, expiry, Regular/Hard AI');
