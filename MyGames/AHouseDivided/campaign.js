/* Quick-command layer: three strategic departments, campaign fronts, and a readable decision history. */
const commandRail=document.querySelector('.war-rail.right');
for(const [id,label] of [['command','Government'],['armies','Military'],['intel','Diplomacy']]){
 const b=commandRail?.querySelector('[data-open="'+id+'"]');if(b){b.title=label;b.innerHTML='<span>'+({command:'♛',armies:'⚔',intel:'◇'}[id])+'</span>'+label}
}
commandRail?.querySelector('[data-open="cabinet"]')?.remove();
const campaignCabinet=cards.cabinet;
campaignCabinet.hidden=true;
const cabinetDestination=document.createElement('div');cabinetDestination.className='integrated-cabinet';
cards.command.append(cabinetDestination);
cabinetDestination.append($('cabinetBody'));
const commandBrief=document.createElement('div');commandBrief.className='campaign-brief';
cards.command.querySelector('#governanceControls')?.before(commandBrief);
const campaignHistory=[];
let campaignReportDay=0,campaignReportSnapshot=null;
// Context-specific dilemmas reinforce ideological and strategic differences.
nationalEvents.push(
 {name:'Civil liberties controversy',condition:c=>['republicanism','liberal_democracy','libertarianism','federalism'].includes(c.ideology),description:'A controversial emergency-security proposal divides your legislature and the public.',options:[
  ['Defend constitutional safeguards','Stability +6, strength −3',c=>{c.stability+=6;c.readiness-=3}],
  ['Accept temporary surveillance powers','Strength +6, stability −7',c=>{c.readiness+=6;c.stability-=7}],
  ['Fund independent oversight','Treasury −25, stability +9',c=>{c.treasury-=25;c.stability+=9}]]},
 {name:'Planning shortfalls',condition:c=>['communism','democratic_socialism'].includes(c.ideology),description:'Production ministries report shortages while industrial planners demand a national intervention.',options:[
  ['Decentralize production quotas','Economy +5%, stability −3',c=>{c.baseEconomyFactor+=.05;c.stability-=3}],
  ['Order emergency industrial mobilization','Strength +7, economy −3%',c=>{c.readiness+=7;c.baseEconomyFactor-=.03}],
  ['Expand consumer subsidies','Treasury −30, stability +8',c=>{c.treasury-=30;c.stability+=8}]]},
 {name:'Legitimacy of the regime',condition:c=>['fascism','military_junta','theocracy','monarchy'].includes(c.ideology),description:'After years of upheaval, influential regional leaders challenge how your government exercises authority.',options:[
  ['Negotiate a national charter','Treasury −30, stability +10, strength −3',c=>{c.treasury-=30;c.stability+=10;c.readiness-=3}],
  ['Expand internal security','Strength +6, stability −7',c=>{c.readiness+=6;c.stability-=7}],
  ['Offer provincial concessions','Stability +6, economy −2%',c=>{c.stability+=6;c.baseEconomyFactor-=.02}]]},
 {name:'Integration of conquered provinces',condition:c=>c.initialCount&&countryStats(c).holdings.length>c.initialCount*1.3,description:'Recently absorbed provinces demand representation and guarantees from your central government.',options:[
  ['Fund nationwide integration','Treasury −35, stability +9',c=>{c.treasury-=35;c.stability+=9}],
  ['Offer broad local autonomy','Stability +6, strength −5',c=>{c.stability+=6;c.readiness-=5}],
  ['Impose immediate central control','Strength +7, stability −10',c=>{c.readiness+=7;c.stability-=10}]]},
 {name:'Postwar economic transition',condition:c=>c.warExhaustion>25&&!enemies(c.id).length,description:'The fighting has ended, but military factories and displaced families need a peacetime future.',options:[
  ['Convert arms factories to industry','Economy +6%, strength −6',c=>{c.baseEconomyFactor+=.06;c.readiness-=6}],
  ['Fund veteran resettlement','Treasury −35, stability +8',c=>{c.treasury-=35;c.stability+=8}],
  ['Maintain wartime mobilization','Strength +5, stability −5',c=>{c.readiness+=5;c.stability-=5}]]}
);
function campaignSnapshot(c){const st=countryStats(c);return {pop:st.pop,economy:st.economy,counties:st.holdings.length,stability:c.stability,treasury:c.treasury}}
function addCampaignStory(title,detail){campaignHistory.unshift({date:dateLabel(),title,detail});campaignHistory.length=Math.min(campaignHistory.length,9)}
function signedDelta(n,digits=0){return (n>=0?'+':'')+n.toFixed(digits)}
function campaignReview(){
 const c=countries[humanId];if(gameMode!=='player'||!c||!countryStats(c).holdings.length)return;
 if(!campaignReportSnapshot){campaignReportSnapshot=campaignSnapshot(c);campaignReportDay=daysElapsed;return}
 if(daysElapsed-campaignReportDay<350)return;
 const now=campaignSnapshot(c),last=campaignReportSnapshot;
 addCampaignStory('Annual national review','Counties '+signedDelta(now.counties-last.counties)+' · Economy '+signedDelta(now.economy-last.economy,1)+' · Stability '+signedDelta(now.stability-last.stability)+' · Population '+signedDelta(now.pop-last.pop,2)+'M');
 campaignReportSnapshot=now;campaignReportDay=daysElapsed;
}
function renderCampaignStory(){
 const c=countries[humanId];if(gameMode!=='player'||!c){commandBrief.hidden=true;return}
 commandBrief.hidden=false;
 const st=countryStats(c);
 commandBrief.innerHTML='<div class="quick-section-title">YOUR NATIONAL STRATEGY</div><div class="quick-summary"><span>Territory <b>'+st.holdings.length+' counties</b></span><span>Stability <b>'+Math.round(c.stability)+'/100</b></span><span>Treasury <b>'+Math.round(c.treasury)+'</b></span></div><div class="quick-section-title">YOUR CAMPAIGN STORY <small>Major developments and consequences</small></div><div class="campaign-story">'+(campaignHistory.length?campaignHistory.slice(0,6).map(h=>'<div><small>'+h.date+'</small><strong>'+h.title+'</strong><span>'+h.detail+'</span></div>').join(''):'<p>Choose a strategy or launch an initiative. Progress reports appear here as time passes.</p>')+'</div>';
}
const originalCampaignLog=log;
log=function(message,type=''){
 originalCampaignLog(message,type);
 const own=countries[humanId];if(gameMode!=='player'||!own||!message.includes(own.name))return;
 if(/captures .* with a field army|forms a defense alliance|declares war|completes .*|launches .*|capitulates|adopts .* as a national priority|changes its political system/.test(message))addCampaignStory('National development',message);
};
const originalCampaignDilemma=createDilemma;
createDilemma=function(c){originalCampaignDilemma(c);if(!agencyPending)return;const event=agencyPending.event;
 dilemma.querySelectorAll('[data-decision]').forEach(b=>b.addEventListener('click',()=>{const option=event.options[+b.dataset.decision];if(option)addCampaignStory(event.name,option[0]+' · '+option[1])}));
};
// Keep national programs and the government preset together; advanced policy
// details remain available for players who want them, but do not dominate UI.
const underlyingGovernanceRender=renderGovernance;
renderGovernance=function(){underlyingGovernanceRender();const box=$('governanceControls');if(!box)return;
 if(!box.querySelector('.domestic-toggle')){
  const actions=box.querySelector('.gov-actions');if(actions){const toggle=document.createElement('button');toggle.className='domestic-toggle';toggle.textContent='More domestic policy options ▾';actions.before(toggle);actions.classList.toggle('collapsed',!window.houseAdvancedPolicies);toggle.onclick=()=>{window.houseAdvancedPolicies=!window.houseAdvancedPolicies;actions.classList.toggle('collapsed',!window.houseAdvancedPolicies);toggle.textContent=window.houseAdvancedPolicies?'Hide extra policies ▴':'More domestic policy options ▾'}}
 }
};
const underlyingNationCabinetRender=renderCabinet;
renderCabinet=function(force=false){underlyingNationCabinetRender(force);};
const campaignPickInfo=document.createElement('div');campaignPickInfo.id='campaignPickInfo';campaignPickInfo.className='pick-strategy-info';
$('mapPickName')?.after(campaignPickInfo);
function countryPickAssessment(c){
 const s=countryStats(c),active=validCountries(),rank=active.slice().sort((a,b)=>countryStats(b).power-countryStats(a).power).findIndex(x=>x.id===c.id)+1;
 const neighbors=active.filter(x=>x.id!==c.id&&bordering(c.id,x.id));
 const hostile=neighbors.filter(n=>ideologyAffinity(c,n)<.35||n.aggression>.7);
 const burden=hostile.length*1.5+Math.max(0,55-c.stability)/16+Math.max(0,rank-active.length*.4)/Math.max(6,active.length*.12);
 const difficulty=burden>5?'Very hard':burden>3.3?'Hard':burden>1.5?'Moderate':'Easy';
 const strengths=[s.pop>9?'Large population':null,s.economy>14?'Industrial base':null,c.stability>65?'Stable institutions':null,neighbors.length<=2?'Defensible geography':null].filter(Boolean);
 const weaknesses=[hostile.length>=3?'Many hostile neighbors':null,c.stability<45?'Fragile government':null,s.pop<1.2?'Small population':null,s.resources<3?'Limited resources':null].filter(Boolean);
 const recommendation=hostile.length>=3?'Secure alliances and reinforce your borders.':s.economy>14?'Develop industry and use your economic leverage.':c.stability<50?'Focus on national unity before expansion.':'Build strength, then pursue a diplomatic or military opportunity.';
 return '<div><b>Difficulty: '+difficulty+'</b> · '+ideologies[c.ideology]?.label+'</div><div><b>Strengths:</b> '+(strengths.join(' · ')||'Room to develop')+'</div><div><b>Risks:</b> '+(weaknesses.join(' · ')||'No overwhelming starting weakness')+'</div><div><b>Recommended:</b> '+recommendation+'</div>';
}
document.querySelector('#map')?.addEventListener('click',()=>{if(!mapCountryPick||pendingCountryId===null)return;const c=countries[pendingCountryId];if(c)campaignPickInfo.innerHTML=countryPickAssessment(c)},false);
const originalShowPick=showMapPick;
showMapPick=function(){originalShowPick();campaignPickInfo.innerHTML='<span>Choose a faction to compare its strengths, weaknesses, and difficulty.</span>'};

// One national priority replaces repetitive department-by-department sliders.
const originalQuickCabinet=renderCabinet;
renderCabinet=function(force=false){originalQuickCabinet(force);const body=$('cabinetBody');if(!body||gameMode!=='player')return;
 const monthlyTitle=[...body.querySelectorAll('.cabinet-section')].find(e=>e.textContent.includes('MONTHLY BUDGET'));
 if(monthlyTitle){monthlyTitle.hidden=false;let next=monthlyTitle.nextElementSibling;if(next?.classList.contains('cabinet-muted'))next.hidden=false;body.querySelectorAll('.budget-row').forEach(x=>x.hidden=false)}
 const agendaTitle=[...body.querySelectorAll('.cabinet-section')].find(e=>e.textContent.includes('NATIONAL PRIORITY'));
 if(agendaTitle){agendaTitle.hidden=true;for(const id of ['cabinetAgenda','cabinetAgendaDescription','setAgenda']){const el=$(id);if(el)el.hidden=true}}
 const preset=$('autoPreset'),apply=$('applyBudgetPreset'),toggle=$('toggleAutoCabinet');
 const syncStrategy=()=>{const c=countries[humanId];if(!c)return;const id=c.autoPreset;const agendas={balanced:'unity',growth:'prosperity',fortress:'defense',rebuild:'recovery'};c.nationalAgenda=agendas[id]||'unity'};
 if(apply){const prev=apply.onclick;apply.onclick=()=>{prev();syncStrategy();addCampaignStory('Government strategy','National direction changed to '+(countries[humanId]?.autoPreset||'balanced')+'.')}}
 if(toggle){const prev=toggle.onclick;toggle.onclick=()=>{prev();syncStrategy()}}
};

// The General Staff continually plans local advances within an overall war.
// Manual county routes are retained only as an optional advanced feature.
const frontSection=document.createElement('section');frontSection.className='national-front';
militaryPanel.querySelector('.army-actions')?.before(frontSection);
const advancedForces=document.createElement('details');advancedForces.className='advanced-forces';
advancedForces.innerHTML='<summary>Advanced: individual army orders</summary>';
for(const el of [militaryPanel.querySelector('.military-planner'),militaryPanel.querySelector('.army-actions'),militaryPanel.querySelector('#armyRoster')])if(el)advancedForces.append(el);
militaryPanel.append(advancedForces);
function frontTargets(c){return validCountries().filter(x=>x.id!==c.id&&bordering(c.id,x.id)&&!alliance(c.id,x.id))}
function frontArmyList(c){return ownedArmies(c.id).filter(a=>a.strength>0)}
function releaseFront(c,msg=''){if(!c?.frontOrder)return;for(const a of armies)if(a.owner===c.id&&a.frontOwner===c.id){a.route=[];a.plan=null;a.frontOwner=null;a.auto=false}c.frontOrder=null;if(msg){armyMessage=msg;addCampaignStory('Offensive canceled',msg)}}
function assignFrontRoutes(c){
 const f=c.frontOrder;if(!f)return;
 if(!atWar(c.id,f.target)||!countryStats(countries[f.target]).holdings.length){releaseFront(c,'The offensive has ended: peace or capitulation.');return}
 const available=frontArmyList(c).sort((a,b)=>b.strength-a.strength);
 const committed=Math.max(1,Math.ceil(available.length*f.commit));
 const selected=available.slice(0,committed),selectedIds=new Set(selected.map(a=>a.id));
 for(const a of available)if(a.frontOwner===c.id&&!selectedIds.has(a.id)){a.frontOwner=null;a.route=[];a.plan=null}
 const border=[];
 for(const t of territories){if(t.owner!==f.target)continue;const friendly=countyGraph[t.i].some(j=>territories[j].owner===c.id);if(friendly)border.push(t)}
 if(!border.length){f.message='No shared land frontier remains.';return}
 for(const a of selected){
  a.frontOwner=c.id;a.auto=false;
  if(a.route.length)continue;
  const candidates=border.map(t=>{const path=shortestCountyRoute(a.county,t.i,c.id,true);if(!path?.length)return null;
   const enemyArmies=armies.filter(x=>x.owner===f.target&&x.county===t.i).reduce((s,x)=>s+x.strength,0);
   const priority=f.strategy==='breakthrough'?-t.p*8:f.strategy==='cautious'?enemyArmies*4+t.p*.6:enemyArmies*1.5-t.p*2;
   return {t,path,score:priority+path.length*1.7+rand()*2}
  }).filter(Boolean).sort((a,b)=>a.score-b.score);
  if(candidates.length){a.route=candidates[0].path;a.plan={threshold:f.strategy==='cautious'?1.3:f.strategy==='breakthrough'?.84:1.03};a.travelDays=0}
 }
 f.message=selected.length+' formations assigned · '+border.length+' enemy frontier counties';
}
function renderNationalFront(){
 const c=countries[humanId];if(!frontSection||gameMode!=='player'||!c){frontSection.hidden=true;return}frontSection.hidden=false;
 const f=c.frontOrder,targets=frontTargets(c),enemiesList=targets.filter(x=>atWar(c.id,x.id));
 frontSection.innerHTML='<div class="quick-section-title">NATIONAL WAR PLAN</div><p>Choose a neighboring rival, commit part of your army and let your generals advance automatically. Plans persist until canceled or the war ends.</p><label>Objective <select id="frontTarget">'+targets.map(x=>'<option value="'+x.id+'" '+(f?.target===x.id?'selected':'')+'>'+x.name+(atWar(c.id,x.id)?' · at war':' · peace')+'</option>').join('')+'</select></label><div class="national-row"><label>Strategy<select id="frontStrategy"><option value="balanced">Balanced</option><option value="cautious">Cautious</option><option value="breakthrough">Aggressive breakthrough</option></select></label><label>Force commitment<select id="frontCommit"><option value=".35">35% · limited</option><option value=".65">65% · major</option><option value="1">100% · all in</option></select></label></div><div class="front-buttons"><button id="launchFront" '+(!targets.length?'disabled':'')+'>'+(f?'Replace offensive':'Launch offensive')+'</button><button id="stopFront" '+(!f?'disabled':'')+'>Cancel plan</button></div><button class="raise-national" id="raiseNationalForce" '+(c.treasury<25?'disabled':'')+'>＋ Recruit a formation nationally · 25 treasury</button><p class="front-status">'+(f?'ACTIVE: '+(countries[f.target]?.name||'Former rival')+' · '+(f.message||'Generals evaluating routes.'):'No active offensive. You can leave military management to the General Staff.')+'</p><small>Declaring war carries serious economic and human consequences. You may also negotiate from the Diplomacy panel.</small>';
 if(f){frontSection.querySelector('#frontStrategy').value=f.strategy;frontSection.querySelector('#frontCommit').value=String(f.commit).replace(/^0\./,'.')}
 frontSection.querySelector('#launchFront').onclick=()=>{const target=+frontSection.querySelector('#frontTarget').value,foe=countries[target],strategy=frontSection.querySelector('#frontStrategy').value,commit=+frontSection.querySelector('#frontCommit').value;if(!foe||alliance(c.id,target))return;
  if(!atWar(c.id,target)){if(!confirm('Declare war on '+foe.name+' and launch this offensive?'))return;war(c.id,target);c.stability=clamp(c.stability-3,5,99);c.warExhaustion=clamp(c.warExhaustion+4,0,100)}
  releaseFront(c);c.frontOrder={target,strategy,commit,message:'Generals preparing the offensive.'};assignFrontRoutes(c);addCampaignStory('Offensive launched','Against '+foe.name+' · '+Math.round(commit*100)+'% force commitment · '+strategy);invalidate();update();if(!timer)start();
 };
 frontSection.querySelector('#stopFront').onclick=()=>{releaseFront(c,'You ordered the General Staff to halt its offensive.');update()};
 frontSection.querySelector('#raiseNationalForce').onclick=()=>{if(c.treasury<25)return;const holdings=countryStats(c).holdings;if(!holdings.length)return;
  const border=holdings.filter(t=>countyGraph[t.i].some(j=>territories[j].owner!==c.id));const pool=border.length?border:holdings;
  const best=pool.slice().sort((a,b)=>b.infra-a.infra)[0];c.treasury-=25;const a=createArmy(c.id,best.i,9);a.auto=!c.frontOrder;
  addCampaignStory('New formation raised','Division '+a.id+' recruited near '+best.name+', '+best.state+'.');if(c.frontOrder)assignFrontRoutes(c);update()};
}
const originalCampaignAdvance=advanceCabinet;
advanceCabinet=function(days){originalCampaignAdvance(days);if(!days)return;
 const c=countries[humanId];if(gameMode==='player'&&c&&countryStats(c).holdings.length){assignFrontRoutes(c);campaignReview()}
};
// The original government choices and the national project pipeline remain
// available, but most small actions are hidden under optional details.
const originalCampaignUpdate=update;
let lastCampaignRender=0;
update=function(){originalCampaignUpdate();if(Date.now()-lastCampaignRender<700&&timer)return;lastCampaignRender=Date.now();renderCampaignStory();if(!frontSection.contains(document.activeElement))renderNationalFront()};
const originalCampaignGenerate=generate;
generate=function(reuse=false){campaignHistory.length=0;campaignReportSnapshot=null;campaignReportDay=0;originalCampaignGenerate(reuse)};
renderCampaignStory();renderNationalFront();
