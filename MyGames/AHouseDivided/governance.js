/* A House Divided — domestic politics, ideological trade-offs, and wartime economics. */
document.title='A House Divided | Alternate History Strategy';
document.querySelector('.brand h1').innerHTML='A HOUSE <em>DIVIDED</em>';
document.querySelector('.brand small').textContent='AN ALTERNATE HISTORY GRAND STRATEGY GAME';
document.querySelector('footer span:first-child').textContent='A HOUSE DIVIDED / COUNTERFACTUAL HISTORY LAB';
document.querySelector('.choice-kicker').textContent='A HOUSE DIVIDED / NEW CAMPAIGN';
document.querySelector('.fiction').textContent='SPECULATIVE HISTORY · NOT A FORECAST';
document.querySelector('.signal').textContent='◈ CAMPAIGN ENGINE';

// Keep one intentional path for each kind of decision: campaign choice on
// entry, governance in Command, diplomacy in Intel, military in Armies.
document.querySelector('.mode-shortcut')?.remove();
if(document.querySelector('#gameMode')?.closest('label'))document.querySelector('#gameMode').closest('label').hidden=true;
if(document.querySelector('#playerCountry')?.closest('label'))document.querySelector('#playerCountry').closest('label').hidden=true;
if(document.querySelector('.command .actions'))document.querySelector('.command .actions').hidden=true;
document.querySelector('.war-rail.right [data-open="powers"]')?.remove();
const governanceWorld=cards.world;
const rankingsCard=cards.powers;
rankingsCard.classList.remove('war-panel','left','right','open');
rankingsCard.classList.add('embedded-rankings');
rankingsCard.querySelector('.panel-close')?.remove();
governanceWorld.append(rankingsCard);
const oldWorldStatus=governanceWorld.querySelector('.stats');
if(oldWorldStatus)oldWorldStatus.style.marginBottom='18px';

const ideologies={
 republicanism:{label:'Republicanism',desc:'Representative institutions and regional compromise.',economy:1.04,army:1,stability:5,treasury:1,cohesion:1.12},
 liberal_democracy:{label:'Liberal democracy',desc:'Civil rights, political pluralism, and open commerce.',economy:1.12,army:.94,stability:5,treasury:1.08,cohesion:1.16},
 libertarianism:{label:'Libertarianism',desc:'Low taxation and a small state; weaker public services.',economy:1.24,army:.78,stability:-3,treasury:.72,cohesion:.89},
 social_democracy:{label:'Social democracy',desc:'Welfare and cohesion, with a larger public sector.',economy:1.04,army:.94,stability:9,treasury:.92,cohesion:1.14},
 communism:{label:'Communism',desc:'Central planning and organized mass mobilization.',economy:.78,army:1.28,stability:0,treasury:1.17,cohesion:.90},
 fascism:{label:'Fascism',desc:'Authoritarian ultranationalism and militarization; significant civic and economic costs.',economy:.76,army:1.32,stability:-11,treasury:.88,cohesion:.70},
 monarchy:{label:'Monarchy',desc:'Dynastic rule, continuity, and concentrated authority.',economy:.97,army:1.08,stability:4,treasury:1.01,cohesion:.98},
 technocracy:{label:'Technocracy',desc:'Expert-directed institutions emphasizing infrastructure.',economy:1.25,army:.96,stability:-2,treasury:1.1,cohesion:.95},
};
const ideologyKeys=Object.keys(ideologies);
const startingIdeologyLabel=document.createElement('label');
startingIdeologyLabel.id='startingIdeologyLabel';startingIdeologyLabel.hidden=true;
startingIdeologyLabel.innerHTML='Starting ideology<select id="startingIdeology"><option value="auto">Keep this country’s existing ideology</option>'+ideologyKeys.map(id=>'<option value="'+id+'">'+ideologies[id].label+'</option>').join('')+'</select>';
choiceOverlay.querySelector('#enterWorld').before(startingIdeologyLabel);
const existingModeChoices=choiceOverlay.querySelectorAll('[data-mode]');
for(const b of existingModeChoices)b.addEventListener('click',()=>{startingIdeologyLabel.hidden=b.dataset.mode!=='player'});
const priorEnterWorld=choiceOverlay.querySelector('#enterWorld').onclick;
choiceOverlay.querySelector('#enterWorld').onclick=()=>{
 const ideology=startingIdeologyLabel.querySelector('select').value;
 const countryId=+choiceOverlay.querySelector('#choiceNation').value;
 priorEnterWorld();
 if(choiceMode==='player'&&countries[countryId]&&ideologies[ideology]){
  countries[countryId].ideology=ideology;invalidate();update();
 }
};
const ideologyByRegion={northeast:['liberal_democracy','social_democracy','republicanism'],south:['republicanism','monarchy','libertarianism'],texas:['libertarianism','republicanism','monarchy'],pacific:['liberal_democracy','technocracy','social_democracy'],mountain:['libertarianism','republicanism','technocracy'],greatlakes:['social_democracy','technocracy','republicanism'],midwest:['republicanism','libertarianism','social_democracy']};
function initializePolitics(c){
 if(!c.ideology){const pool=ideologyByRegion[c.origin]||ideologyKeys;c.ideology=rand()<.76?choice(pool):choice(ideologyKeys)}
 if(c.baseEconomyFactor===undefined)c.baseEconomyFactor=1;
 if(c.recovery===undefined)c.recovery=0;
 if(c.warExhaustion===undefined)c.warExhaustion=0;
 if(c.governanceCooldown===undefined)c.governanceCooldown=-10000;
 if(c.ideologyCooldown===undefined)c.ideologyCooldown=-10000;
 if(c.populationLoss===undefined)c.populationLoss=0;
 if(c.industryBonus===undefined)c.industryBonus=0;
}
const rawCountryStats=countryStats;
countryStats=function(c){
 const base=rawCountryStats(c);if(!c)return base;
 initializePolitics(c);
 const policy=ideologies[c.ideology]||ideologies.republicanism;
 const economy=base.economy*policy.economy*c.baseEconomyFactor;
 const civicCapacity=(.48+.52*clamp(c.stability/75,.18,1.2))*(.65+.35*clamp(c.baseEconomyFactor,.45,1.8));
 const power=base.power*policy.army*civicCapacity*(1-Math.min(.65,c.warExhaustion/145));
 return {...base,economy,power};
};
const originalSetupCountry=setupCountry;
setupCountry=function(c){initializePolitics(c);originalSetupCountry(c)};

const govCommand=cards.command;
const govPanel=document.createElement('div');govPanel.id='governanceControls';govPanel.className='governance-controls';
govCommand.append(govPanel);
const govChoices=[
 {id:'tax',icon:'▤',label:'Raise taxes',cost:0,desc:'Treasury +35, economic productivity −3%, stability −4.',act:c=>{c.treasury+=35;c.baseEconomyFactor=clamp(c.baseEconomyFactor-.03,.45,1.8);c.stability-=4}},
 {id:'cut',icon:'◇',label:'Cut taxes',cost:35,desc:'Treasury −35, economic productivity +4%, stability +2.',act:c=>{c.baseEconomyFactor=clamp(c.baseEconomyFactor+.04,.45,1.8);c.stability+=2}},
 {id:'welfare',icon:'✚',label:'Fund public services',cost:28,desc:'Stability +7, population recovery, treasury −28.',act:c=>{c.stability+=7;c.recovery+=.00035;c.warExhaustion=Math.max(0,c.warExhaustion-3)}},
 {id:'infra',icon:'▥',label:'Build infrastructure',cost:40,desc:'Economic productivity +6%; treasury −40.',act:c=>{c.baseEconomyFactor=clamp(c.baseEconomyFactor+.06,.45,1.8)}},
 {id:'draft',icon:'⚔',label:'Enact conscription',cost:15,desc:'Strength +13 and fresh recruits; stability −6, economy −2%.',act:c=>{c.readiness=clamp(c.readiness+13,5,100);c.stability-=6;c.baseEconomyFactor=clamp(c.baseEconomyFactor-.02,.45,1.8);for(const a of ownedArmies(c.id))a.strength+=2}},
 {id:'demob',icon:'☮',label:'Demobilize',cost:0,desc:'Strength −12, treasury +14, stability +5.',act:c=>{c.readiness=clamp(c.readiness-12,5,100);c.treasury+=14;c.stability+=5}},
 {id:'reconcile',icon:'♧',label:'National reconciliation',cost:24,desc:'Stability +8, war exhaustion −7; treasury −24.',act:c=>{c.stability+=8;c.warExhaustion=Math.max(0,c.warExhaustion-7)}},
 {id:'research',icon:'⚙',label:'Invest in research',cost:50,desc:'Productivity +4%, military strength +4.',act:c=>{c.baseEconomyFactor=clamp(c.baseEconomyFactor+.04,.45,1.8);c.readiness=clamp(c.readiness+4,5,100)}}
];
let govFeedback='';
function renderGovernance(){
 if(gameMode!=='player'||humanId===null){govPanel.hidden=true;return}
 const c=countries[humanId];if(!c){govPanel.hidden=true;return}govPanel.hidden=false;
 initializePolitics(c);const st=countryStats(c),ide=ideologies[c.ideology];
 const income=revenueEstimate(c)-budgetExpense(c)-(c.nationalAgenda==='recovery'?1.25:0);
 const locked=daysElapsed-c.governanceCooldown<28;
 govPanel.innerHTML='<div class="gov-section-title">GOVERNMENT & IDEOLOGY</div><div class="ideology-title">'+ide.label+'</div><p class="gov-desc">'+ide.desc+'</p>'+
 '<div class="gov-metrics"><span><b>'+st.pop.toFixed(2)+'M</b> Population</span><span><b>'+Math.round(st.economy)+'</b> Economy</span><span><b>'+Math.round(st.power)+'</b> Power</span><span><b>'+Math.round(c.warExhaustion)+'</b> War fatigue</span></div>'+
 '<div class="gov-effects">Economy ×'+ide.economy.toFixed(2)+' · Military ×'+ide.army.toFixed(2)+' · Tax income ×'+ide.treasury.toFixed(2)+' · Cohesion '+(ide.cohesion>=1?'+':'')+Math.round((ide.cohesion-1)*100)+'% · Monthly balance '+(income>=0?'+':'')+income.toFixed(1)+'</div>'+
 '<label class="gov-ideology-label">Political system <select id="ideologySelect">'+ideologyKeys.map(id=>'<option value="'+id+'" '+(id===c.ideology?'selected':'')+'>'+ideologies[id].label+'</option>').join('')+'</select></label>'+
 '<button id="reformGov" class="gov-reform" '+(daysElapsed-c.ideologyCooldown<1095?'disabled':'')+'>Reform political system · 60 treasury / −12 stability</button>'+
 '<div class="gov-section-title">DOMESTIC DECISIONS <small>'+(locked?'Next decision in '+Math.ceil(28-(daysElapsed-c.governanceCooldown))+' days':'One decision per 28 days')+'</small></div>'+
 '<div class="gov-actions">'+govChoices.map(g=>'<button data-gov="'+g.id+'" '+(locked||c.treasury<g.cost?'disabled':'')+' title="'+g.desc+'"><b>'+g.icon+' '+g.label+'</b><small>'+g.desc+'</small></button>').join('')+'</div>'+
 (govFeedback?'<p class="gov-feedback">'+govFeedback+'</p>':'');
 const warsOfNation=typeof coalitionWars==='undefined'?[]:[...coalitionWars.values()].filter(w=>w.sides?.some(s=>s.includes(c.id))&&daysElapsed-w.started>=180);
 const levyAllowed=warsOfNation.some(w=>{const enemy=w.leaders.find(id=>id!==c.id);return enemy===undefined||typeof treatyMomentum!=='function'||treatyMomentum(c.id,enemy)<.3});
 const levyActive=(c.warTaxUntil||0)>daysElapsed;
 const levyButton=document.createElement('button');levyButton.id='warLevyButton';levyButton.className='gov-reform';levyButton.disabled=!levyAllowed||levyActive||daysElapsed<(c.lastWarTaxDay||-10000)+365;
 levyButton.textContent=levyActive?'War taxes active · '+Math.ceil((c.warTaxUntil-daysElapsed)/30)+' months remaining': 'Levy war taxes · +32% revenue for 12 months';
 levyButton.title='After six months of a contested war: temporary revenue bonus, but monthly stability, productivity and exhaustion penalties.';
 govPanel.append(levyButton);
 levyButton.onclick=()=>{if(!levyAllowed||levyActive)return;c.warTaxUntil=daysElapsed+365;c.lastWarTaxDay=daysElapsed;log(c.name+' levies emergency war taxes for a year.','warlog');update()};
 govPanel.querySelector('#reformGov').onclick=()=>{
  const target=govPanel.querySelector('#ideologySelect').value;
  if(target===c.ideology){govFeedback='Choose a different system first.';renderGovernance();return}
  if(c.treasury<60){govFeedback='Political reform requires 60 treasury.';renderGovernance();return}
  c.treasury-=60;c.stability=clamp(c.stability-12,5,99);c.ideology=target;c.ideologyCooldown=daysElapsed;
  govFeedback='Political transition enacted: '+ideologies[target].label+'.';log(c.name+' changes its political system to '+ideologies[target].label+'.');invalidate();update();
 };
 govPanel.querySelectorAll('[data-gov]').forEach(b=>b.onclick=()=>{
  const g=govChoices.find(x=>x.id===b.dataset.gov);
  if(!g||c.treasury<g.cost||daysElapsed-c.governanceCooldown<28)return;
  c.treasury-=g.cost;g.act(c);c.stability=clamp(c.stability,5,99);c.governanceCooldown=daysElapsed;
  govFeedback=g.label+' implemented. '+g.desc;log(c.name+': '+g.label.toLowerCase()+' program enacted.');invalidate();update();
 });
}

function nationalWarPressure(c){
 const activeWars=typeof coalitionWars==='undefined'?[]:[...coalitionWars.values()].filter(w=>w.sides?.some(side=>side.includes(c.id)));
 const duration=activeWars.length?Math.max(...activeWars.map(w=>Math.max(0,daysElapsed-w.started))):0;
 const economy=Math.max(0,1-(c.baseEconomyFactor||1));
 const stability=Math.max(0,45-(c.stability||65));
 const bankrupt=(c.treasury||0)<=0&&typeof recurringLedger==='function'&&recurringLedger(c).net<0;
 const occupied=Math.max(0,1-(countryStats(c).holdings.length/Math.max(1,c.initialCount||countryStats(c).holdings.length)));
 const crisis=clamp(Math.max(0,economy-.16)*5+stability/42+(bankrupt?.6:0)+Math.max(0,occupied-.12)*2.5,0,2.5);
 // No automatic exhaustion from merely being at war for a few months.
 const durationPressure=duration<730?0:duration<1095?.28:duration<1460?.65:1.05;
 // A stable, solvent country can withstand years of a manageable conflict.
 // Early exhaustion is reserved for actual economic, territorial or civic crises.
 const resilience=clamp(((c.stability||65)-40)/70,0,.6);
 return {duration,crisis,monthly:(durationPressure+crisis*.8)*(1-resilience)};
}
function evolveDomesticEconomy(days){
 if(!days||!geomReady)return;
 const months=days/30.44;
 for(const c of validCountries()){
  initializePolitics(c);
  const ide=ideologies[c.ideology],inWar=enemies(c.id).length>0;
  const loss=clamp((inWar?.00040:.000008)*months*(.75+c.warExhaustion/95),0,.009);
  const recovery=clamp((inWar?0:.000045+c.recovery)*months,0,.004);
  const holdings=rawCountryStats(c).holdings;
  for(const t of holdings)t.p=Math.max(.00001,t.p*(1-loss+recovery));
  c.populationLoss+=rawCountryStats(c).pop*loss;
  c.warExhaustion=clamp(c.warExhaustion+(inWar?nationalWarPressure(c).monthly:-1.1)*months,0,100);
  c.baseEconomyFactor=clamp(c.baseEconomyFactor+((inWar?-.0025:.0013)*months),.45,1.8);
  c.recovery=Math.max(0,c.recovery-.000008*months);
  c.stability=clamp(c.stability+((ide.stability/120)-(inWar?.3:0)-c.warExhaustion/450)*months,5,99);
  c.readiness=clamp(c.readiness+(inWar?-.25:.13)*months,5,100);
  // Representation and regional coherence matter in diverse successor states;
  // group membership alone never implies instability.
  c.stability=clamp(c.stability+(ide.cohesion-1)*.14*months,5,99);
  if(gameMode==='player'&&c.id===humanId)continue;
  if(chance(.5,days)){
   const decisions=govChoices.filter(g=>c.treasury>=g.cost);
   if(decisions.length){
    let weights=decisions;
    if(inWar)weights=decisions.filter(g=>['draft','reconcile','tax','infra'].includes(g.id));
    else if(c.stability<52)weights=decisions.filter(g=>['welfare','reconcile','demob'].includes(g.id));
    else if(c.baseEconomyFactor<.93)weights=decisions.filter(g=>['cut','infra','research','tax'].includes(g.id));
    const g=choice(weights.length?weights:decisions);
    c.treasury-=g.cost;g.act(c);c.stability=clamp(c.stability,5,99);
    if(rand()<.12)log(c.name+' adopts a '+g.label.toLowerCase()+' policy.');
   }
  }
 }
 invalidate();
}
const precedingDomesticTick=simulatePeriod;
simulatePeriod=function(){
 const before=daysElapsed;
 precedingDomesticTick();
 if(daysElapsed>before){evolveDomesticEconomy(daysElapsed-before);update()}
};
tick=simulatePeriod;
const precedingDomesticUpdate=update;
update=function(){precedingDomesticUpdate();if(!timer||+interval.value>100||Date.now()-lastArmyRender<50)renderGovernance()};
const precedingDomesticGenerate=generate;
generate=function(reuse=false){
 govFeedback='';precedingDomesticGenerate(reuse);
 if(!geomReady)return;
 for(const c of countries)initializePolitics(c);
 invalidate();update();
};

// Existing button handlers capture the global simulatePeriod dynamically.
// Opening a new campaign always starts with a fully recomputed ideology set.
renderGovernance();
