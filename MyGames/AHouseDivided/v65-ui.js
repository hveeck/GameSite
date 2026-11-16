/* Government overview and recruitment policy. */
function integrationPercent(c){
 const holdings=countryStats(c).holdings;
 const total=holdings.reduce((sum,t)=>sum+t.p,0);
 return total>0?Math.round(100*holdings.reduce((sum,t)=>sum+t.p*countyIntegration(t),0)/total):0;
}

const beforeGovernmentOverview=renderCabinet;
renderCabinet=function(force=false){
 if(!force&&timer&&+interval.value<=100&&Date.now()-agencyLastRender<350)return;
 beforeGovernmentOverview(force);
 const c=countries[humanId];
 cards.command.querySelector('.government-overview')?.remove();
 if(gameMode!=='player'||!c)return;
 const holdings=countryStats(c).holdings;
 if(!holdings.length)return;

 const overview=document.createElement('section');
 overview.className='government-overview';
 const militaryLabels={underdefended:'Underdefended',balanced:'Balanced',strong:'Strong',oversized:'Military state'};
 const metrics=[
  ['Territory',holdings.length.toLocaleString()+' counties'],
  ['Stability',Math.round(c.stability)+'/100'],
  ['Treasury',c.treasury.toFixed(1)+' <small class="treasury-net">'+(recurringLedger(c).net>=0?'+':'')+recurringLedger(c).net.toFixed(1)+'/month</small>'],
  ['War exhaustion',Math.round(c.warExhaustion||0)+'/100'],
  ['Military strength',militaryLabels[militaryPosture(c).tier]],
  ['Integrated',integrationPercent(c)+'%']
 ];
 overview.innerHTML='<dl class="government-metrics">'+metrics.map(([label,value])=>
  '<div><dt>'+label+'</dt><dd>'+value+'</dd></div>').join('')+'</dl>';
 commandBrief.before(overview);
};
