const fs=require('fs'),vm=require('vm'),assert=require('assert');
const mil=fs.readFileSync('military.js','utf8'),agency=fs.readFileSync('agency.js','utf8');
function extract(s,name){const m=new RegExp('function '+name+'\\(').exec(s);assert(m,'missing '+name);const o=s.indexOf('{',m.index);let depth=0,quote=null,escape=false;for(let i=o;i<s.length;i++){let ch=s[i];if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===quote)quote=null;continue;}if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}if(ch==='{')depth++;else if(ch==='}'&&!--depth)return s.slice(m.index,i+1);}throw Error('unclosed '+name)}
const countries=[{id:0,treasury:130,militaryPolicy:'normal',budget:{welfare:1,industry:1,defense:1,diplomacy:1},initialCount:20,authorityPolicy:'balanced'}, {id:1,treasury:130,militaryPolicy:'normal',budget:{welfare:1,industry:1,defense:1,diplomacy:1},initialCount:20,authorityPolicy:'balanced'}];
const armies=[];
const ctx={aiChallenge:'medium',gameMode:'player',humanId:0,countries,armies,daysElapsed:50,
 initAgency:()=>{},countryStats:()=>({economy:180,resources:0,industry:0,pop:3,holdings:Array.from({length:20},()=>({}))}),
 ownedArmies:id=>armies.filter(a=>a.owner===id),enemies:()=>[1],militaryPosture:()=>({tier:'balanced'}),
 revenueEstimate:()=>16,recurringLedger:c=>({revenue:16,civilAndArmy:ctx.budgetExpense(c),priority:0,net:16-ctx.budgetExpense(c)})};
vm.createContext(ctx);
for(let [src,name] of [[mil,'divisionRecruitPrice'],[mil,'countryDivisionRecruitPrice'],[agency,'budgetExpense'],[mil,'aiMilitaryRecruitmentCapacity']])vm.runInContext(extract(src,name),ctx);
assert.strictEqual(ctx.divisionRecruitPrice('militia'),15,'player militia price');
assert.strictEqual(ctx.countryDivisionRecruitPrice(countries[0],'militia'),15);
assert.strictEqual(ctx.countryDivisionRecruitPrice(countries[1],'militia'),30,'AI militia price');
assert.strictEqual(ctx.countryDivisionRecruitPrice(countries[1],'elite'),100);
armies.push({owner:0,strength:9,quality:'militia'},{owner:1,strength:9,quality:'militia'});
const playerArmyExpense=ctx.budgetExpense(countries[0]),aiArmyExpense=ctx.budgetExpense(countries[1]);
// Civilian costs are equal; only the military component differs.
assert(aiArmyExpense>playerArmyExpense,'AI army maintenance higher than player');
const civil=180/155*4*.22;
const militaryPlayer=playerArmyExpense-civil,militaryAi=aiArmyExpense-civil;
assert(Math.abs(militaryAi/militaryPlayer-1.18/1.08)<.001,'medium upkeep is AI 1.18 vs player 1.08');
// A prospering country can fund modest reinforcements.
assert(ctx.aiMilitaryRecruitmentCapacity(countries[1],'militia',false).affordable,'productive country can recruit');
// Consistently accumulating divisions runs out of economic carrying capacity.
for(let i=0;i<35;i++)armies.push({owner:1,strength:9,quality:'militia'});
assert(!ctx.aiMilitaryRecruitmentCapacity(countries[1],'militia',true).affordable,'emergency must respect productive capacity');
// A poor state with a one-time treasury windfall cannot bankroll an empire.
armies.splice(2);
ctx.revenueEstimate=()=>2;
ctx.recurringLedger=c=>({revenue:2,civilAndArmy:ctx.budgetExpense(c),priority:0,net:2-ctx.budgetExpense(c)});
assert(!ctx.aiMilitaryRecruitmentCapacity(countries[1],'militia',true).affordable,'poor country blocked despite cash');
console.log('PASS: player/AI militia price, exact maintenance ratio, productive and cash-poor AI recruitment limits');
