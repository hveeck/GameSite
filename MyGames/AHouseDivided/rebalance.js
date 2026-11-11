/* Short-session rules: fixed clock, one ledger, four cabinet strategies. */
timeUnit.value='week';interval.value='1000';syncStep();
document.getElementById('step')?.remove();
document.querySelector('#clockOptionsToggle')?.remove();
document.querySelector('#clockOptions')?.remove();
const clockHelp=document.createElement('span');clockHelp.className='fixed-clock-label';
clockHelp.textContent='';
clockHelp.hidden=true;
document.querySelector('.war-bottom .runrow')?.after(clockHelp);
const policyTemplates={
 balanced:{label:'Balanced government',desc:'Moderate services, industry and defense.',budget:{welfare:2,industry:2,defense:2,diplomacy:2},agenda:'prosperity'},
 growth:{label:'Economic development',desc:'Faster growth, weaker military and safety net.',budget:{welfare:1,industry:4,defense:1,diplomacy:1},agenda:'prosperity'},
 defense:{label:'National mobilization',desc:'Higher strength; sacrifices growth and services.',budget:{welfare:1,industry:1,defense:5,diplomacy:1},agenda:'defense'},
 unity:{label:'National reconciliation',desc:'Higher stability at the expense of defense.',budget:{welfare:4,industry:1,defense:1,diplomacy:3},agenda:'unity'}
};
const policyLevers={
 taxPolicy:{name:'Taxation',options:{low:{name:'Low',effect:'Revenue −20% · productivity +0.10%/month · stability +0.10/month'},normal:{name:'Moderate',effect:'Standard revenue · no additional growth or stability effect'},high:{name:'High',effect:'Revenue +25% · productivity −0.15%/month · stability −0.22/month'}}},
 militaryPolicy:{name:'Military funding',options:{low:{name:'Low',effect:'Army upkeep −25% · strength −0.45/month'},normal:{name:'Moderate',effect:'Standard army upkeep and strength'},high:{name:'High',effect:'Army upkeep +45% · strength +0.60/month'}}},
 authorityPolicy:{name:'Government authority',options:{decentralized:{name:'Decentralized',effect:'Stability +0.45/month · strength −0.30/month · local autonomy reduces rebellion risk'},balanced:{name:'Balanced',effect:'Normal stability, strength and rebellion risk'},centralized:{name:'Centralized',effect:'Strength +0.55/month · stability −0.50/month · unrest increases unless the government is well-funded, stable and militarily prepared'}}}
};
function projectedPolicyBalance(c,p){
 const savedBudget=c.budget,savedAgenda=c.nationalAgenda;
 c.budget=p.budget;c.nationalAgenda=p.agenda;
 const net=recurringLedger(c).net;
 c.budget=savedBudget;c.nationalAgenda=savedAgenda;
 return (net>=0?'+':'')+net.toFixed(1);
}
function renderSimpleGovernment(){
 const panel=document.getElementById('cabinetBody'),c=countries[humanId];
 if(!panel||gameMode!=='player'||!c)return;
 const l=recurringLedger(c),section=document.createElement('section');section.className='simple-government';
 const issue=c.stability<45?'Political stability is low. National reconciliation can help.':
  l.net<0?'Government is spending more than it earns. Reduce military upkeep or favor a balanced policy.':
  enemies(c.id).length&&c.readiness<50?'Your forces are at war but strength is low. Mobilization is worth considering.':
  c.treasury<45?'Your cash reserve is low. Let a positive budget rebuild it before new projects.':
  'Your government is functioning. Consider whether growth, unity, or strength matters most for your next campaign.';
 section.innerHTML='<div class="cabinet-section">NATIONAL GOVERNMENT <small>Choose independent spending levels below</small></div>'+
 '<p class="cabinet-muted">Income +'+l.revenue.toFixed(1)+' / month · Recurring costs −'+(l.civilAndArmy+l.priority).toFixed(1)+' / month · <b>Net '+(l.net>=0?'+':'')+l.net.toFixed(1)+'</b>. Weekly changes are proportional; investments and events are one-time.</p>'+
 '<p class="cabinet-muted">Set each department from 0–5. Every increase raises monthly costs; higher levels have diminishing benefits.</p>'+
 '<div class="cabinet-section">THREE NATIONAL LEVERS <small>Change anytime · effects accumulate gradually</small></div>'+
 '<div class="national-levers">'+Object.entries(policyLevers).map(([key,lever])=>{
   const value=c[key]||Object.keys(lever.options)[1];
   return '<label><b>'+lever.name+'</b><select data-national-lever="'+key+'">'+Object.entries(lever.options).map(([id,p])=>'<option value="'+id+'" '+(value===id?'selected':'')+'>'+p.name+'</option>').join('')+'</select><small>'+lever.options[value].effect+'</small></label>';
 }).join('')+'</div>'+
 '<div class="policy-advice"><b>YOUR CABINET ADVISES</b><span>'+issue+'</span></div>'+
 '<p class="cabinet-muted">Policies act continuously. Ideologies also affect tax income, production, military power and stability. One-time national projects remain available below.</p>';
 panel.prepend(section);
 section.querySelectorAll('[data-national-lever]').forEach(select=>select.onchange=()=>{
  c[select.dataset.nationalLever]=select.value;
  agencyNotice=policyLevers[select.dataset.nationalLever].name+' changed to '+policyLevers[select.dataset.nationalLever].options[select.value].name+'.';
  renderCabinet(true);refreshFinances();
 });
}
const priorShortCabinet=renderCabinet;
renderCabinet=function(force=false){priorShortCabinet(force);renderSimpleGovernment()};
const priorShortGenerate=generate;
generate=function(reuse=false){priorShortGenerate(reuse);if(geomReady)renderCabinet(true)};
const guide=document.querySelector('.play-guide');
if(guide){const clockLine=guide.querySelector('ol li:nth-child(2)');if(clockLine)clockLine.innerHTML='Press <b>Run</b> or <b>Space</b> to pause/resume. Each second advances one week. Generals and ministers execute routine actions.';
 const govLine=guide.querySelector('ol li:nth-child(3)');if(govLine)govLine.innerHTML='Open <b>Cabinet</b> to set one of four national policies. In <b>Military</b>, open war fronts. In <b>Diplomacy</b>, seek allies.';}
renderCabinet(true);

const ideologyTradeoffs={
 republicanism:['Reliable institutions, stability, regional compromise','No particular military or economic specialization'],
 liberal_democracy:['Trade, economic output, stability and regional cohesion','Slightly weaker military and lower tax collection'],
 libertarianism:['Fast-growing private economy and light government','Low tax revenue, weaker armies and cohesion'],
 social_democracy:['Public stability, social cohesion and resilient communities','Higher public costs and slightly weaker armies'],
 communism:['Mobilization, large armies and stronger tax collection','Lower economic output and weaker regional cohesion'],
 fascism:['Highest offensive military strength','Severe stability, cohesion and economic penalties; ideological isolation'],
 monarchy:['Stable continuity, modest military bonus and revenue','Slower economic output than republics and technocracies'],
 technocracy:['Highest economic output and productive administration','Limited popular legitimacy and slightly weaker cohesion']
};
const priorIdeologyRender=renderGovernance;
renderGovernance=function(){
 priorIdeologyRender();
 const panel=document.getElementById('governanceControls'),select=panel?.querySelector('#ideologySelect');
 if(!select)return;
 const guide=document.createElement('div');guide.className='ideology-guide';
 select.closest('label')?.after(guide);
 const explain=()=>{
  const id=select.value,p=ideologies[id],tradeoff=ideologyTradeoffs[id];
  if(!p||!tradeoff)return;
  guide.innerHTML='<b>'+p.label+(id===countries[humanId].ideology?' · Current system':' · Proposed system')+'</b>'+
   '<div><span class="good">GOOD FOR</span> '+tradeoff[0]+'</div>'+
   '<div><span class="bad">BAD FOR</span> '+tradeoff[1]+'</div>'+
   '<small>Economy '+Math.round(p.economy*100)+'% · Army '+Math.round(p.army*100)+'% · Tax income '+Math.round(p.treasury*100)+'% of standard. Stability influence '+(p.stability>=0?'+':'')+p.stability+' (slow monthly effect). Similar governments tend to cooperate; sharply opposed governments are more hostile.</small>';
 };
 select.addEventListener('change',explain);explain();
};
renderGovernance();

// Every dilemma has a consistent direction: opportunities offer three benefits;
// crises offer three different sacrifices. No free, strictly better escape.
const crisisChoices={
 'Labor unrest':[
  ['Pay for a negotiated settlement','Treasury −24',c=>{c.treasury-=24}],
  ['Let the strike continue','Economy −4%',c=>{c.baseEconomyFactor-=.04}],
  ['Impose emergency controls','Stability −7, strength −2',c=>{c.stability-=7;c.readiness-=2}]],
 'Refugee emergency':[
  ['Fund temporary shelters','Treasury −30',c=>{c.treasury-=30}],
  ['Ration existing services','Stability −6',c=>{c.stability-=6}],
  ['Redirect industrial capacity','Economy −3%, strength −2',c=>{c.baseEconomyFactor-=.03;c.readiness-=2}]],
 'Constitutional dispute':[
  ['Grant concessions to provinces','Strength −6',c=>{c.readiness-=6}],
  ['Convene an emergency assembly','Treasury −30',c=>{c.treasury-=30}],
  ['Centralize power temporarily','Stability −7',c=>{c.stability-=7}]],
 'Banking liquidity crisis':[
  ['Recapitalize threatened banks','Treasury −45',c=>{c.treasury-=45}],
  ['Allow credit markets to contract','Economy −6%',c=>{c.baseEconomyFactor-=.06}],
  ['Cut emergency public services','Stability −8',c=>{c.stability-=8}]],
 'Military procurement controversy':[
  ['Fund an independent audit','Treasury −20',c=>{c.treasury-=20}],
  ['Replace the general staff','Strength −8',c=>{c.readiness-=8}],
  ['Suppress the findings','Stability −8',c=>{c.stability-=8}]],
 'War weariness':[
  ['Fund veterans and relief','Treasury −35',c=>{c.treasury-=35}],
  ['Reduce frontline rotations','Strength −8',c=>{c.readiness-=8}],
  ['Demand continued sacrifice','Stability −7, exhaustion +5',c=>{c.stability-=7;c.warExhaustion+=5}]],
 'Civil liberties controversy':[
  ['Finance court oversight','Treasury −25',c=>{c.treasury-=25}],
  ['Limit internal security operations','Strength −6',c=>{c.readiness-=6}],
  ['Authorize intrusive policing','Stability −7',c=>{c.stability-=7}]],
 'Planning shortfalls':[
  ['Subsidize failing producers','Treasury −35',c=>{c.treasury-=35}],
  ['Accept reduced output','Economy −5%',c=>{c.baseEconomyFactor-=.05}],
  ['Enforce emergency rationing','Stability −7',c=>{c.stability-=7}]],
 'Legitimacy of the regime':[
  ['Buy support from provincial leaders','Treasury −30',c=>{c.treasury-=30}],
  ['Demobilize internal security forces','Strength −7',c=>{c.readiness-=7}],
  ['Refuse concessions','Stability −8',c=>{c.stability-=8}]],
 'Integration of conquered provinces':[
  ['Pay for a national integration program','Treasury −35',c=>{c.treasury-=35}],
  ['Devolve military administration','Strength −7',c=>{c.readiness-=7}],
  ['Delay political representation','Stability −9',c=>{c.stability-=9}]],
 'Postwar economic transition':[
  ['Support returning veterans','Treasury −35',c=>{c.treasury-=35}],
  ['Close obsolete military factories','Strength −7',c=>{c.readiness-=7}],
  ['Postpone civilian reconstruction','Economy −4%',c=>{c.baseEconomyFactor-=.04}]]
};
for(const event of nationalEvents){
 if(crisisChoices[event.name]){event.options=crisisChoices[event.name];event.tone='negative'}
 else event.tone='positive';
}
const chooseBalancedDilemma=createDilemma;
createDilemma=function(c){
 chooseBalancedDilemma(c);
 if(!agencyPending)return;
 const positive=agencyPending.event.tone==='positive';
 const heading=dilemma.querySelector('.choice-kicker');
 if(heading)heading.textContent=(positive?'NATIONAL OPPORTUNITY':'NATIONAL CRISIS')+' / '+dateLabel();
 const hint=dilemma.querySelector('.cabinet-muted');
 if(hint)hint.textContent=positive?'All three choices bring a benefit. Choose what your country needs most.':'Every response costs something. Choose which sacrifice your country can best afford.';
};
