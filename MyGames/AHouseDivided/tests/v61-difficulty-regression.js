const fs=require('fs'),vm=require('vm'),assert=require('assert');
const mil=fs.readFileSync('military.js','utf8'),agency=fs.readFileSync('agency.js','utf8'),minimal=fs.readFileSync('minimal.js','utf8'),snd=fs.readFileSync('soundtrack.js','utf8');
function get(src,name){let at=src.indexOf('function '+name+'(');assert(at>=0,name);let open=src.indexOf('{',at),depth=0,quote=null,escaped=false;for(let i=open;i<src.length;i++){let ch=src[i];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote=null;continue}if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}if(ch==='{')depth++;if(ch==='}'&&!--depth)return src.slice(at,i+1)}throw Error('unterminated '+name)}
const c0={id:0,treasury:200,industryBonus:0,budget:{welfare:1,industry:1,defense:1,diplomacy:1},initialCount:20,militaryPolicy:'normal'},c1={...c0,id:1};
const armies=[{owner:0,strength:9,quality:'militia'},{owner:1,strength:9,quality:'militia'}];
const ctx={gameMode:'player',humanId:0,aiChallenge:'easy',countries:[c0,c1],armies,daysElapsed:0,initAgency:()=>{},enemies:()=>[1],ownedArmies:id=>armies.filter(a=>a.owner===id),countryStats:()=>({economy:180,pop:5,resources:0,industry:0,holdings:Array.from({length:20},()=>({}))}),militaryPosture:()=>({tier:'balanced'}),ideologies:{republicanism:{treasury:1}}};
vm.createContext(ctx);for(const [src,name] of [[mil,'divisionRecruitPrice'],[mil,'countryDivisionRecruitPrice'],[agency,'revenueEstimate'],[agency,'budgetExpense']])vm.runInContext(get(src,name),ctx);
function price(diff,quality,id){ctx.aiChallenge=diff;return ctx.countryDivisionRecruitPrice(ctx.countries[id],quality)}
assert.equal(price('easy','militia',0),14);assert.equal(price('easy','militia',1),22);assert.equal(price('easy','elite',0),40);assert.equal(price('easy','elite',1),65);
assert.equal(price('medium','militia',0),15);assert.equal(price('medium','militia',1),30);assert.equal(price('hard','militia',1),25);assert.equal(price('hard','elite',1),75);
ctx.aiChallenge='easy';const easyIncome=ctx.revenueEstimate(c0),easyExpense=ctx.budgetExpense(c0),easyAIExpense=ctx.budgetExpense(c1);
ctx.aiChallenge='medium';const regIncome=ctx.revenueEstimate(c0),regExpense=ctx.budgetExpense(c0);
ctx.aiChallenge='hard';const hardIncome=ctx.revenueEstimate(c0),hardExpense=ctx.budgetExpense(c0),hardAIExpense=ctx.budgetExpense(c1);
assert(easyIncome>regIncome&&regIncome>hardIncome);assert(easyExpense<regExpense&&regExpense<hardExpense);assert(hardAIExpense<easyAIExpense);
assert(minimal.includes('stability:18,readiness:17'));assert(minimal.includes('stability:-12,readiness:-12'));
for(const name of ['peace_shenandoah.ogg','peace_america_beautiful.ogg','peace_yankee_doodle.ogg']){assert(snd.includes(name));assert(fs.statSync('music/'+name).size>100000)}
assert(snd.includes('war_johnny_comes_marching.ogg'));
console.log('PASS: Easy < Regular < Hard economy, AI pricing, player boosts, American soundtrack');
