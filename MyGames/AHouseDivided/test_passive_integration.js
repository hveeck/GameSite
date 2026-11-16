const fs=require('fs'),vm=require('vm'),assert=require('assert');
function scenario(authority, funding=3, ideology='republicanism', diff='medium', initiatives=0){
 const ctx={console,Math,daysElapsed:0,geomReady:true,gameMode:'player',humanId:1,aiChallenge:diff,
 territories:[{owner:1,coreOwner:1,p:1,i:0},{owner:1,coreOwner:2,p:.5,i:1}],
 countries:[null,{id:1,ideology,authorityPolicy:authority,stability:70,readiness:70,budget:{diplomacy:funding},treasury:200},{id:2,ideology:'republicanism',stability:70}],
 enemies:()=>[],countryStats(c){const holdings=ctx.territories.filter(t=>t.owner===c.id);return {holdings,pop:holdings.reduce((n,t)=>n+t.p,0)}},
 validCountries(){return [ctx.countries[1]]},clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),invalidate:()=>{},
 advanceCabinet:()=>{},armyDisplay:()=>{},update:()=>{},cabinetStatus:()=>'',
 document:{getElementById:()=>({textContent:'',title:''})},
 recurringLedger:()=>({net:0}),revenueEstimate:()=>10,initAgency:()=>{},
 programUses:()=>initiatives,
 ideologyAffinity:(a,b)=>a.ideology===b.ideology?1:0};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/population-mercenaries.js','utf8'),ctx);
 const ev=x=>vm.runInContext(x,ctx);
 ev('initManpower(countries[1])');const before=ev('manpowerCapacity(countries[1])');
 ev('advanceCabinet(365)');
 return {progress:ctx.territories[1].integrationProgress,cap:ev('manpowerCapacity(countries[1])'),before,stability:ctx.countries[1].stability};
}
const balanced=scenario('balanced'),central=scenario('centralized'),decentral=scenario('decentralized'),budgetHeavy=scenario('balanced',5),opposed=scenario('balanced',3,'fascism'),initiative=scenario('balanced',3,'republicanism','medium',1),hard=scenario('balanced',3,'republicanism','hard');
assert(central.progress>decentral.progress&&decentral.progress>balanced.progress, 'authority policy affects integration speed');
assert(central.stability<balanced.stability&&decentral.stability>balanced.stability,'centralization increases unrest while decentralization reduces it');
assert(budgetHeavy.progress>balanced.progress,'admin funding speeds integration');
assert(opposed.progress<balanced.progress,'ideological differences slow integration');
assert(initiative.progress>balanced.progress,'initiative speeds integration');
assert(hard.progress<balanced.progress,'Hard integrates more slowly');
assert(balanced.cap>balanced.before,'partial integration contributes recruitment before 97%');
assert.equal(scenario('balanced',0).before,.10,'home pop of one million fully integrated');
console.log('PASS passive integration: authority, stability, funding, ideology, initiative, difficulty, gradual manpower, homeland');
