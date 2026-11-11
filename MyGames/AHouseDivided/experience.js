/* Distinct watch/play surfaces, population baseline, and streamlined orders. */
const experienceModes=choiceOverlay.querySelectorAll('.choice-buttons button');
if(experienceModes[0])experienceModes[0].textContent='◉ SPECTATE / SIMULATE';
if(experienceModes[1])experienceModes[1].textContent='♛ PLAY / COMMAND';
const setupRail=document.querySelector('[data-open="scenario"]');
if(setupRail)setupRail.innerHTML='<span>◉</span>Simulate';
function syncExperienceMode(){
 const player=gameMode==='player'&&humanId!==null;
 for(const id of ['command','cabinet','armies']){
  const btn=document.querySelector('[data-open="'+id+'"]');if(btn)btn.hidden=!player;
 }
 if(setupRail)setupRail.hidden=player;
 if(!player&&['command','cabinet','armies'].includes(openPanel))setPanel(null);
 if(player&&openPanel==='scenario')setPanel(null);
 const bottom=document.querySelector('.war-bottom');
 bottom?.setAttribute('data-experience',player?'play':'watch');
 let status=$('experienceStatus');
 if(!status){status=document.createElement('span');status.id='experienceStatus';bottom.prepend(status)}
 status.textContent=player?'♛ PLAYING '+(countries[humanId]?.name||'FACTION'):'◉ SPECTATOR SIMULATION';
}

function populationComparison(holdings){return {baseline:lower48Population2026,current:nums(holdings.map(t=>t.p))}}
const comparisonCard=document.createElement('div');comparisonCard.className='population-2030-card';
cards.world.querySelector('.stats')?.append(comparisonCard);
const previousExperienceInspector=renderGeoInspector;
renderGeoInspector=function(c,t){
 previousExperienceInspector(c,t);
};
function updatePopulationComparison(){
 if(!geomReady)return;
 const total=populationComparison(territories);
 comparisonCard.innerHTML='<strong>'+total.current.toFixed(1)+'M</strong><span>Population · '+total.baseline.toFixed(1)+'M in 2026</span>';
 comparisonCard.title='Current simulated population of the contiguous 48 states. The 2026 baseline is an estimate derived from 2024 Census county populations and 2026 national population figures, excluding Alaska and Hawaii.';
}

// Military plans traverse allied/friendly counties and active enemy territory.
let drawingPlan=false,waypointPreview=[],previewRoute=[],selectedPlanMessage='';
const plannerUI=document.createElement('div');plannerUI.className='military-planner';
plannerUI.innerHTML='<div class="planner-title">FIELD BATTLE PLANNER</div><p>Each division has its own stance. Cautious troops wait for favorable odds; defenders hold and entrench.</p><div class="planner-controls"><button id="drawBattlePlan">✎ Draw plan</button><button id="executeBattlePlan" disabled>▶ Execute</button><button id="clearBattlePlan">✕ Clear</button></div><label>Selected division stance<select id="planRisk"><option value=".82">Aggressive · accept unfavorable odds</option><option value="1.05" selected>Balanced · require slight advantage</option><option value="1.3">Cautious · require 30% advantage</option><option value="defend">Defend · hold and entrench</option></select></label><div id="planFeedback" class="plan-feedback">Select an army to begin.</div>';
militaryPanel.querySelector('.army-actions').before(plannerUI);
$('orderArmy').hidden=false;
const quickPlanDock=document.createElement('div');quickPlanDock.className='quick-plan-dock';quickPlanDock.hidden=true;
quickPlanDock.innerHTML='<strong>✎ DRAWING BATTLE PLAN</strong><span id="quickPlanStages">Click counties to set waypoints</span><button id="quickPlanGo">▶ Execute plan</button><button id="quickPlanUndo">↶ Undo</button><button id="quickPlanCancel">✕</button>';
field.append(quickPlanDock);
function armyAdvantage(a,target){
 const defender=countries[territories[target].owner],friend=countries[a.owner];
 if(!defender||!friend)return 0;
 const defenders=armies.filter(x=>x.owner===defender.id&&x.county===target);
 const siege=target===a.siegeTarget?(a.siegePressure||0):0;
 const defense=(nums(defenders.map(x=>fieldStrength(x)*divisionTraits(x.quality).combat*(1+x.entrench*.7)))+5+Math.max(0,(defender.fort||0)*8-siege*.6)*(defenders.length?1:.28))*(ideologies[defender.ideology]?.army||1);
 const assisting=armies.filter(x=>x.id!==a.id&&x.owner===a.owner&&countyGraph[target].includes(x.county)&&x.strength>0);
 const support=nums(assisting.map(x=>fieldStrength(x)*divisionTraits(x.quality).combat))*.72;
 const attack=(fieldStrength(a)*divisionTraits(a.quality).combat+support)*(ideologies[friend.ideology]?.army||1)*(.65+friend.readiness/120);
 return attack/Math.max(1,defense*(.65+defender.readiness/140));
}
function choosePlanRoute(source,to,owner){
 return shortestCountyRoute(source,to,owner,true);
}
function resetPlanUI(clearOrders=false){
 drawingPlan=false;waypointPreview=[];previewRoute=[];
 if(clearOrders){const a=selectedArmy();if(a){a.route=[];a.plan=null}}
 selectedPlanMessage='';refreshPlanUI();
}
function refreshPlanUI(){
 const a=selectedArmy();
 if(a&&document.activeElement!==$('planRisk'))$('planRisk').value=a.stance||'1.05';
 $('drawBattlePlan').classList.toggle('active',drawingPlan);
 $('executeBattlePlan').disabled=!a||!previewRoute.length;
 $('drawBattlePlan').disabled=!a;
 $('planFeedback').textContent=selectedPlanMessage||(!a?'Select an army by clicking its marker on the map.':drawingPlan?'Click counties on the map to draw a multi-county route.':a.route.length?'Executing a '+a.route.length+'-county route'+(a.plan?' with advantage checks.':'.'):'Draw a route, then click Execute.');
 const executing=gameMode==='player'&&a?.plan&&a.route.length;
 quickPlanDock.hidden=gameMode!=='player'||(!drawingPlan&&!executing);
 quickPlanDock.querySelector('strong').textContent=drawingPlan?'✎ DRAWING BATTLE PLAN':'▶ PLAN IN PROGRESS';
 $('quickPlanStages').textContent=drawingPlan?(previewRoute.length?previewRoute.length+' counties · '+waypointPreview.length+' waypoints':'Click counties to extend your route'):(a?.route.length||0)+' counties remaining';
 $('quickPlanGo').hidden=!drawingPlan;
 $('quickPlanUndo').textContent=drawingPlan?'↶ Undo':'✎ Replan';
 $('quickPlanGo').disabled=!a||!previewRoute.length;
 $('quickPlanCancel').textContent=drawingPlan?'✕ Cancel':'■ Stop army';
}
function planCounty(index){
 const a=selectedArmy();if(!a)return;
 const from=previewRoute.length?previewRoute[previewRoute.length-1]:a.county;
 const segment=choosePlanRoute(from,index,a.owner);
 if(segment===null){selectedPlanMessage='No legal route through friendly territory or an enemy you are currently at war with.';refreshPlanUI();return}
 if(segment.length){previewRoute.push(...segment);waypointPreview.push(index)}
 selectedPlanMessage='Planned '+previewRoute.length+' county stages · '+waypointPreview.length+' waypoints. Click Execute to begin.';
 refreshPlanUI();drawArmyMap();
}
$('drawBattlePlan').onclick=()=>{
 const a=selectedArmy();if(!a)return;
 stop();
 a.route=[];a.plan=null;
 drawingPlan=!drawingPlan;previewRoute=[];waypointPreview=[];
 selectedPlanMessage=drawingPlan?'Click a succession of counties on the map.': 'Plan drawing canceled.';
 refreshPlanUI();drawArmyMap();setPanel(null);
};
$('executeBattlePlan').onclick=()=>{
 const a=selectedArmy();if(!a||!previewRoute.length)return;
 a.stance=$('planRisk').value;
 if(a.stance==='defend'){a.route=[];a.plan=null;a.entrench=1;resetPlanUI();armyMessage='Division '+a.id+' holding its defensive position.';update();return}
 a.route=[...previewRoute];a.plan={threshold:+a.stance};a.travelDays=0;a.auto=false;
 const count=a.route.length;resetPlanUI();armyMessage='Division '+a.id+' executing '+count+'-county battle plan. It will wait for favorable odds instead of wasting troops.';
 setPanel(null);update();if(!timer)start();
};
$('planRisk').onchange=()=>{
 const a=selectedArmy();if(!a)return;
 a.stance=$('planRisk').value;
 if(a.stance==='defend'){a.route=[];a.plan=null;a.entrench=1;resetPlanUI();armyMessage='Division '+a.id+' ordered to defend and entrench.'}
 else if(a.plan)a.plan.threshold=+a.stance;
 refreshPlanUI();update();
};
$('clearBattlePlan').onclick=()=>{resetPlanUI(true);armyMessage='Plan cleared. Formation holding position.';update()};
$('quickPlanGo').onclick=()=>$('executeBattlePlan').click();
$('quickPlanCancel').onclick=()=>{resetPlanUI(true);armyMessage='Army orders canceled.';update();drawArmyMap()};
$('quickPlanUndo').onclick=()=>{
 if(!drawingPlan){const a=selectedArmy();if(!a)return;stop();a.route=[];a.plan=null;drawingPlan=true;previewRoute=[];waypointPreview=[];refreshPlanUI();drawArmyMap();return}
 if(!waypointPreview.length)return;
 waypointPreview.pop();previewRoute=[];
 const a=selectedArmy();if(!a)return;
 for(const target of waypointPreview){const from=previewRoute.length?previewRoute.at(-1):a.county;const leg=choosePlanRoute(from,target,a.owner);if(leg)previewRoute.push(...leg)}
 refreshPlanUI();drawArmyMap();
};
const previousDrawArmyMap=drawArmyMap;
drawArmyMap=function(){
 previousDrawArmyMap();
 if(!drawingPlan||!previewRoute.length||!geoGroup)return;
 const a=selectedArmy();if(!a)return;
 const pts=[a.county,...previewRoute].map(i=>territories[i]).filter(Boolean);
 geoGroup.append('path').attr('class','planned-route-preview').attr('d',d3.line()(pts.map(t=>[t.cx,t.cy]))).attr('pointer-events','none');
};
document.querySelector('#map').addEventListener('click',ev=>{
 if(gameMode!=='player')return;
 const marker=ev.target.closest('[data-army-id]');
 if(marker){
  const a=armies.find(x=>x.id===+marker.dataset.armyId&&x.owner===humanId);
  if(a){ev.preventDefault();ev.stopPropagation();selectedArmyId=a.id;drawingPlan=false;previewRoute=[];waypointPreview=[];setPanel('armies');armyDisplay();refreshPlanUI();drawArmyMap()}
  return;
 }
 if(!drawingPlan)return;
 const county=ev.target.closest('path[data-i]');if(!county)return;
 ev.preventDefault();ev.stopPropagation();planCounty(+county.dataset.i);
},true);
// The old waypoint painter remains dormant. Only direct Move / Attack orders
// are exposed, and no overlay lines are rendered on the map.
drawingPlan=false;
plannerUI.querySelector('.planner-controls').hidden=true;
quickPlanDock.hidden=true;
plannerUI.querySelector('.planner-title').textContent='DIVISION ORDERS';
plannerUI.querySelector('#planFeedback').hidden=true;
plannerUI.querySelector('p').textContent='Choose a separate stance for each division, then use Move / Attack and click one destination county.';

// An optional cabinet preset and trusted administrator automate repetitive
// domestic choices and county construction while respecting a cash reserve.
const budgetPresets={balanced:{welfare:2,industry:2,defense:2,diplomacy:2},growth:{welfare:1,industry:5,defense:1,diplomacy:2},fortress:{welfare:1,industry:2,defense:5,diplomacy:1},rebuild:{welfare:4,industry:3,defense:0,diplomacy:2}};
function initializeAutoCabinet(c){if(c.autoCabinet===undefined)c.autoCabinet=false;if(!c.autoPreset)c.autoPreset='balanced'}
const previousCabinetExperience=renderCabinet;
renderCabinet=function(force=false){
 previousCabinetExperience(force);
 const body=$('cabinetBody'),c=countries[humanId];if(!body||gameMode!=='player'||!c||!countryStats(c).holdings.length)return;
 initializeAutoCabinet(c);
 const div=document.createElement('div');div.className='auto-cabinet';
 div.innerHTML='<div class="cabinet-section">SIMPLIFIED GOVERNMENT <small>Optional automation</small></div><p class="cabinet-muted">Pick a preset and let your cabinet handle routine budgets, domestic decisions, and construction. You can still override anything manually.</p><label>Government strategy<select id="autoPreset">'+Object.keys(budgetPresets).map(k=>'<option value="'+k+'" '+(c.autoPreset===k?'selected':'')+'>'+({balanced:'Balanced',growth:'Economic growth',fortress:'Fortress',rebuild:'Reconstruction'})[k]+'</option>').join('')+'</select></label><div class="auto-row"><button id="applyBudgetPreset">Apply budget preset</button><button id="toggleAutoCabinet">'+(c.autoCabinet?'✓ Automation ON':'Start automation')+'</button></div>';
 body.prepend(div);
 $('applyBudgetPreset').onclick=()=>{c.autoPreset=$('autoPreset').value;c.budget={...budgetPresets[c.autoPreset]};agencyNotice='Budget preset applied.';renderCabinet(true)};
 $('toggleAutoCabinet').onclick=()=>{c.autoPreset=$('autoPreset').value;c.autoCabinet=!c.autoCabinet;if(c.autoCabinet)c.budget={...budgetPresets[c.autoPreset]};renderCabinet(true)};
};
const previousAutoAdvance=advanceCabinet;
advanceCabinet=function(days){
 previousAutoAdvance(days);
 if(gameMode!=='player'||humanId===null||!days)return;
 const c=countries[humanId];if(!c||!countryStats(c).holdings.length)return;
 initializeAutoCabinet(c);if(!c.autoCabinet)return;
 if(daysElapsed-c.governanceCooldown>=28&&c.treasury>90){
  const choices={balanced:['welfare','infra','reconcile'],growth:['infra','research','cut'],fortress:['draft','research','reconcile'],rebuild:['welfare','reconcile','infra']}[c.autoPreset];
  const action=govChoices.filter(g=>choices.includes(g.id)&&c.treasury>=g.cost+65).sort((a,b)=>choices.indexOf(a.id)-choices.indexOf(b.id))[0];
  if(action){c.treasury-=action.cost;action.act(c);c.governanceCooldown=daysElapsed;log(c.name+' cabinet automatically enacts '+action.label.toLowerCase()+'.')}
 }
 invalidate();
};

const priorExperienceUpdate=update;
update=function(){priorExperienceUpdate();syncExperienceMode();updatePopulationComparison();refreshPlanUI()};
const priorExperienceGenerate=generate;
generate=function(reuse=false){resetPlanUI();priorExperienceGenerate(reuse);updatePopulationComparison();syncExperienceMode()};
syncExperienceMode();refreshPlanUI();
