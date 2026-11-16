/* v71: one passive regional integration summary; no micromanagement. */
(function(){
 'use strict';
 const $id=id=>document.getElementById(id);
 const current=()=>gameMode==='player'&&humanId!=null?countries[humanId]:null;
 const fmt=n=>Math.round(n).toLocaleString('en-US');
 function manpowerHtml(c){initManpower(c);return '<span class="v65-manpower-stat"><b>'+fmt(c.manpowerPool*1e6)+'</b> Recruitable population<small>'+(c.manpowerExpanded?'Expanded · 21%':'Normal · 13%')+' of integrated population</small></span>';}
 function renderPopulationStat(){const c=current(),metrics=$id('governanceControls')?.querySelector('.gov-metrics');if(!c||!metrics)return;const existing=metrics.querySelector('.v65-manpower-stat');if(existing)existing.outerHTML=manpowerHtml(c);else metrics.querySelector('span')?.insertAdjacentHTML('afterend',manpowerHtml(c));}
 function renderIntegrationSummary(){
  const c=current(),root=$id('governanceControls');if(!c||!root)return;
  root.querySelectorAll('.v65-integration').forEach(e=>e.remove());
  const foreign=countryStats(c).holdings.filter(t=>t.coreOwner!==c.id);
  const total=foreign.length;
  const average=total?Math.round(100*foreign.reduce((n,t)=>n+countyIntegration(t)*Math.max(.01,t.p),0)/foreign.reduce((n,t)=>n+Math.max(.01,t.p),0)):100;
  const unfinished=foreign.filter(t=>countyIntegration(t)<.999).length;
  const el=document.createElement('section');el.className='v65-integration';
  el.innerHTML='<div class="v65-section-heading">REGIONAL INTEGRATION</div><p><b>'+average+'%</b> population-weighted integration · <b>'+unfinished+'</b> counties integrating</p><small>Automatic. Administration & diplomacy, authority, ideology and the Regional Integration initiative affect progress. Taxes and recruitable manpower grow with integration; poorly integrated regions increase unrest.</small>';
  root.append(el);
 }
 const priorGov=renderGovernance;
 renderGovernance=function(){priorGov.apply(this,arguments);renderPopulationStat();renderIntegrationSummary();};
 const priorUpdate=update;
 update=function(){priorUpdate.apply(this,arguments);renderPopulationStat();};
 const priorFront=renderNationalFront;
 renderNationalFront=function(){priorFront.apply(this,arguments);const sel=$id('nationalQuality');if(sel&&![...sel.options].some(o=>o.value==='mercenary'))console.error('mercenary option missing');};
})();
