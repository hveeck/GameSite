const fs=require('fs'),vm=require('vm'),assert=require('assert');
const strategic=fs.readFileSync('grand-strategy.js','utf8');
const coal=fs.readFileSync('coalitions.js','utf8');
function extract(s,name){const m=new RegExp('function '+name+'\\(').exec(s);assert(m,name+' function missing');const o=s.indexOf('{',m.index);let depth=0;for(let i=o;i<s.length;i++){if(s[i]==='{')depth++;else if(s[i]==='}'&&!--depth)return s.slice(m.index,i+1);}throw Error('bad '+name)}
const countries=[{id:0,stability:75,warExhaustion:0},{id:1,stability:75,warExhaustion:0},{id:2,stability:75,warExhaustion:0}],pacts=[[1,2]];
const ctx={countries,pacts,gameMode:'player',humanId:0,daysElapsed:100,rand:()=>0.01,
 coalitionWars:new Map(),wars:[[0,1]],coalitionSerial:0,territories:[{i:0,owner:0},{i:1,owner:1}],
 coalitionKey:(a,b)=>[a,b].sort().join(':'),initAgency:()=>{},
 pactKey:(a,b)=>[a,b].sort().join(':'),validPartner:id=>!!countries[id],
 countryStats:()=>({holdings:[1]}),atWar:(a,b)=>ctx.wars.some(w=>w.includes(a)&&w.includes(b)),
 alliance:(a,b)=>ctx.pacts.some(p=>p.includes(a)&&p.includes(b)),
 hasNonAggression:()=>false,ideologyAffinity:()=>.5,relationRating:()=>75,
 enemies:()=>[],clamp:(v,min,max)=>Math.min(max,Math.max(min,v)),log:()=>{},
};
vm.createContext(ctx);
for(const name of ['strategicCountry','humanContainmentAlarm'])vm.runInContext(extract(strategic,name),ctx);
for(const name of ['coalitionSide','partnerIds','militaryCommitmentOdds','attachCoalition','requestWarSupport','startCoalition'])vm.runInContext(extract(coal,name),ctx);
let c=ctx.startCoalition(0,1);
assert(!c.sides[1].includes(2),'first invasion should not summon defending allied armies');
assert(ctx.pacts.some(p=>p.includes(1)&&p.includes(2)),'deferred defensive treaty remains valid');
assert.strictEqual(ctx.humanContainmentAlarm(),false);
const h=ctx.strategicCountry(countries[0]);h.offensiveWars=2;h.offensiveCaptures=7;
assert.strictEqual(ctx.humanContainmentAlarm(),false,'two declarations with too little expansion do not trigger coalition');
h.offensiveCaptures=8;assert.strictEqual(ctx.humanContainmentAlarm(),true,'repeated conquests activate containment');
ctx.wars=[[0,1]];c=ctx.startCoalition(0,1);
assert(c.sides[1].includes(2),'sufficient repeated conquest makes defensive ally intervention possible');
console.log('PASS: early anti-human military coalition gated, treaties preserved, repeated expansion unlocks intervention');
