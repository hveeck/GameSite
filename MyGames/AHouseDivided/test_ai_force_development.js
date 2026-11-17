const assert=require('assert'),fs=require('fs'),vm=require('vm');
const c={id:1,treasury:600,stability:70};
let supply=true,deficit=false,capacity=3.5,armyList=[],day=0,calls=0;
const env={window:{},countries:[{id:0},c],humanId:0,gameMode:'player',aiChallenge:'medium',daysElapsed:0,geomReady:true,
 advanceCabinet:()=>{},validCountries:()=>[c],countryStats:()=>({holdings:[{i:0}],pop:3}),
 militaryPosture:()=>({capacity,ratio:armyList.reduce((n,a)=>n+a.strength/12,0)/capacity}),
 ownedArmies:()=>armyList,enemies:()=>[],recurringLedger:()=>({net:deficit?-10:20}),
 coreRecruitCounties:()=>[{i:0}],countryDivisionRecruitPrice:()=>30,
 aiMilitaryRecruitmentCapacity:()=>({affordable:supply,price:30}),
 divisionStartStrength:(q)=>q==='elite'?15:9,createArmy:(id,i,strength,quality)=>{const a={id:++calls,strength,quality};armyList.push(a);return a},
 countyGraph:[[]],territories:[{owner:1}],atWar:()=>false,Math,
 console};
vm.createContext(env);vm.runInContext(fs.readFileSync(__dirname+'/ai-force-development.js','utf8'),env);
assert.equal(env.window.houseDividedForceDevelopment.developmentTarget(c),4);
// Countries should build one unit per interval, not in a burst.
env.daysElapsed=31;env.advanceCabinet(31);assert.equal(armyList.length,0);
env.daysElapsed=62;env.advanceCabinet(31);assert.equal(armyList.length,1);
env.daysElapsed=63;env.advanceCabinet(1);assert.equal(armyList.length,1);
// Financial trouble prevents expansion.
deficit=true;env.daysElapsed=110;env.advanceCabinet(47);assert.equal(armyList.length,1);
deficit=false;supply=false;env.daysElapsed=160;env.advanceCabinet(50);assert.equal(armyList.length,1);
supply=true;env.daysElapsed=210;env.advanceCabinet(50);assert.equal(armyList.length,2);
// Never exceed balanced posture even if treasury is huge.
capacity=.7;env.daysElapsed=300;env.advanceCabinet(90);assert.equal(armyList.length,2);
console.log('PASS: paced peacetime buildup, no money or manpower spam, balanced posture ceiling');
