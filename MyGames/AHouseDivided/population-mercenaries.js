/* Population, home recruitment, hired soldiers, and civic vulnerability. */
function coreRecruitCounties(id){return typeof territories==='undefined'?[]:territories.filter(t=>t.owner===id&&(t.coreOwner===id||countyIntegration(t)>=.97))}
function countyIntegration(t){if(!t)return 0;return t.coreOwner===t.owner?1:t.integrationForOwner===t.owner?Math.max(0,Math.min(1,t.integrationProgress||0)):0}
function integrationPressure(c){const held=countryStats(c).holdings;let foreign=0,unintegrated=0;for(const t of held){if(t.coreOwner===c.id)continue;foreign+=Math.max(.01,t.p);unintegrated+=Math.max(.01,t.p)*(1-countyIntegration(t));}return {foreign,unintegrated,ratio:unintegrated/Math.max(.01,countryStats(c).pop),count:held.filter(t=>t.coreOwner!==c.id&&countyIntegration(t)<.97).length};}
function divisionStartStrength(quality){return quality==='mercenary'?18:quality==='elite'?15:9}
function manpowerCost(quality,strength=divisionStartStrength(quality)){return quality==='mercenary'?0:Math.max(0,strength)*.00018}
function manpowerCapacity(c){const home=coreRecruitCounties(c.id).reduce((n,t)=>n+t.p,0);return .004+home*.012}
function initManpower(c){if(c.manpowerPool===undefined)c.manpowerPool=manpowerCapacity(c)*.75}
function resetManpower(c){c.manpowerPool=undefined;initManpower(c)}
function canSupplyManpower(c,quality,strength){if(!c)return false;initManpower(c);return quality==='mercenary'||c.manpowerPool+1e-9>=manpowerCost(quality,strength)}
function spendManpower(c,quality,strength){initManpower(c);if(quality==='mercenary')return;const cost=manpowerCost(quality,strength);c.manpowerPool=Math.max(0,c.manpowerPool-cost);const home=coreRecruitCounties(c.id),pop=home.reduce((n,t)=>n+t.p,0);if(pop)for(const t of home)t.p=Math.max(.00001,t.p-cost*t.p/pop);invalidate()}
const beforePopulationAdvance=advanceCabinet;
advanceCabinet=function(days){
 beforePopulationAdvance(days);
 if(days<=0||!geomReady)return;
 const months=days/30.44;
 for(const c of validCountries()){
  const difficulty=typeof aiChallenge==='undefined'?'medium':aiChallenge;
  const isPlayer=gameMode==='player'&&c.id===humanId;
  const budget=typeof initAgency==='function'?(initAgency(c),c.budget?.diplomacy||0):0;
  const baseRate=isPlayer?(difficulty==='easy'?.029:difficulty==='hard'?.004:.011):.013;
  const adminRate=baseRate+budget*(isPlayer&&difficulty==='hard'?.0013:.0023);
  for(const t of countryStats(c).holdings){
   if(t.coreOwner===c.id)continue;
   if(t.integrationForOwner!==c.id){t.integrationForOwner=c.id;t.integrationProgress=0;}
   // War and institutional collapse delay integration; heavy administrative funding speeds it.
   const peacePenalty=enemies(c.id).length?.55:1;
   const health=clamp((c.stability||50)/65,.35,1.2);
   t.integrationProgress=Math.min(1,(t.integrationProgress||0)+months*adminRate*peacePenalty*health);
  }
  initManpower(c);
  c.manpowerPool=Math.min(manpowerCapacity(c),c.manpowerPool+manpowerCapacity(c)*.014*months);
  if(!isPlayer)continue;
  const deficit=typeof recurringLedger==='function'?Math.max(0,-recurringLedger(c).net):0;
  const lowStability=Math.max(0,45-c.stability),exhausted=Math.max(0,(c.warExhaustion||0)-30);
  const occupation=integrationPressure(c);
  const civicPenalty=occupation.ratio*(difficulty==='easy'?.25:difficulty==='hard'?2.6:1.15);
  c.stability=clamp(c.stability-civicPenalty*months,5,99);
  if(difficulty==='hard'&&occupation.ratio>.28&&c.stability<45)c.readiness=clamp(c.readiness-.25*months,5,100);
  const stabilityDrift=(difficulty==='easy'?.12:difficulty==='hard'?.88:.47)*
     (deficit/Math.max(5,revenueEstimate(c))*.65+exhausted*.012+(c.treasury<=0?.5:0));
  c.stability=clamp(c.stability-stabilityDrift*months,5,99);
  c.readiness=clamp(c.readiness-(difficulty==='easy'?.10:difficulty==='hard'?.75:.40)*(lowStability*.018+deficit/Math.max(6,revenueEstimate(c))+.15*(c.treasury<=0?1:0))*months,5,100);
 }
};
const beforePopulationArmyDisplay=armyDisplay;
armyDisplay=function(){beforePopulationArmyDisplay();const c=countries[humanId];if(gameMode!=='player'||!c)return;
 const base=document.getElementById('armyCountry');initManpower(c);base.textContent+=' · '+Math.round(c.manpowerPool*1e6).toLocaleString()+' recruitable';};
const beforePopulationHud=update;
update=function(){beforePopulationHud();if(gameMode!=='player'||humanId===null)return;
 const c=countries[humanId];if(!c)return;
 const label=document.getElementById('armyCountry');if(label){initManpower(c);label.title='Recruitable population: '+Math.round(c.manpowerPool*1e6).toLocaleString()+' citizens. Recruitment requires home or fully integrated territory; occupied land cannot recruit. Mercenaries use no population.';}
};

// Make integration visible without adding extra clutter or another policy system.
const cabinetBeforeIntegrationStatus=cabinetStatus;
cabinetStatus=function(){
 const base=cabinetBeforeIntegrationStatus();
 if(gameMode!=='player'||humanId===null||!countries[humanId])return base;
 const c=countries[humanId],occupied=integrationPressure(c),hold=countryStats(c).holdings;
 const captured=hold.filter(t=>t.coreOwner!==c.id),integrated=captured.length?Math.round(100*(1-captured.reduce((n,t)=>n+(1-countyIntegration(t)),0)/captured.length)):100;
 const difficulty=typeof aiChallenge==='undefined'?'medium':aiChallenge;
 return base+'<div class="cabinet-section">REGIONAL INTEGRATION</div><p class="cabinet-muted">'+captured.length+' conquered counties · '+integrated+'% integrated · '+occupied.count+' still integrating. Unintegrated territory pays reduced taxes, cannot supply recruits, increases administrative costs and raises instability.'+(difficulty==='hard'?' Hard: particularly high rebellion risk.':'')+' Improve with Administration & diplomacy spending or the Regional integration initiative. Integration slows during war.</p>';
};
