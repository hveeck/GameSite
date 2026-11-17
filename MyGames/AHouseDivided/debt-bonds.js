/* A House Divided v2.0.4 - useful bond financing with difficulty-scaled debt risk. */
(function(){
 'use strict';
 function ensure(c){
  if(!Number.isFinite(c.publicDebt)||c.publicDebt<0)c.publicDebt=0;
  return c.publicDebt;
 }
 let calculating=false;
 function baseline(c){
  // Use debt-free revenue as the sizing benchmark; don't allow depressed income
  // to multiply lending amounts or hide the actual interest burden.
  ensure(c);
  calculating=true;
  try{return Math.max(2,revenueEstimate(c));}
  finally{calculating=false;}
 }
 // Debt is measured in months of normal, debt-free revenue.
 // On Easy a major bond issue should provide breathing room, not cripple a state.
 // Regular penalizes repeated overextension; Hard treats excessive leverage as risky.
 function difficultyFor(c){
  const selected=typeof aiChallenge==='undefined'?'medium':aiChallenge;
  return selected==='easy'||selected==='hard'?selected:'medium';
 }
 const TERMS={
  easy:{rate:.025,rateStart:35,rateSlope:.0015,rateExtra:.035,taxStart:42,taxSlope:.0007,taxCap:.025,stressStart:48,stressRate:.001,economyRate:.000012,issueStability:[0,0,0]},
  medium:{rate:.045,rateStart:18,rateSlope:.003,rateExtra:.10,taxStart:22,taxSlope:.0025,taxCap:.12,stressStart:28,stressRate:.006,economyRate:.000035,issueStability:[0,0,0]},
  hard:{rate:.07,rateStart:10,rateSlope:.0045,rateExtra:.17,taxStart:12,taxSlope:.005,taxCap:.27,stressStart:16,stressRate:.017,economyRate:.000085,issueStability:[0,1,2]}
 };
 function debtMetrics(c){
  const debt=ensure(c),base=baseline(c),difficulty=difficultyFor(c),rules=TERMS[difficulty];
  const leverage=debt/Math.max(2,base);
  const annualRate=rules.rate+Math.min(rules.rateExtra,Math.max(0,leverage-rules.rateStart)*rules.rateSlope);
  const interest=debt*annualRate/12;
  const taxPenalty=Math.min(rules.taxCap,Math.max(0,leverage-rules.taxStart)*rules.taxSlope);
  return {debt,base,leverage,annualRate,interest,taxPenalty,limit:base*60,difficulty};
 }
 function issue(c,months){
  const m=debtMetrics(c),amount=Math.max(15,Math.round(m.base*months));
  if(m.debt+amount>m.limit+0.0001)return {ok:false,message:'Debt ceiling reached. Repay existing bonds before issuing more.'};
  c.publicDebt+=amount;c.treasury+=amount;
  // On Easy/Regular financing itself is not destabilizing; debt strain is gradual.
  const penalty=TERMS[m.difficulty].issueStability[months===36?2:months===18?1:0];
  if(penalty)c.stability=clamp(c.stability-penalty,5,99);
  if(typeof log==='function')log(c.name+' issues '+amount+' treasury in government bonds. Interest payments increase.','warlog');
  return {ok:true,message:'Issued '+amount+' treasury of bonds. You can invest it now; monthly interest is '+debtMetrics(c).interest.toFixed(1)+'.'};
 }
 function repay(c,kind){
  const m=debtMetrics(c);
  if(m.debt<.01)return {ok:false,message:'There is no outstanding debt.'};
  let amount=kind==='all'?m.debt:kind==='quarter'?Math.min(m.debt,Math.max(1,m.debt*.25)):Math.min(m.debt,Math.max(1,m.debt*.10));
  amount=Math.round(amount*100)/100;
  if(c.treasury+0.0001<amount)return {ok:false,message:'Insufficient treasury to repay '+amount.toFixed(1)+'.'};
  c.treasury-=amount;c.publicDebt=Math.max(0,c.publicDebt-amount);
  if(typeof log==='function')log(c.name+' repays '+amount.toFixed(1)+' of its public debt.','peace');
  return {ok:true,message:'Repaid '+amount.toFixed(1)+' treasury. Future interest payments are lower.'};
 }
 function evolve(c,months,arrears){
  const m=debtMetrics(c);if(!m.debt||months<=0)return;
  // Monthly interest is already included in budgetExpense. Only unpaid interest
  // compounds, never the entire deficit from ordinary government spending.
  if(arrears>0)c.publicDebt+=Math.min(m.interest*months,arrears);
  const rules=TERMS[m.difficulty];
  const excess=Math.max(0,m.leverage-rules.stressStart);
  if(excess>0){
   c.stability=clamp(c.stability-excess*rules.stressRate*months,5,99);
   c.baseEconomyFactor=clamp(c.baseEconomyFactor-Math.min(.0035,excess*rules.economyRate)*months,.45,1.8);
  }
  // A default is serious on Hard, but not a duplicate penalty on Easy/Regular.
  if(m.difficulty==='hard'&&m.leverage>=45&&c.treasury<=0)c.stability=clamp(c.stability-.15*months,5,99);
 }
 window.houseDividedDebt={ensure,debtMetrics,issue,repay,evolve,isCalculating:()=>calculating};
 let notice='';
 const previousRender=renderGovernance;
 renderGovernance=function(){
  previousRender();
  const area=document.getElementById('governanceControls');
  const c=typeof humanId!=='undefined'&&humanId!==null?countries[humanId]:null;
  if(!area||gameMode!=='player'||!c)return;
  const m=debtMetrics(c);
  const box=document.createElement('section');box.className='debt-bonds-section';
  const offer=[6,18,36];
  const fmt=n=>Math.round(n*10)/10;
  box.innerHTML='<div class="gov-section-title">NATIONAL DEBT &amp; BONDS</div>'+
   '<div class="debt-bonds-stats"><div><small>OUTSTANDING DEBT</small><strong>'+fmt(m.debt)+'</strong></div>'+
   '<div><small>INTEREST / MONTH</small><strong>−'+fmt(m.interest)+'</strong></div>'+
   '<div><small>ANNUAL RATE</small><strong>'+Math.round(m.annualRate*1000)/10+'%</strong></div></div>'+
   '<p class="debt-bonds-explain">Borrow now for immediate treasury. Interest is paid monthly. Bonds fund armies and investment now. Interest is paid monthly; only excessive borrowing eventually strains revenue, growth, and stability. Easy loans are especially forgiving.</p>'+
   '<div class="debt-bonds-actions">'+offer.map(n=>{
     const cash=Math.max(15,Math.round(m.base*n)),disabled=m.debt+cash>m.limit;
     return '<button type="button" data-bond="'+n+'" '+(disabled?'disabled ':'')+'title="'+n+' months of current base tax revenue">Issue '+n+'-month bonds <b>+'+cash+'</b></button>';
    }).join('')+'</div>'+
   '<div class="debt-bonds-repay"><span>REPAY DEBT</span><button type="button" data-repay="tenth" '+(m.debt<.01?'disabled':'')+'>10%</button><button type="button" data-repay="quarter" '+(m.debt<.01?'disabled':'')+'>25%</button><button type="button" data-repay="all" '+(m.debt<.01?'disabled':'')+'>All</button></div>'+
   (notice?'<p class="debt-bonds-notice" role="status">'+notice+'</p>':'');
  // Insert directly ahead of the wartime measures so financial policy remains grouped.
  const wartime=area.querySelector('.war-emergency-section');
  if(wartime)wartime.before(box);else area.append(box);
  const apply=result=>{notice=result.message; if(result.ok){invalidate();if(typeof update==='function')update();}else renderGovernance();};
  box.querySelectorAll('[data-bond]').forEach(btn=>btn.onclick=()=>apply(issue(c,+btn.dataset.bond)));
  box.querySelectorAll('[data-repay]').forEach(btn=>btn.onclick=()=>apply(repay(c,btn.dataset.repay)));
 };
})();
