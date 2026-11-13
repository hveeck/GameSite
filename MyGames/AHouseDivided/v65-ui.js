/* v65: visible manpower and integration controls in the actual player interface.
   Historic v64 placed features in panels later replaced by minimal.js. */
(function () {
 'use strict';
 const $id = id => document.getElementById(id);
 const money = c => Math.max(0, Number(c.treasury)||0);
 const fmt = n => Math.round(n).toLocaleString('en-US');
 const current = () => gameMode === 'player' && humanId != null ? countries[humanId] : null;
 const integrationTargets = c => countryStats(c).holdings.filter(t => t.coreOwner !== c.id && countyIntegration(t) < .999);
 const weightedIntegration = t => Math.round(countyIntegration(t)*100);
 function manpowerHtml(c) {
  initManpower(c);
  return '<span class="v65-manpower-stat"><b>'+fmt(c.manpowerPool*1e6)+'</b> Recruitable population<small>'+ (c.manpowerExpanded?'Expanded · 21%':'Normal · 13%')+' of home and fully integrated population; no monthly refill</small></span>';
 }
 function renderPopulationStat() {
  const c=current();
  const metrics=$id('governanceControls')?.querySelector('.gov-metrics');
  if(!c || !metrics) return;
  const existing=metrics.querySelector('.v65-manpower-stat');
  if(existing) {existing.outerHTML=manpowerHtml(c);return;}
  metrics.querySelector('span')?.insertAdjacentHTML('afterend',manpowerHtml(c));
 }
 function renderIntegrationControls(which='government') {
  const c=current();
  const gov=which==='cabinet'?$id('cabinetBody'):$id('governanceControls');
  if(!c||!gov)return;
  const prefix=which==='cabinet'?'v65-cabinet-':'v65-';
  let wrap=$id(prefix+'integration-controls');
  if(wrap)wrap.remove();
  wrap=document.createElement('section');
  wrap.id=prefix+'integration-controls';wrap.className='v65-integration';
  const target=integrationTargets(c).sort((a,b)=>countyIntegration(a)-countyIntegration(b));
  const total=countryStats(c).holdings.filter(t=>t.coreOwner!==c.id).length;
  const cooldown=Math.max(0,(c.integrationActionUntil||0)-daysElapsed);
  const first=target.slice(0,100);
  const sel=target.length ? '<label class="v65-region-label">Prioritize a conquered county<select id="'+prefix+'region">'+first.map(t=>'<option value="'+t.i+'">'+t.name+', '+t.state+' · '+weightedIntegration(t)+'% integrated</option>').join('')+'</select></label>' : '';
  wrap.innerHTML='<div class="v65-section-heading">REGIONAL INTEGRATION</div>'+
   '<p><b>'+total+'</b> conquered counties · <b>'+target.length+'</b> not fully integrated. Newly conquered land earns reduced tax income and cannot provide regular recruits until integration reaches 97%.</p>'+
   (target.length ? sel+'<div class="v65-integration-actions">'+
    '<button type="button" id="'+prefix+'local-integration" '+(money(c)<35||cooldown?'disabled':'')+'>Integrate selected county · 35 treasury</button>'+
    '<button type="button" id="'+prefix+'national-integration" '+(money(c)<90||cooldown?'disabled':'')+'>National integration effort · 90 treasury</button></div>'+
    '<small>Local: +25 percentage points to one county. National: +8 points to every unintegrated county. Both provide faster progress than waiting for passive integration. 90-day decision cooldown.</small>' : '<p><b>All your counties are fully integrated.</b> Newly annexed land will appear here.</p>')+
    (cooldown?'<p class="v65-delay">Next integration decision in '+Math.ceil(cooldown)+' days.</p>':'');
  const metrics=gov.querySelector('.gov-metrics');
  if(metrics) metrics.after(wrap); else gov.append(wrap);
  wrap.querySelector('#'+prefix+'local-integration')?.addEventListener('click',()=>{
    if(money(c)<35||daysElapsed<(c.integrationActionUntil||0))return;
    const t=territories[Number($id(prefix+'region')?.value)];
    if(!t||t.owner!==c.id||t.coreOwner===c.id)return;
    if(t.integrationForOwner!==c.id){t.integrationForOwner=c.id;t.integrationProgress=0;}
    c.treasury-=35;t.integrationProgress=Math.min(1,countyIntegration(t)+.25);
    c.integrationActionUntil=daysElapsed+90;
    if(typeof log==='function')log(c.name+' finances local integration in '+t.name+'.');
    if(typeof invalidate==='function')invalidate();update();renderGovernance();renderCabinet(true);
  });
  wrap.querySelector('#'+prefix+'national-integration')?.addEventListener('click',()=>{
    if(money(c)<90||daysElapsed<(c.integrationActionUntil||0))return;
    const targets=integrationTargets(c);if(!targets.length)return;
    c.treasury-=90;
    for(const t of targets){if(t.integrationForOwner!==c.id){t.integrationForOwner=c.id;t.integrationProgress=0;}t.integrationProgress=Math.min(1,countyIntegration(t)+.08);}
    c.integrationActionUntil=daysElapsed+90;
    if(typeof log==='function')log(c.name+' launches a national program to integrate '+targets.length+' conquered counties.');
    if(typeof invalidate==='function')invalidate();update();renderGovernance();renderCabinet(true);
  });
 }
 const oldRenderGovernance=renderGovernance;
 renderGovernance=function(){oldRenderGovernance.apply(this,arguments);renderPopulationStat();renderIntegrationControls();};
 const oldUpdate=update;
 update=function(){oldUpdate.apply(this,arguments);renderPopulationStat();};
 const oldRenderNationalFront=renderNationalFront;
 renderNationalFront=function(){oldRenderNationalFront.apply(this,arguments);
  const select=$id('nationalQuality');
  if(select && ![...select.options].some(o=>o.value==='mercenary'))console.error('v65: mercenary recruitment option missing');
 };
 const oldRenderCabinet=renderCabinet;
 renderCabinet=function(){oldRenderCabinet.apply(this,arguments);
  const c=current(),root=$id('cabinetBody');if(!c||!root)return;
  let help=root.querySelector('.v65-integration-help');
  if(!help){help=document.createElement('p');help.className='cabinet-muted v65-integration-help';root.prepend(help);}
  initManpower(c);help.textContent='Recruitable population: '+fmt(c.manpowerPool*1e6)+' people. Regional integration below restores tax productivity and access to recruits in conquered counties.';
  renderIntegrationControls('cabinet');
 };
})();
