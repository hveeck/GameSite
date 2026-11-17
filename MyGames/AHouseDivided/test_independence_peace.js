// Focused regression: independence wars prefer white peace, ordinary wars unchanged.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/peace-deals.js','utf8');
const segment=source.slice(source.indexOf('function normalizedTreaty('),source.indexOf('function validateTreaty('));
const ctx={daysElapsed:400,countries:[
 {id:0,warExhaustion:0,treasury:100},
 {id:1,warExhaustion:25,treasury:100,breakawayFrom:0,independenceWarStarted:100},
 {id:2,warExhaustion:25,treasury:100}],
 territories:[],atWar:(a,b)=>a!==b,
 countryStats:()=>({economy:20}),
 treatyCountyValue:()=>12,treatyMomentum:()=>0,clamp:(v,a,b)=>Math.min(b,Math.max(a,v))};
vm.createContext(ctx);vm.runInContext(segment,ctx);
const accept=offer=>vm.runInContext('treatyAcceptance('+JSON.stringify(offer)+')',ctx);
const offer=(from,to,white)=>({from,to,give:[],take:[],pay:0,receive:0,white});
assert(accept(offer(0,1,true))>accept(offer(0,1,false))+.30,'rebel receives large white-peace boost');
assert(accept(offer(1,0,true))>accept(offer(1,0,false))+.20,'former parent receives smaller white-peace boost');
assert(accept(offer(2,0,true))<accept(offer(2,0,false)),'ordinary war still values normal treaty terms');
assert.equal(vm.runInContext('independencePair(0,1)',ctx),true);
assert.equal(vm.runInContext('independencePair(0,2)',ctx),false);
console.log('PASS independence treaty preference: rebel, former parent, normal wars');
