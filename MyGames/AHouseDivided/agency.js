/* A House Divided — hands-on cabinet, development, and political dilemmas. */
let agencyNotice='',agencyPending=null,agencyLastRender=0,agencyEventCounter=0;
const agencyPrograms={
 roads:{name:'Transport network',cost:40,days:210,description:'County economic output +14%, industry +8%.',finish:(c,t)=>{t.e*=1.14;t.industryOutput*=1.08}},
 hospitals:{name:'Hospitals and housing',cost:32,days:180,description:'County population recovery and national stability.',finish:(c,t)=>{t.p*=1.012;c.stability=clamp(c.stability+3,5,99)}},
 factories:{name:'Industrial complex',cost:70,days:330,description:'County industry +30%, economy +8%.',finish:(c,t)=>{t.industryOutput*=1.3;t.e*=1.08}},
 energy:{name:'Energy development',cost:55,days:270,description:'Resource production +32% and economic growth.',finish:(c,t)=>{t.resourceOutput*=1.32;t.e*=1.045}},
 defenses:{name:'Fortified district',cost:38,days:135,description:'Entrench local armies and improve border fortifications.',finish:(c,t)=>{c.fort=clamp(c.fort+.035,0,.7);for(const a of ownedArmies(c.id).filter(x=>x.county===t.i))a.entrench=clamp(a.entrench+.4,0,1)}},
 academy:{name:'Officer academy',cost:48,days:240,description:'Military strength +9 and army experience.',finish:(c,t)=>{c.readiness=clamp(c.readiness+9,5,100);for(const a of ownedArmies(c.id))a.strength+=1}}
};
const cabinetBudgetAreas={
 welfare:{name:'Health & welfare',desc:'Stability and relief from war exhaustion'},
 industry:{name:'Industry & research',desc:'Productivity and long-run revenue growth'},
 defense:{name:'Defense & logistics',desc:'Monthly military strength improvements'},
 diplomacy:{name:'Administration & diplomacy',desc:'Stability and integration of conquered territory'}
};
function effectiveDepartmentFunding(level){
 const values=[0,1,1.85,2.6,3.3,3.9];
 return values[Math.max(0,Math.min(5,Math.round(level)||0))];
}
function initAgency(c){
 if(!c.budget)c.budget={welfare:1,industry:1,defense:1,diplomacy:1};
 if(!c.projects)c.projects=[];
 if(!c.nationalAgenda)c.nationalAgenda='prosperity';
 if(c.agendaCooldown===undefined)c.agendaCooldown=-2000;
 if(!c.relations)c.relations={};
 if(c.sanctionsUntil===undefined)c.sanctionsUntil=0;
}
const cabinet=document.createElement('section');
cabinet.className='card war-panel right cabinet-panel';cabinet.dataset.panel='cabinet';
cabinet.innerHTML='<button class="panel-close" aria-label="Close cabinet">×</button><div class="section-head"><span>NATIONAL CABINET</span><span>POLICY & DEVELOPMENT</span></div><div id="cabinetBody"></div>';
field.append(cabinet);cards.cabinet=cabinet;
cabinet.querySelector('.panel-close').onclick=()=>setPanel(null);
const cabinetButton=document.createElement('button');cabinetButton.dataset.open='cabinet';cabinetButton.title='Cabinet';cabinetButton.innerHTML='<span>▦</span>Cabinet';
cabinetButton.onclick=()=>setPanel(openPanel==='cabinet'?null:'cabinet');
document.querySelector('.war-rail.right').append(cabinetButton);

const cabinetAgendas={
 prosperity:{name:'Economic renewal',desc:'Invest in growth: +0.2% productivity monthly, reduced strength.'},
 unity:{name:'National unity',desc:'Reduce political instability and war exhaustion.'},
 defense:{name:'Defend the homeland',desc:'Stronger strength, slower economic expansion.'},
 recovery:{name:'Reconstruction',desc:'Faster peacetime recovery, with ongoing treasury costs.'}
};
function revenueEstimate(c){
 const s=countryStats(c);
 // Regular taxation and trade income scale with the economic base, but small
 // successor countries still have enough revenue to sustain basic government.
 const policy=typeof ideologies==='undefined'?null:(ideologies[c.ideology]||ideologies.republicanism);
 const taxMultiplier=policy?.treasury??1;
 const taxRate=({low:.8,normal:1,high:1.25})[c.taxPolicy]??1;
 // Conquered land increases tax receipts, but only its productive population and
 // industry contribute: empty territory is not an unlimited money generator.
 // Resource-bearing and industrial counties also generate taxable production,
 // so capturing a productive county has value beyond its raw headcount.
 const economicBase=2+Math.sqrt(Math.max(0,s.economy))*1.35+s.pop*.34+Math.sqrt(Math.max(0,s.resources||0))*.75+Math.sqrt(Math.max(0,s.industry||0))*.65;
 const fatigue=1-Math.min(.42,(c.warExhaustion||0)*.0042);
 const difficulty=typeof aiChallenge==='undefined'?'medium':aiChallenge;
 const playerDifficulty=gameMode==='player'&&c.id===humanId?(difficulty==='easy'?1.28:difficulty==='hard'?.82:1):1;
 const warLevy=(c.warTaxUntil||0)>daysElapsed?1.32:1;
 return economicBase*(1+c.industryBonus)*taxMultiplier*taxRate*fatigue*playerDifficulty*warLevy;
}
function recurringLedger(c){
 const revenue=revenueEstimate(c),civilAndArmy=budgetExpense(c),priority=c.nationalAgenda==='recovery'?1.25:0;
 return {revenue,civilAndArmy,priority,net:revenue-civilAndArmy-priority};
}
function budgetExpense(c){
 initAgency(c);
 const s=countryStats(c),base=Math.max(.65,s.economy/155);
 const civil=base*Object.values(c.budget).reduce((a,b)=>a+b,0)*.22;
 const active=typeof ownedArmies==='function'?ownedArmies(c.id):[];
 // Formations have ongoing pay, supply and wartime upkeep; raising troops is
 // affordable to an industrial state but maintaining a huge army is not free.
 const inWar=typeof enemies==='function'&&enemies(c.id).length>0;
 const militaryFunding=({low:.75,normal:1,high:1.45})[c.militaryPolicy]??1;
 const militaryBase=active.reduce((cost,a)=>cost+(.60+Math.max(0,a.strength)*.075)*(a.quality==='elite'?1.6:.55),0);
 const forceBurden=1+Math.max(0,active.length-8)*.03;
 const difficulty=typeof aiChallenge==='undefined'?'medium':aiChallenge;
 const difficultyCost=gameMode==='player'&&c.id===humanId?({easy:.55,medium:1.08,hard:1.40})[difficulty]:({easy:1.10,medium:1.18,hard:.88})[difficulty];
 const military=militaryBase*forceBurden*(inWar?1.4:1)*militaryFunding*difficultyCost;
 // Governing a sprawling country costs increasingly more, especially when its
 // new regions have not been integrated into the national institutions.
 const holdings=s.holdings?.length??(c.initialCount||0),core=Math.max(4,c.initialCount||holdings);
 const expansion=Math.max(0,holdings-core),unintegrated=1-(c.integration||0)*.65;
 const administration=(expansion*.012*unintegrated+Math.pow(expansion/160,1.3)*1.25)*(c.authorityPolicy==='centralized'?1.20:c.authorityPolicy==='decentralized'?.93:1);
 const empireServices=Math.max(0,s.pop-8)*.055;
 const overextension=typeof militaryPosture==='function'?militaryPosture(c):null;
 const oversized=overextension?.tier==='oversized'?military*.18:0;
 return civil+military+administration+empireServices+oversized;
}
function cabinetStatus(){
 const c=countries[humanId];if(gameMode!=='player'||!c||!countryStats(c).holdings.length)return '<p class="cabinet-muted">Choose a country in Play mode to open its national cabinet.</p>';
 initAgency(c);const s=countryStats(c),ledger=recurringLedger(c),net=ledger.net;
 const county=selectedCounty===null?null:territories[selectedCounty],owned=county?.owner===humanId;
 const selected=owned?county:null;
 return '<div class="cabinet-summary"><strong>'+c.treasury.toFixed(1)+'</strong><span>Treasury</span><strong class="'+(net<0?'negative':'')+'">'+(net>=0?'+':'')+net.toFixed(2)+'</strong><span>Monthly balance</span><strong>'+Math.round(c.stability)+'</strong><span>Stability</span><strong>'+Math.round(c.readiness)+'</strong><span>Strength</span></div><p class="cabinet-muted">Monthly income +'+ledger.revenue.toFixed(1)+' · Government & military −'+ledger.civilAndArmy.toFixed(1)+(ledger.priority?' · Reconstruction −'+ledger.priority.toFixed(1):'')+'. At this rate a 7-day week changes treasury by '+(net*7/30.44>=0?'+':'')+(net*7/30.44).toFixed(2)+', excluding separate purchases, deals and events.</p>'+
 '<div class="cabinet-section">MONTHLY BUDGET <small>Changes take effect next advance</small></div><p class="cabinet-muted">Set each department from 0 (austerity) to 5 (maximum spending). Higher funding drains the treasury but produces stronger benefits.</p>'+
 Object.entries(cabinetBudgetAreas).map(([id,a])=>'<div class="budget-row"><div><strong>'+a.name+'</strong><small>'+a.desc+'</small></div><select data-budget="'+id+'">'+[0,1,2,3,4,5].map(n=>'<option value="'+n+'" '+(c.budget[id]===n?'selected':'')+'>'+n+' / 5</option>').join('')+'</select></div>').join('')+
 '<div class="cabinet-section">NATIONAL PRIORITY <small>Change once per year</small></div><select id="cabinetAgenda">'+Object.entries(cabinetAgendas).map(([id,a])=>'<option value="'+id+'" '+(c.nationalAgenda===id?'selected':'')+'>'+a.name+'</option>').join('')+'</select><p id="cabinetAgendaDescription" class="cabinet-muted">'+cabinetAgendas[c.nationalAgenda].desc+'</p>'+
 '<button id="setAgenda" '+(daysElapsed-c.agendaCooldown<365?'disabled':'')+'>Adopt national priority</button>'+
 (agencyNotice?'<div class="agency-notice">'+agencyNotice+'</div>':'');
}
function renderCabinet(force=false){
 if(!force&&timer&&+interval.value<=100&&Date.now()-agencyLastRender<350)return;
 agencyLastRender=Date.now();
 const body=$('cabinetBody');if(!body)return;
 body.innerHTML=cabinetStatus();
 const c=countries[humanId];if(gameMode!=='player'||!c)return;
 body.querySelectorAll('[data-budget]').forEach(s=>s.onchange=()=>{c.budget[s.dataset.budget]=+s.value;agencyNotice='Budget allocations updated.';renderCabinet(true)});
 const a=$('cabinetAgenda');if(a){
  a.onchange=()=>{$('cabinetAgendaDescription').textContent=cabinetAgendas[a.value].desc};
  $('setAgenda').onclick=()=>{
   if(daysElapsed-c.agendaCooldown<365)return;
   c.nationalAgenda=a.value;c.agendaCooldown=daysElapsed;agencyNotice='National priority: '+cabinetAgendas[a.value].name;log(c.name+' adopts '+cabinetAgendas[a.value].name.toLowerCase()+' as a national priority.');renderCabinet(true);
  };
 }
 const p=$('cabinetProject');if(p){
  p.onchange=()=>{$('projectDescription').textContent=agencyPrograms[p.value].description};
  $('startProject').onclick=()=>{
   const t=territories[selectedCounty??-1],program=agencyPrograms[p.value];
   if(!t||t.owner!==humanId||!program||c.projects.length>=3)return;
   if(c.treasury<program.cost){agencyNotice='Insufficient treasury for '+program.name+'.';renderCabinet(true);return}
   c.treasury-=program.cost;c.projects.push({id:++agencyEventCounter,type:p.value,county:t.i,remaining:program.days});
   agencyNotice=program.name+' begun in '+t.name+' County.';log(c.name+' starts '+program.name.toLowerCase()+' in '+t.name+' County.');renderCabinet(true);
  };
 }
 body.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>{
  const i=c.projects.findIndex(p=>p.id===+b.dataset.cancel);if(i<0)return;
  const project=c.projects.splice(i,1)[0];c.treasury+=Math.floor(agencyPrograms[project.type].cost*.2);
  agencyNotice='Construction canceled; 20% of its original cost recovered.';renderCabinet(true);
 });
}

// Additional diplomatic leverage is available directly after selecting a
// foreign country on the map. The relationship score influences treaty offers.
const precedingLeverageInspector=renderBilateral;
renderBilateral=function(){
 precedingLeverageInspector();
 const c=countries[humanId],other=diplomacyTarget();
 if(gameMode!=='player'||!c||!other||other.id===humanId||!countryStats(other).holdings.length)return;
 initAgency(c);
 const actions=relations.querySelector('.bilateral-actions');if(!actions)return;
 const goodwill=c.relations[other.id]||0;
 const canPressure=bordering(c.id,other.id)&&!atWar(c.id,other.id)&&daysElapsed>=(c.pressureUntil||0);
 const options=[
  ['aid','✚ Send foreign aid',c.treasury<25],
  ['sanction','▧ Economic sanctions',atWar(c.id,other.id)||daysElapsed<c.sanctionsUntil],
  ['demand','⚑ Demand border territory',!canPressure]
 ];
 const line=document.createElement('div');line.className='bilateral-extra';
 line.innerHTML='<small>RELATIONS: '+(goodwill>=0?'+':'')+Math.round(goodwill)+' · '+(goodwill>25?'Friendly':goodwill< -25?'Hostile':'Neutral')+'</small>'+
 options.map(([id,label,disabled])=>'<button data-leverage="'+id+'" '+(disabled?'disabled':'')+'>'+label+'</button>').join('');
 relations.append(line);
 line.querySelectorAll('[data-leverage]').forEach(b=>b.onclick=()=>{
  const act=b.dataset.leverage;
  if(act==='aid'){
   if(c.treasury<25)return;c.treasury-=25;other.stability=clamp(other.stability+4,5,99);
   c.relations[other.id]=clamp(goodwill+18,-100,100);c.stability=clamp(c.stability+1,5,99);
   actionNotice='Aid delivered. Relations improved by 18.';
   log(c.name+' sends humanitarian and financial assistance to '+other.name+'.','peace');
  }
  if(act==='sanction'){
   if(atWar(c.id,other.id)||daysElapsed<c.sanctionsUntil)return;
   other.baseEconomyFactor=clamp(other.baseEconomyFactor-.035,.45,1.8);
   c.baseEconomyFactor=clamp(c.baseEconomyFactor-.008,.45,1.8);
   c.relations[other.id]=clamp(goodwill-28,-100,100);c.sanctionsUntil=daysElapsed+365;
   actionNotice='Sanctions imposed. Their economy weakens, but your exporters also suffer.';
   log(c.name+' imposes economic sanctions on '+other.name+'.');
  }
  if(act==='demand'){
   if(!canPressure)return;
   const frontier=territories.filter(t=>t.owner===other.id&&countyGraph[t.i].some(j=>territories[j].owner===c.id));
   if(!frontier.length)return;
   frontier.sort((a,b)=>a.p-b.p);
   const target=frontier[0],ratio=countryStats(c).power/Math.max(.1,countryStats(other).power);
   const probability=clamp(.12+(ratio-1)*.12+goodwill/350,.04,.66);
   c.pressureUntil=daysElapsed+365;c.relations[other.id]=clamp(goodwill-18,-100,100);
   c.stability=clamp(c.stability-2,5,99);
   if(rand()<probability){target.owner=c.id;invalidate();actionNotice=other.name+' cedes '+target.name+' County under pressure.';log(other.name+' cedes '+target.name+' County to '+c.name+' after an ultimatum.','warlog')}
   else{actionNotice=other.name+' refuses your territorial ultimatum.';log(other.name+' rejects '+c.name+'’s territorial demands.');if(rand()<.14&&!atWar(other.id,c.id)&&!alliance(other.id,c.id))war(other.id,c.id)}
  }
  invalidate();update();
 });
};

const nationalEvents=[
 {name:'Labor unrest',condition:c=>true,description:'Workers demand safer conditions and higher wages after months of turmoil.',options:[
  ['Negotiate a settlement','Treasury −24, stability +7',c=>{c.treasury-=24;c.stability+=7}],
  ['Permit a prolonged strike','Economy −4%, stability −3',c=>{c.baseEconomyFactor-=.04;c.stability-=3}],
  ['Use emergency powers','Strength −4, stability −8, treasury +12',c=>{c.readiness-=4;c.stability-=8;c.treasury+=12}]]},
 {name:'Refugee emergency',condition:c=>true,description:'Displaced civilians arrive from neighboring conflicts, straining housing and health services.',options:[
  ['Fund emergency relief','Treasury −28, stability +6, population +0.2%',c=>{c.treasury-=28;c.stability+=6;for(const t of countryStats(c).holdings)t.p*=1.002}],
  ['Ask local authorities to cope','Stability −5',c=>{c.stability-=5}],
  ['Launch a national housing program','Treasury −45, population +0.4%, economy +1%',c=>{c.treasury-=45;c.baseEconomyFactor+=.01;for(const t of countryStats(c).holdings)t.p*=1.004}]]},
 {name:'Constitutional dispute',condition:c=>true,description:'Regional leaders contest the powers of the central government.',options:[
  ['Negotiate regional autonomy','Stability +8, strength −3',c=>{c.stability+=8;c.readiness-=3}],
  ['Call a constitutional convention','Treasury −30, stability +5, economy +1%',c=>{c.treasury-=30;c.stability+=5;c.baseEconomyFactor+=.01}],
  ['Assert emergency central control','Strength +4, stability −9',c=>{c.readiness+=4;c.stability-=9}]]},
 {name:'Banking liquidity crisis',condition:c=>true,description:'Regional banks face a shortage of credit and businesses threaten to close.',options:[
  ['Provide emergency financing','Treasury −45, economy +3%',c=>{c.treasury-=45;c.baseEconomyFactor+=.03}],
  ['Allow an orderly restructuring','Economy −6%, treasury +10',c=>{c.baseEconomyFactor-=.06;c.treasury+=10}],
  ['Create a public investment bank','Treasury −65, economy +5%, stability +2',c=>{c.treasury-=65;c.baseEconomyFactor+=.05;c.stability+=2}]]},
 {name:'Military procurement controversy',condition:c=>true,description:'An audit uncovers serious problems in military procurement.',options:[
  ['Investigate and reform','Treasury −15, stability +6, strength −3',c=>{c.treasury-=15;c.stability+=6;c.readiness-=3}],
  ['Replace senior commanders','Strength +5, stability −4',c=>{c.readiness+=5;c.stability-=4}],
  ['Ignore the audit','Stability −7, treasury +10',c=>{c.stability-=7;c.treasury+=10}]]},
 {name:'War weariness',condition:c=>enemies(c.id).length>0&&typeof nationalWarPressure==='function'&&(nationalWarPressure(c).duration>=730||nationalWarPressure(c).crisis>=.75||c.warExhaustion>=25),description:'Years of war or severe national hardship have exhausted families and regional politicians, who demand a plan to end the fighting.',options:[
  ['Fund veterans and relief','Treasury −35, exhaustion −12, stability +4',c=>{c.treasury-=35;c.warExhaustion-=12;c.stability+=4}],
  ['Promise a negotiated settlement','Exhaustion −7, strength −4',c=>{c.warExhaustion-=7;c.readiness-=4}],
  ['Intensify mobilization','Strength +8, exhaustion +9, stability −5',c=>{c.readiness+=8;c.warExhaustion+=9;c.stability-=5}]]}
];
const dilemma=document.createElement('div');dilemma.id='nationalDilemma';dilemma.className='national-dilemma';dilemma.hidden=true;document.body.append(dilemma);
let dilemmaWasRunning=false;
function createDilemma(c){
 const options=nationalEvents.filter(e=>e.condition(c));if(!options.length)return;
 agencyPending={countryId:c.id,event:choice(options)};dilemmaWasRunning=!!timer;stop();
 dilemma.hidden=false;const e=agencyPending.event;
 dilemma.innerHTML='<div class="dilemma-dialog"><div class="choice-kicker">CABINET EMERGENCY / '+dateLabel()+'</div><h2>'+e.name+'</h2><p>'+e.description+'</p><div class="dilemma-choices">'+e.options.map((o,i)=>{const cost=+(o[1].match(/Treasury −(\d+)/)?.[1]||0);return '<button data-decision="'+i+'" '+(c.treasury<cost?'disabled title="Insufficient treasury"':'')+'><b>'+o[0]+'</b><small>'+o[1]+'</small></button>'}).join('')+'</div><p class="cabinet-muted">The simulation is paused until you choose.</p></div>';
 dilemma.querySelectorAll('[data-decision]').forEach(b=>b.onclick=()=>{
  if(!agencyPending)return;
  const current=countries[agencyPending.countryId],action=agencyPending.event.options[+b.dataset.decision];
  if(!current||!action)return;
  action[2](current);current.stability=clamp(current.stability,5,99);current.readiness=clamp(current.readiness,5,100);
  current.warExhaustion=clamp(current.warExhaustion,0,100);current.baseEconomyFactor=clamp(current.baseEconomyFactor,.45,1.8);
  log(current.name+' responds to '+agencyPending.event.name.toLowerCase()+': '+action[0]+'.');
  agencyNotice=action[0]+' enacted.';agencyPending=null;dilemma.hidden=true;invalidate();update();
  if(dilemmaWasRunning&&!timer&&!(typeof importantOverlay!=='undefined'&&!importantOverlay.hidden))start();
  dilemmaWasRunning=false;
 });
}
function advanceCabinet(days){
 if(!days)return;
 const months=days/30.44;
 for(const c of validCountries()){
  initAgency(c);
  const budget=c.budget,b=Object.fromEntries(Object.entries(budget).map(([k,v])=>[k,v*months]));
  // Income and expenditure must both enter the real monthly ledger: previously
  // the UI estimated revenue but advances only deducted expenditure.
  const ledger=recurringLedger(c);
  const arrears=Math.max(0,-(c.treasury+ledger.net*months));
  const balanceCredit=Math.max(0,c.treasury+ledger.net*months)-c.treasury;
  c.treasury+=balanceCredit;
  c.lastRecurringCredit=balanceCredit;
  c.lastRecurringDays=days;
  // Insolvent states suffer readiness and supply penalties, not mysterious
  // permanent casualties while their soldiers are standing still.
  if(arrears>0){
   const stress=clamp(arrears/Math.max(1,ledger.civilAndArmy),.1,2);
   c.stability=clamp(c.stability-(1.3+stress)*months,5,99);
   c.readiness=clamp(c.readiness-(2+stress)*months,5,100);
   if(typeof ownedArmies==='function')for(const army of ownedArmies(c.id))army.supplyPenalty=Math.min(2,(army.supplyPenalty||0)+(.45+stress*.3)*months);
  }else if(typeof ownedArmies==='function'){
   for(const army of ownedArmies(c.id))army.supplyPenalty=Math.max(0,(army.supplyPenalty||0)-months*1.2);
  }
  if((c.warTaxUntil||0)>daysElapsed){
   c.stability=clamp(c.stability-1.45*months,5,99);
   c.baseEconomyFactor=clamp(c.baseEconomyFactor-.0025*months,.45,1.8);
   c.warExhaustion=clamp((c.warExhaustion||0)+.5*months,0,100);
  }
  const funding=c.treasury>0?1:.2;
  const spending=Object.fromEntries(Object.entries(c.budget).map(([key,level])=>[key,effectiveDepartmentFunding(level)*months]));
  c.stability=clamp(c.stability+(spending.welfare*.18+spending.diplomacy*.12-.30*months)*funding,5,99);
  c.baseEconomyFactor=clamp(c.baseEconomyFactor+(spending.industry*.00095-.001*months)*funding,.45,1.8);
  c.readiness=clamp(c.readiness+(spending.defense*.27-.35*months)*funding,5,100);
  c.integration=clamp((c.integration||0)+spending.diplomacy*.00015*funding,0,.58);
  // Three national levers are independent of the broad governing agenda.
  // Their regular budget effects are reflected above in recurringLedger().
  const taxEffects={low:{growth:.001,stability:.10},normal:{growth:0,stability:0},high:{growth:-.0015,stability:-.22}}[c.taxPolicy]||{growth:0,stability:0};
  c.baseEconomyFactor=clamp(c.baseEconomyFactor+taxEffects.growth*months,.45,1.8);
  c.stability=clamp(c.stability+taxEffects.stability*months,5,99);
  const militaryDrift={low:-.45,normal:0,high:.6}[c.militaryPolicy]??0;
  c.readiness=clamp(c.readiness+militaryDrift*months,5,100);
  const authorityEffects={decentralized:{stability:.45,readiness:-.30},balanced:{stability:0,readiness:0},centralized:{stability:-.50,readiness:.55}}[c.authorityPolicy]||{stability:0,readiness:0};
  c.stability=clamp(c.stability+authorityEffects.stability*months,5,99);
  c.readiness=clamp(c.readiness+authorityEffects.readiness*months,5,100);
  if(spending.welfare>0&&c.warExhaustion>0)c.warExhaustion=Math.max(0,c.warExhaustion-spending.welfare*.13*funding);
  // Player difficulty has a sustained political and mobilization effect,
  // not merely a one-time cash bonus. Keep these gradual so decisions still matter.
  if(gameMode==='player'&&c.id===humanId){
   const level=typeof aiChallenge==='undefined'?'medium':aiChallenge;
   if(level==='easy'){
    c.stability=clamp(c.stability+.50*months,5,99);
    c.readiness=clamp(c.readiness+.58*months,5,100);
    c.warExhaustion=Math.max(0,(c.warExhaustion||0)-.35*months);
   }else if(level==='hard'){
    c.stability=clamp(c.stability-.26*months,5,99);
    c.readiness=clamp(c.readiness-.22*months,5,100);
    c.warExhaustion=clamp((c.warExhaustion||0)+.12*months,0,100);
   }
  }
  if(c.nationalAgenda==='prosperity'){c.baseEconomyFactor=clamp(c.baseEconomyFactor+.002*months,.45,1.8);c.readiness=clamp(c.readiness-.1*months,5,100)}
  if(c.nationalAgenda==='unity'){c.stability=clamp(c.stability+.38*months,5,99);c.warExhaustion=Math.max(0,c.warExhaustion-.2*months)}
  if(c.nationalAgenda==='defense'){c.readiness=clamp(c.readiness+.38*months,5,100);c.baseEconomyFactor=clamp(c.baseEconomyFactor-.001*months,.45,1.8)}
  if(c.nationalAgenda==='recovery'&&!enemies(c.id).length)c.recovery+=.00002*months;
  for(const project of [...c.projects]){
   if(territories[project.county].owner!==c.id){c.projects.splice(c.projects.indexOf(project),1);log(c.name+' loses an unfinished construction project to territorial occupation.');continue}
   project.remaining-=days;
   if(project.remaining<=0){agencyPrograms[project.type].finish(c,territories[project.county]);c.projects.splice(c.projects.indexOf(project),1);log(c.name+' completes '+agencyPrograms[project.type].name.toLowerCase()+' in '+territories[project.county].name+' County.','peace')}
  }
 }
 // Cabinet interruptions should be rare, especially while watching years
 // pass in seconds. Important war alerts are handled separately.
 if(gameMode==='player'&&humanId!==null&&!agencyPending&&countryStats(countries[humanId]).holdings.length){
  const player=countries[humanId];
  if(player.lastCabinetEventDay===undefined)player.lastCabinetEventDay=0;
  const rapid=+interval.value<=100;
  const minimumGap=280;
  if(daysElapsed-player.lastCabinetEventDay>=minimumGap&&chance(.95,days)){
   player.lastCabinetEventDay=daysElapsed;createDilemma(player);
  }
 }
 invalidate();
}
const previousAgencyTick=simulatePeriod;
simulatePeriod=function(){const before=daysElapsed;previousAgencyTick();if(daysElapsed>before){advanceCabinet(daysElapsed-before);update()}};
tick=simulatePeriod;
const previousAgencyGenerate=generate;
generate=function(reuse=false){
 agencyNotice='';agencyPending=null;dilemma.hidden=true;previousAgencyGenerate(reuse);
 if(!geomReady)return;
 for(const c of countries)initAgency(c);
 renderCabinet(true);
};
const previousAgencyUpdate=update;
update=function(){previousAgencyUpdate();renderCabinet()};
// Changing map selection refreshes the construction target while paused.
document.querySelector('#map').addEventListener('click',()=>renderCabinet(true));
renderCabinet(true);
