/* A House Divided v2.0.1 — wartime civic measures and Military-only manpower. */
(function(){
 'use strict';
 const policyDefs={
  warTaxes:{title:'Levy War Taxes',description:'+20% tax revenue; −3 stability on activation, −0.20 stability per month.'},
  warProduction:{title:'War Production',description:'Recruit divisions 15% cheaper; −10% tax revenue while active.'},
  propaganda:{title:'National Propaganda',description:'+0.25 stability and −0.5 war exhaustion per month; costs 8 treasury/month.'}
 };
 const keys=Object.keys(policyDefs);
 function init(c){if(!c.emergencyMeasures)c.emergencyMeasures={warTaxes:false,warProduction:false,propaganda:false};return c.emergencyMeasures;}
 function inWar(c){return typeof enemies==='function'&&enemies(c.id).length>0;}
 function syncWar(c){
  const flags=init(c);
  if(!inWar(c)){
   if(keys.some(k=>flags[k])){
    for(const k of keys)flags[k]=false;
    if(typeof log==='function')log(c.name+' ends its emergency wartime measures upon peace.','peace');
   }
   c.emergencyWarStarted=null;
   c.warTaxUntil=0; // clear legacy timed taxes
   return 0;
  }
  if(c.emergencyWarStarted===undefined||c.emergencyWarStarted===null)c.emergencyWarStarted=daysElapsed;
  // Coalesces all simultaneous wars into one continuous mobilization period.
  return Math.max(0,daysElapsed-c.emergencyWarStarted);
 }
 function canAct(c){return syncWar(c)>=180&&inWar(c);}
 function setMeasure(c,key,enabled){
  if(!policyDefs[key])return false;
  const flags=init(c);
  syncWar(c);
  if(enabled&&!canAct(c))return false;
  if(!!flags[key]===!!enabled)return true;
  flags[key]=!!enabled;
  if(enabled&&key==='warTaxes')c.stability=clamp(c.stability-3,5,99);
  if(typeof log==='function')log(c.name+(enabled?' activates ':' ends ')+policyDefs[key].title.toLowerCase()+'.','warlog');
  return true;
 }
 // Called by advanceCabinet after the monthly treasury ledger is settled.
 window.updateEmergencyMeasures=function(c,months){
  const elapsed=syncWar(c),flags=init(c);
  if(!inWar(c))return;
  const hardAI=typeof aiChallenge!=='undefined'&&aiChallenge==='hard'&&
   gameMode==='player'&&c.id!==humanId;
  if(hardAI&&elapsed>=180){
   // Only the Hard AI uses these policies; measured by finances and war pressure.
   const ledger=recurringLedger(c);
   if(!flags.warTaxes&&ledger.net<-2&&c.stability>34)setMeasure(c,'warTaxes',true);
   if(!flags.warProduction&&c.treasury>35&&c.stability>40&&ownedArmies(c.id).length<12)setMeasure(c,'warProduction',true);
   if(!flags.propaganda&&c.treasury>65&&((c.warExhaustion||0)>22||c.stability<43))setMeasure(c,'propaganda',true);
   if(flags.propaganda&&c.treasury<15)setMeasure(c,'propaganda',false);
  }
  if(flags.warTaxes)c.stability=clamp(c.stability-.20*months,5,99);
  if(flags.warProduction)c.readiness=clamp(c.readiness+.10*months,5,100);
  if(flags.propaganda){
   c.stability=clamp(c.stability+.25*months,5,99);
   c.warExhaustion=Math.max(0,(c.warExhaustion||0)-.5*months);
  }
 };
 window.houseDividedEmergency= {init,syncWar,canAct,setMeasure};

 // Correct displayed and charged recruiting price, for human and Hard AI alike.
 const priorRecruitPrice=divisionRecruitPrice;
 divisionRecruitPrice=function(quality){
  const base=priorRecruitPrice(quality),c=countries?.[humanId];
  return c?.emergencyMeasures?.warProduction&&gameMode==='player'?Math.ceil(base*.85):base;
 };
 const priorCountryPrice=countryDivisionRecruitPrice;
 countryDivisionRecruitPrice=function(c,quality){
  const original=priorCountryPrice(c,quality);
  // The human price has already been adjusted by divisionRecruitPrice.
  if(gameMode==='player'&&c?.id===humanId)return original;
  return c?.emergencyMeasures?.warProduction?Math.ceil(original*.85):original;
 };

 // Add a single compact section to the existing Government panel.
 const oldGovernance=renderGovernance;
 renderGovernance=function(){
  oldGovernance();
  const area=document.getElementById('governanceControls');
  const c=countries?.[humanId];
  if(!area||gameMode!=='player'||!c)return;
  const elapsed=syncWar(c),eligible=canAct(c),flags=init(c);
  const box=document.createElement('section');box.className='war-emergency-section';
  const reason=!inWar(c)?'Requires an active war (at least six months)'
   :!eligible?'Available after six months of war · '+Math.ceil((180-elapsed)/30.44)+' months remaining'
   :'Active war · wartime measures available';
  box.innerHTML='<div class="gov-section-title">EMERGENCY GOVERNMENT MEASURES</div>'+
   '<p class="emergency-context">'+reason+'. All measures automatically end when the war ends.</p>'+
   keys.map(key=>{
    const p=policyDefs[key],checked=flags[key],disabled=!eligible&&!checked;
    return '<label class="emergency-measure"><span><strong>'+p.title+'</strong><small>'+p.description+'</small></span>'+
     '<input type="checkbox" data-emergency="'+key+'" '+(checked?'checked ':'')+(disabled?'disabled':'')+'></label>';
   }).join('');
  area.append(box);
  box.querySelectorAll('[data-emergency]').forEach(el=>{
   el.onchange=()=>{
    if(setMeasure(c,el.dataset.emergency,el.checked)){
     if(typeof invalidate==='function')invalidate();
     renderGovernance();renderCabinet(true);
     if(typeof refreshFinances==='function')refreshFinances();
    }else el.checked=!el.checked;
   };
  });
 };

 // Recruitable manpower and its policy belong exclusively in the Military tab.
 const priorFrontRender=renderNationalFront;
 renderNationalFront=function(){
  priorFrontRender();
  const c=countries?.[humanId],panel=typeof frontSection!=='undefined'?frontSection:null;
  if(!panel||!c||gameMode!=='player')return;
  initManpower(c);
  const wait=recruitmentChangeDays(c),rate=recruitmentRate(c);
  const section=document.createElement('section');section.className='military-recruitment-policy';
  section.innerHTML='<strong>RECRUITMENT POLICY</strong><label>Recruitable share of eligible population '+
   '<select id="militaryRecruitmentPolicy" '+(wait?'disabled':'')+'>'+Object.entries(recruitmentPolicies).map(([value,p])=>
    '<option value="'+value+'" '+(+value===rate?'selected':'')+'>'+value+'% · '+p.name+'</option>').join('')+'</select></label>'+
    '<small>'+recruitmentPolicy(c).description+(wait?' · Can change again in '+wait+' days':' · Changes locked for 90 days')+'</small>';
  const recruitTitle=Array.from(panel.querySelectorAll('.front-mix-title')).find(n=>n.textContent.trim()==='RECRUIT DIVISION');
  if(recruitTitle)recruitTitle.before(section);else panel.prepend(section);
  section.querySelector('select').onchange=ev=>{
   if(setRecruitmentRate(c,ev.target.value)){
    log(c.name+' sets recruitment policy to '+recruitmentRate(c)+'%.');
    renderNationalFront();renderCabinet(true);
    if(typeof refreshFinances==='function')refreshFinances();
   }
  };
 };

 // Remove the old agenda markup if an older UI layer inserts it again.
 const oldCabinet=renderCabinet;
 renderCabinet=function(force){oldCabinet(force);
  const root=document.getElementById('cabinetBody');if(!root)return;
  for(const heading of root.querySelectorAll('.cabinet-section')){
   if(!/NATIONAL PRIORITY/i.test(heading.textContent))continue;
   heading.remove();
   for(const id of ['cabinetAgenda','cabinetAgendaDescription','setAgenda'])document.getElementById(id)?.remove();
  }
 };
})();
