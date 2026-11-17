/* Population, home recruitment, hired soldiers, and civic vulnerability. */
function coreRecruitCounties(id){return typeof territories==='undefined'?[]:territories.filter(t=>t.owner===id&&(t.coreOwner===id||countyIntegration(t)>=.97))}
function countyIntegration(t){if(!t)return 0;return t.coreOwner===t.owner?1:t.integrationForOwner===t.owner?Math.max(0,Math.min(1,t.integrationProgress||0)):0}
function integrationPressure(c){const held=countryStats(c).holdings;let foreign=0,unintegrated=0;for(const t of held){if(t.coreOwner===c.id)continue;foreign+=Math.max(.01,t.p);unintegrated+=Math.max(.01,t.p)*(1-countyIntegration(t));}return {foreign,unintegrated,ratio:unintegrated/Math.max(.01,countryStats(c).pop),count:held.filter(t=>t.coreOwner!==c.id&&countyIntegration(t)<.97).length};}
function divisionStartStrength(quality){return quality==='mercenary'?20:quality==='elite'?15:9}
// One reserve, measured in millions. Policy changes its cap while preserving recruits already used.
const recruitmentPolicies={
 3:{name:'Limited',taxFactor:1.05,stability:.22,description:'+5% tax revenue · +0.22 stability/month'},
 5:{name:'Standard',taxFactor:1,stability:0,description:'Standard reserve · no recurring modifier'},
 10:{name:'Expanded',taxFactor:.94,stability:-.32,description:'−6% tax revenue · −0.32 stability/month'},
 15:{name:'Mobilized',taxFactor:.87,stability:-.75,description:'−13% tax revenue · −0.75 stability/month'}
};
const recruitmentReviewDays=90;
function recruitmentRate(c){
 // Translate former policies if an old session survives an update.
 const legacy={7:3,20:15};
 const current=Number(c.recruitmentRate);
 if(Object.hasOwn(legacy,current))return legacy[current];
 return Object.hasOwn(recruitmentPolicies,current)?current:c.manpowerExpanded?15:5;
}
function recruitmentPolicy(c){return recruitmentPolicies[recruitmentRate(c)]}
function recruitmentChangeDays(c){return Math.max(0,Math.ceil(recruitmentReviewDays-(daysElapsed-(c.recruitmentChangedAt??-Infinity))))}
function manpowerCost(quality,strength=divisionStartStrength(quality)){return quality==='mercenary'?0:Math.max(0,strength)*.00012}
// Recruitment capacity tracks integrated population gradually. Deployment locations
// still require homeland or a fully integrated recruiting center.
function recruitablePopulation(c){return countryStats(c).holdings.reduce((n,t)=>n+t.p*(t.coreOwner===c.id?1:Math.pow(countyIntegration(t),1.35)*.85),0)}
function manpowerCapacity(c){return recruitablePopulation(c)*recruitmentRate(c)/100}
function initManpower(c){
 if(c.manpowerUsed===undefined){
  // Older saves may have a reserve but no consumption ledger.
  c.manpowerUsed=c.manpowerPool===undefined?0:Math.max(0,recruitablePopulation(c)*(c.manpowerExpanded?.15:.05)-c.manpowerPool);
 }
 c.manpowerPool=Math.max(0,manpowerCapacity(c)-c.manpowerUsed);
}
function resetManpower(c){c.manpowerUsed=0;c.recruitmentRate=5;delete c.manpowerExpanded;delete c.recruitmentChangedAt;initManpower(c)}
function canSupplyManpower(c,quality,strength){if(!c)return false;initManpower(c);return quality==='mercenary'||c.manpowerPool+1e-9>=manpowerCost(quality,strength)}
function spendManpower(c,quality,strength){
 initManpower(c);if(quality==='mercenary')return;
 c.manpowerUsed+=manpowerCost(quality,strength);
 initManpower(c);
 if(typeof invalidate==='function')invalidate();
}
function returnManpower(c,amount){initManpower(c);c.manpowerUsed=Math.max(0,c.manpowerUsed-Math.max(0,amount));initManpower(c)}
function setRecruitmentRate(c,rate){
 rate=Number(rate);
 if(!Object.hasOwn(recruitmentPolicies,rate)||recruitmentRate(c)===rate||recruitmentChangeDays(c))return false;
 initManpower(c);
 c.recruitmentRate=rate;
 c.recruitmentChangedAt=daysElapsed;
 delete c.manpowerExpanded;
 initManpower(c);
 if(typeof invalidate==='function')invalidate();
 return true;
}
function reinforceDivision(c,division,amount){
 if(amount<=0||!canSupplyManpower(c,division.quality,amount))return;
 division.strength+=amount;
 spendManpower(c,division.quality,amount);
}
function planAiRecruitment(c){
 if(daysElapsed<recruitmentReviewDays||recruitmentChangeDays(c))return;
 const wartime=enemies(c.id).length>0;
 const usedShare=c.manpowerUsed/Math.max(.00001,recruitablePopulation(c));
 const exhausted=(c.warExhaustion||0)>45;
 const posture=militaryPosture(c);
 let rate=5;
 if(wartime&&c.stability>=48&&c.treasury>15){
  if(c.stability>=57&&!exhausted&&usedShare>=.085)rate=15;
  else if(usedShare>=.038)rate=10;
 }else if(!wartime&&posture.tier!=='underdefended'&&usedShare<.023){
  rate=3;
 }
 setRecruitmentRate(c,rate);
}
const beforePopulationAdvance=advanceCabinet;
advanceCabinet=function(days){
 beforePopulationAdvance(days);
 if(days<=0||!geomReady)return;
 const months=days/30.44;
 for(const c of validCountries()){
  const difficulty=typeof aiChallenge==='undefined'?'medium':aiChallenge;
  const isPlayer=gameMode==='player'&&c.id===humanId;
  const budget=typeof initAgency==='function'?(initAgency(c),c.budget?.diplomacy||0):0;
  const baseRate=isPlayer?(difficulty==='easy'?.038:difficulty==='hard'?.0065:.021):.017;
  const authority=c.authorityPolicy||'balanced';
  // Centralization integrates institutions quickly but aggravates dissent.
  // Decentralization integrates somewhat faster through local cooperation.
  const authoritySpeed=authority==='centralized'?1.35:authority==='decentralized'?1.15:1;
  const diplomacyRate=budget*(isPlayer&&difficulty==='hard'?.0015:.0025);
  const initiative=typeof programUses==='function'?Math.min(2,programUses(c,'integration')):0;
  const initiativeSpeed=1+initiative*.22;
  const adminRate=(baseRate+diplomacyRate)*authoritySpeed*initiativeSpeed;
  for(const t of countryStats(c).holdings){
   if(t.coreOwner===c.id)continue;
   if(t.integrationForOwner!==c.id){t.integrationForOwner=c.id;t.integrationProgress=0;}
   // Ideological neighbors share institutions; hostile former regimes resist.
   const former=countries[t.coreOwner];
   const ideological=typeof ideologyAffinity==='function'&&former?ideologyAffinity(c,former):.5;
   const similaritySpeed=clamp(.65+ideological*.7,.65,1.35);
   const peacePenalty=enemies(c.id).length?.82:1;
   const health=clamp((c.stability||50)/65,.35,1.2);
   t.integrationProgress=Math.min(1,(t.integrationProgress||0)+months*adminRate*similaritySpeed*peacePenalty*health);
  }
  // Growth and integration increase capacity without refilling recruits already spent.
  initManpower(c);
  const policy=recruitmentPolicy(c);
  c.stability=clamp(c.stability+policy.stability*months,5,99);
  if(!isPlayer&&typeof militaryPosture==='function')planAiRecruitment(c);
  if(!isPlayer)continue;
  const deficit=typeof recurringLedger==='function'?Math.max(0,-recurringLedger(c).net):0;
  const lowStability=Math.max(0,45-c.stability),exhausted=Math.max(0,(c.warExhaustion||0)-30);
  const occupation=integrationPressure(c);
  const authorityUnrest=c.authorityPolicy==='centralized'?2.1:c.authorityPolicy==='decentralized'?.58:1;
  const civicPenalty=occupation.ratio*authorityUnrest*(difficulty==='easy'?.22:difficulty==='hard'?2.6:.55);
  c.stability=clamp(c.stability-civicPenalty*months,5,99);
  if(difficulty==='hard'&&occupation.ratio>.28&&c.stability<45)c.readiness=clamp(c.readiness-.25*months,5,100);
  const stabilityDrift=(difficulty==='easy'?.12:difficulty==='hard'?.88:.28)*
     (deficit/Math.max(5,revenueEstimate(c))*.65+exhausted*.012+(c.treasury<=0?.5:0));
  c.stability=clamp(c.stability-stabilityDrift*months,5,99);
  c.readiness=clamp(c.readiness-(difficulty==='easy'?.10:difficulty==='hard'?.75:.25)*(lowStability*.018+deficit/Math.max(6,revenueEstimate(c))+.15*(c.treasury<=0?1:0))*months,5,100);
 }
};
const beforePopulationArmyDisplay=armyDisplay;
armyDisplay=function(){beforePopulationArmyDisplay();const c=countries[humanId];if(gameMode!=='player'||!c)return;
 const base=document.getElementById('armyCountry');initManpower(c);base.textContent+=' · '+Math.round(c.manpowerPool*1e6).toLocaleString()+' recruitable';};
const beforePopulationHud=update;
update=function(){beforePopulationHud();if(gameMode!=='player'||humanId===null)return;
 const c=countries[humanId];if(!c)return;
 const label=document.getElementById('armyCountry');if(label){initManpower(c);label.title='Recruitable population: '+Math.round(c.manpowerPool*1e6).toLocaleString()+' citizens. Recruits come gradually from integrated populations. Divisions spawn in homeland or fully integrated territory; mercenaries use no population.';}
};


