const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'../grand-strategy.js'),'utf8');
function extract(name){const idx=src.indexOf('function '+name+'(');assert(idx>=0,name);let pos=src.indexOf('{',idx),depth=0;for(let i=pos;i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'&&!--depth)return src.slice(idx,i+1)}throw Error(name)}
const countries=[{id:0,threat:0,reputation:55,offensiveWars:0,offensiveCaptures:0},{id:1,threat:0,reputation:55},{id:2,threat:0,reputation:55},{id:3,threat:0,reputation:55}];
const powers=[100,28,35,140];let pacts=[],wars=[];
const ctx={countries,pacts,wars,gameMode:'player',humanId:0,daysElapsed:365,
 countryStats:c=>({holdings:[1],power:powers[c.id]}),bordering:(a,b)=>a!==b,alliance:(a,b)=>pacts.some(x=>x.includes(a)&&x.includes(b)),hasNonAggression:()=>false,atWar:(a,b)=>wars.some(x=>x.includes(a)&&x.includes(b)),enemies:()=>[],partnerIds:id=>pacts.filter(x=>x.includes(id)).map(x=>x[0]===id?x[1]:x[0]),pactKey:(a,b)=>[a,b].sort().join(':'),ideologyAffinity:()=>.6,relationRating:()=>85,clamp:(v,min,max)=>Math.max(min,Math.min(max,v)),leaderPersonality:()=>({ally:1}),allianceCooldown:new Map(),commonThreat:()=>0};
vm.createContext(ctx);
for(const name of ['strategicCountry','humanContainmentAlarm','containmentFear','containmentPair','allianceAcceptance'])vm.runInContext(extract(name),ctx);
assert.strictEqual(ctx.allianceAcceptance(countries[1],countries[2]),0,'peaceful human should not cause AI alliance');
const h=countries[0];h.threat=67;h.reputation=24;h.offensiveWars=2;h.offensiveCaptures=8;
assert(ctx.containmentFear(countries[1],h),'smaller worried neighbor qualifies');
assert(ctx.containmentPair(countries[1],countries[2],h),'two smaller worried countries can form a bloc');
assert(!ctx.containmentFear(countries[3],h),'stronger country cannot pile onto human');
assert(ctx.allianceAcceptance(countries[1],countries[2])>0,'scared pair can now form alliance');
assert.strictEqual(ctx.allianceAcceptance(countries[1],countries[3]),0,'strong nonthreatened country cannot join containment');
console.log('PASS: coalition only among smaller fearful neighbors after repeated conquest');
