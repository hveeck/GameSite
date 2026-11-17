const fs=require('fs'),vm=require('vm'),assert=require('assert');
function setup(difficulty){
 const c={id:1,name:'Testland',treasury:50,stability:75,baseEconomyFactor:1,publicDebt:0};
 const context={console,Math,window:null,document:{getElementById(){return null}},renderGovernance(){},countries:[null,c],humanId:1,gameMode:'watch',aiChallenge:difficulty,revenueEstimate(){return 20},clamp:(x,lo,hi)=>Math.min(hi,Math.max(lo,x)),log(){},invalidate(){},update(){}};
 context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('debt-bonds.js','utf8'),context);
 return {c,d:context.houseDividedDebt};
}
for(const difficulty of ['easy','medium','hard']){
 const {c,d}=setup(difficulty);
 assert.strictEqual(d.debtMetrics(c).interest,0);
 assert.strictEqual(d.issue(c,18).ok,true);
 assert.strictEqual(c.treasury,410);
 assert.strictEqual(c.publicDebt,360);
 assert(d.debtMetrics(c).interest>0);
 const baseline=d.debtMetrics(c).interest;
 const beforeStability=c.stability;
 d.evolve(c,12,0);
 if(difficulty!=='hard')assert.strictEqual(c.stability,beforeStability,'ordinary borrowing must not destabilize '+difficulty);
 assert.strictEqual(d.repay(c,'quarter').ok,true);
 assert(d.debtMetrics(c).interest<baseline);
 assert.strictEqual(d.issue(c,36).ok,true);
 assert.strictEqual(d.issue(c,36).ok,false);
 c.treasury=5;assert.strictEqual(d.repay(c,'all').ok,false);
}
const easy=setup('easy'),medium=setup('medium'),hard=setup('hard');
for(const item of [easy,medium,hard]){assert(item.d.issue(item.c,36).ok);item.d.evolve(item.c,12,0)}
assert(easy.d.debtMetrics(easy.c).interest<medium.d.debtMetrics(medium.c).interest);
assert(medium.d.debtMetrics(medium.c).interest<hard.d.debtMetrics(hard.c).interest);
assert(easy.d.debtMetrics(easy.c).taxPenalty<medium.d.debtMetrics(medium.c).taxPenalty);
assert(medium.d.debtMetrics(medium.c).taxPenalty<hard.d.debtMetrics(hard.c).taxPenalty);
assert.strictEqual(easy.c.stability,75);
assert(medium.c.stability<75&&hard.c.stability<medium.c.stability);
assert(easy.c.baseEconomyFactor>=medium.c.baseEconomyFactor&&medium.c.baseEconomyFactor>hard.c.baseEconomyFactor);
const compounded=setup('medium');compounded.d.issue(compounded.c,36);compounded.d.evolve(compounded.c,1,100);
assert(compounded.c.publicDebt>720,'unpaid debt interest should compound');
console.log('PASS debt borrowing, repayment, ceilings, stress and Easy/Regular/Hard progression');
