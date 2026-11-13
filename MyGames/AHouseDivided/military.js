/* County-level force commands, territorial continuity, and capitulations.
   Fictional grand-strategy abstraction; not a tactical or real-world model. */
let armies=[],nextArmyId=1,selectedArmyId=null,awaitingDestination=false,armyMessage='',lastContinuityDay=0,lastArmyRender=0;
const militaryPanel=document.createElement('section');
militaryPanel.className='card war-panel right army-panel';
militaryPanel.dataset.panel='armies';
militaryPanel.innerHTML='<button class="panel-close" aria-label="Close armies panel">×</button><div class="section-head"><span>GENERAL STAFF</span><span>LAND FORCES</span></div>'+
 '<p>Raise formations in your own counties. Select a formation, order a march to a friendly county, or attack an adjacent enemy county when at war.</p>'+
 '<div id="armyCountry"></div><div class="army-status" id="armyMessage">Choose a country in Play as a Faction mode.</div>'+
 '<label>Selected formation<select id="armySelect"></select></label>'+
 '<label>Recruit type<select id="divisionQuality"><option value="militia" selected>Militia · inexpensive, fast</option><option value="elite">Veterans · powerful, durable</option></select></label>'+
 '<div class="army-actions"><button id="recruitArmy">＋ Raise formation</button><button id="orderArmy">➤ Move / attack</button><button id="splitArmy">⫶ Split formation</button><button id="entrenchArmy">⬟ Entrench</button><button id="holdArmy">■ Hold position</button><button id="autoArmy">◇ Auto-defend</button></div>'+
 '<div class="section-head"><span>FIELD ARMY ROSTER</span><span id="armyTotal">0</span></div><div class="army-roster" id="armyRoster"></div>';
field.append(militaryPanel);
cards.armies=militaryPanel;
militaryPanel.querySelector('.panel-close').onclick=()=>setPanel(null);
const armyRailButton=document.createElement('button');armyRailButton.dataset.open='armies';armyRailButton.title='Armies';armyRailButton.innerHTML='<span>⚔</span>Armies';
armyRailButton.onclick=()=>setPanel(openPanel==='armies'?null:'armies');
document.querySelector('.war-rail.right').prepend(armyRailButton);

function selectedArmy(){return armies.find(a=>a.id===selectedArmyId&&a.owner===humanId)}
function ownedArmies(id){return armies.filter(a=>a.owner===id)}
function divisionRecruitPrice(quality='militia'){
 const cost={militia:{easy:14,medium:15,hard:32},elite:{easy:40,medium:65,hard:95}};
 return (cost[quality]||cost.militia)[typeof aiChallenge==='undefined'?'medium':aiChallenge];
}
// Recruitment pricing depends on who is paying. The Medium player retains
// Medium AI governments pay a premium for recruitment; player pricing remains unchanged.
function countryDivisionRecruitPrice(c,quality='militia'){
 const difficulty=typeof aiChallenge==='undefined'?'medium':aiChallenge;
 if(gameMode!=='player'||c?.id!==humanId){
  if(difficulty==='easy')return quality==='elite'?65:22;
  if(difficulty==='medium')return quality==='elite'?100:30;
  if(difficulty==='hard')return quality==='elite'?75:25;
 }
 return divisionRecruitPrice(quality);
}
// Project the next formation's recurring cost before spending cash. Emergency
// mobilization may run a temporary deficit, but it still needs tax revenue
// and enough reserves to service that deficit for several months.
function aiMilitaryRecruitmentCapacity(c,quality='militia',emergency=false){
 const force=ownedArmies(c.id),count=force.length;
 const income=revenueEstimate(c),ledger=recurringLedger(c);
 const funding=({low:.75,normal:1,high:1.45})[c.militaryPolicy]??1;
 const inWar=enemies(c.id).length>0;
 const upkeepDifficulty=typeof aiChallenge==='undefined'?'medium':aiChallenge;
 const factor=(inWar?1.4:1)*funding*({easy:1.10,medium:1.18,hard:.88})[upkeepDifficulty];
 const unit= a=>(.60+Math.max(0,a.strength)*.075)*(a.quality==='elite'?1.6:.55);
 const currentBase=force.reduce((total,a)=>total+unit(a),0);
 const added=unit({quality,strength:quality==='elite'?15:9});
 const oldBurden=1+Math.max(0,count-8)*.03;
 const newBurden=1+Math.max(0,count+1-8)*.03;
 const marginal=Math.max(.01,((currentBase+added)*newBurden-currentBase*oldBurden)*factor);
 const estimatedNet=ledger.net-marginal;
 const price=countryDivisionRecruitPrice(c,quality);
 const afterPurchase=c.treasury-price;
 const minimumReserve=emergency?Math.max(6,income*.65):Math.max(15,income*1.5);
 // A state may spend its war chest, but must not keep creating soldiers while
 // its underlying economy can sustain only a fraction of its existing army.
 const expenseLimit=income*(emergency?1.38:1.08);
 const expenseAfter=ledger.civilAndArmy+ledger.priority+marginal;
 const monthsOfRunway=estimatedNet<0?afterPurchase/(-estimatedNet):Infinity;
 return {affordable:afterPurchase>=minimumReserve&&expenseAfter<=expenseLimit&&
   monthsOfRunway>=(emergency?4:9),marginal,estimatedNet,monthsOfRunway,income,price};
}
function divisionTraits(quality){return quality==='elite'?{combat:1.45,damage:.40,pace:1}:{combat:.90,damage:1.10,pace:1.6}}
function fieldStrength(a){return Math.max(1,a.strength-(a.marchFatigue||0)-(a.supplyPenalty||0))}
function divisionName(quality){return quality==='elite'?'Veterans':'Militia'}
function undefendedCaptureBonus(a,countyIndex){
 if(a.quality!=='militia'||territories[countyIndex]?.owner===a.owner)return 1;
 const owner=territories[countyIndex]?.owner;
 return armies.some(other=>other.owner===owner&&other.county===countyIndex)?1:1.5;
}
function describeCounty(t){return t?t.name+', '+t.state:'Unknown'}
function createArmy(owner,county,strength,quality='militia'){
 const army={id:nextArmyId++,owner,county,strength,quality:quality==='elite'?'elite':'militia',stance:'1.05',entrench:0,route:[],travelDays:0,auto:false};
 armies.push(army);return army;
}
function initializeArmies(){
 armies=[];nextArmyId=1;selectedArmyId=null;awaitingDestination=false;armyMessage='';
 for(const c of validCountries()){
  const holdings=countryStats(c).holdings;
  if(!holdings.length)continue;
  const count=Math.min(3,Math.max(1,Math.ceil(holdings.length/28)));
  for(let k=0;k<count;k++){const quality=k===0&&count>1?'elite':'militia';createArmy(c.id,choice(holdings).i,quality==='elite'?15:Math.max(6,Math.round(6+Math.sqrt(countryStats(c).pop)+rand()*3)),quality)}
  c.initialCount=holdings.length;c.initialPower=countryStats(c).power;c.surrendered=false;
 }
}
function localArmyPower(owner,target,attacking){
 const positions=attacking?countyGraph[target]:[target,...countyGraph[target]];
 const forces=armies.filter(a=>a.owner===owner&&positions.includes(a.county));
 const strength=nums(forces.map(a=>a.strength*(1+a.entrench*(attacking?0:.4))));
 return clamp(.65+strength/50,.65,2.25);
}
function shortestCountyRoute(source,destination,owner,warTransit=false){
 if(source===destination)return [];
 const seen=new Set([source]),prev=new Map(),queue=[source];let head=0;
 while(head<queue.length){
  const cur=queue[head++];
  for(const j of countyGraph[cur]){
   if(seen.has(j))continue;
   if(territories[j].owner!==owner&&!alliance(owner,territories[j].owner)&&j!==destination&&!(warTransit&&atWar(owner,territories[j].owner)))continue;
   if(j===destination&&territories[j].owner!==owner&&!atWar(owner,territories[j].owner))continue;
   seen.add(j);prev.set(j,cur);
   if(j===destination){const route=[j];let step=j;while(prev.has(step)){step=prev.get(step);route.unshift(step)}return route.slice(1)}
   queue.push(j);
  }
 }
 return null;
}
function orderArmyTo(army,to){
 if(!army)return false;
 if(to===army.county){army.route=[];armyMessage='Formation is already in '+describeCounty(territories[to]);return true}
 const destination=territories[to],owner=destination.owner;
 if(owner!==army.owner&&!atWar(army.owner,owner)){armyMessage='Cannot enter foreign territory without an active war.';return false}
 const route=shortestCountyRoute(army.county,to,army.owner);
 if(!route){armyMessage='No valid land route. Select a reachable friendly county or an adjacent enemy frontier.';return false}
 if(army.stance==='defend'){armyMessage='This division is defending. Change its stance before issuing an attack.';return false}
 army.route=route;army.plan={threshold:+(army.stance||'1.05')};army.travelDays=0;army.auto=false;armyMessage='March ordered to '+describeCounty(destination)+' ('+route.length+' county stages).';return true;
}
function resolveArmyAssault(army,target){
 const defender=territories[target].owner,enemy=countries[defender],friend=countries[army.owner];
 if(!atWar(army.owner,defender))return false;
 const garrison=armies.filter(a=>a.owner===defender&&a.county===target);
 // Several nearby divisions can support the attacking formation. Without
 // this, ten adjacent units attacked one by one as if the other nine vanished.
 const assisting=armies.filter(a=>a.id!==army.id&&a.owner===army.owner&&countyGraph[target].includes(a.county)&&a.strength>0);
 // All divisions assembled along the crossing participate. The old cap at
 // 4x the lead division's strength made eight attacking divisions fight as
 // though only two or three were present, especially after the lead took losses.
 const support=nums(assisting.map(a=>fieldStrength(a)*divisionTraits(a.quality).combat))*.72;
 const adjacent=countyGraph[target].filter(j=>territories[j].owner===defender);
 const reinforcing=armies.filter(a=>a.owner===defender&&adjacent.includes(a.county));
 const reserve=nums(reinforcing.map(a=>a.strength))*.42;
 // Fortification contributes to every battle but should not make an otherwise
 // undefended county insurmountable. Sustained pressure softens defenses.
 const siege=target===army.siegeTarget?(army.siegePressure||0):0;
 // An ungarrisoned county may have static defenses, but shouldn't hold out
 // indefinitely against a field army merely because its nation is powerful.
 const fortBonus=Math.max(0,(enemy.fort||0)*8-siege*.6)*(garrison.length?1:.28);
 const defenders=(nums(garrison.map(a=>fieldStrength(a)*(1+a.entrench*.7)*divisionTraits(a.quality).combat))+reserve+5+fortBonus)*(ideologies[enemy.ideology]?.army||1);
 const fightingCondition=c=>(.45+.55*clamp(c.stability/75,.15,1.2))*(.48+.52*clamp(c.baseEconomyFactor||1,.45,1.8))*(1-Math.min(.6,(c.warExhaustion||0)*.006));
 const level=typeof aiChallenge==='undefined'?'medium':aiChallenge;
 const playerCombat=(gameMode==='player'&&army.owner===humanId)?({easy:1.15,medium:1,hard:.92})[level]:1;
 const aiCombat=(gameMode==='player'&&army.owner!==humanId)?({easy:.91,medium:1,hard:1.09})[level]:1;
 const attack=(fieldStrength(army)*divisionTraits(army.quality).combat+support)*(ideologies[friend.ideology]?.army||1)*(.55+friend.readiness/105)*fightingCondition(friend)*(.72+rand()*.52)*playerCombat*aiCombat;
 const defendingPlayer=gameMode==='player'&&enemy.id===humanId;
 const defenseModifier=defendingPlayer?({easy:1.15,medium:1,hard:.92})[level]:gameMode==='player'?({easy:.91,medium:1,hard:1.09})[level]:1;
 const defense=defenders*(.55+enemy.readiness/115)*fightingCondition(enemy)*(.83+rand()*.44)*defenseModifier;
 if(attack>defense){
  // Occupying an empty county doesn't kill soldiers. Casualties belong to
  // actual battles with opposing formations or their reinforcements.
  const rawLosses=(defenders*.21+rand()*2)*divisionTraits(army.quality).damage;
  const maxBattleLoss=Math.max(1,Math.ceil(army.strength*(army.quality==='elite'?.10:.28)));
  const losses=garrison.length||reinforcing.length?Math.min(maxBattleLoss,Math.max(1,Math.round(rawLosses))):0;
  army.strength=Math.max(1,army.strength-losses);
  army.lastBattleResult='Victory'+(losses?' · '+losses+' lost':' · no casualties');army.lastBattleDay=daysElapsed;
   for(const g of garrison){g.strength=Math.max(1,g.strength-Math.max(1,Math.ceil(g.strength*.18*divisionTraits(g.quality).damage)));g.route=[];g.plan=null}
  armies=armies.filter(a=>a.strength>0);
  if(typeof recordWarCapture==='function')recordWarCapture(army.owner,defender,territories[target]);
  territories[target].owner=army.owner;invalidate();
  displaced+=territories[target].p*.005;
  friend.warExhaustion=clamp((friend.warExhaustion||0)+losses*.025,0,100);
  // Losing one remote county is minor for a large nation, but potentially
  // catastrophic for a state with only a handful of counties.
  const relativeLoss=clamp(45/Math.max(5,enemy.initialCount||countryStats(enemy).holdings.length),.3,3);
  const hardship=clamp((65-(enemy.stability||65))/70,.1,1);
  enemy.warExhaustion=clamp((enemy.warExhaustion||0)+(relativeLoss*.23+garrison.length*.12)*hardship,0,100);
  // Occupation hurts public confidence; recapturing land can restore it.
  enemy.stability=clamp(enemy.stability-Math.min(.9,relativeLoss*.24),5,99);
  if(territories[target].recentlyCapturedFrom===army.owner)friend.stability=clamp(friend.stability+.3,5,99);
  log(friend.name+' captures '+describeCounty(territories[target])+' with a field army.','warlog');
  if(typeof completeTotalConquest==='function')completeTotalConquest(army.owner,defender);
  armyMessage='Victory in '+describeCounty(territories[target])+'; lost '+losses+' strength.';
  army.siegeTarget=null;army.siegePressure=0;
  return true;
 }
 army.siegePressure=Math.min(24,(army.siegeTarget===target?army.siegePressure||0:0)+2.5);army.siegeTarget=target;
 const losses=garrison.length||reinforcing.length?Math.min(army.quality==='elite'?1:2,Math.ceil((defenders*.14+rand()*3)*divisionTraits(army.quality).damage)):0;
 army.strength=Math.max(1,army.strength-losses);
 army.lastBattleResult='Assault repulsed'+(losses?' · '+losses+' lost':' · no casualties');army.lastBattleDay=daysElapsed;
 friend.warExhaustion=clamp((friend.warExhaustion||0)+Math.min(.65,.18+losses*.17),0,100);
 garrison.forEach(g=>g.strength=Math.max(1,g.strength-Math.max(1,Math.round(divisionTraits(g.quality).damage))));
 log(friend.name+' assault stalls at '+describeCounty(territories[target])+'.','warlog');
 armyMessage='Assault repulsed in '+describeCounty(territories[target])+'.';
 return false;
}
function retreatDisplacedArmies(){
 for(const a of armies){
  const position=territories[a.county];if(!position||position.owner===a.owner||alliance(a.owner,position.owner))continue;
  const destinations=countryStats(countries[a.owner]).holdings;
  if(!destinations.length)continue;
  const nearby=countyGraph[a.county].filter(i=>territories[i].owner===a.owner);
  const goal=nearby.length?territories[nearby[0]]:destinations.reduce((best,t)=>!best||Math.hypot(t.cx-position.cx,t.cy-position.cy)<Math.hypot(best.cx-position.cx,best.cy-position.cy)?t:best,null);
  if(goal){a.county=goal.i;a.route=[];a.plan=null;a.travelDays=0;a.entrench=0}
 }
}
function moveArmies(days){
 for(const a of [...armies]){
  if(a.lastMovementDay===undefined){a.lastMovementDay=daysElapsed;a.lastMovementCounty=a.county}
  if(a.lastMovementCounty!==a.county){a.lastMovementCounty=a.county;a.lastMovementDay=daysElapsed;a.stallReason=''}
  // Long marches reduce combat effectiveness by at most two points, without
  // permanently consuming manpower; resting restores the lost readiness.
  if(daysElapsed-a.lastMovementDay>=7){a.marchFatigue=Math.max(0,(a.marchFatigue||0)-days/7*.6)}
  // An old route or battle plan may remain technically valid while making no
  // progress. Give front commanders a fresh route instead of freezing forever.
  if(a.route.length&&a.frontTarget!==undefined&&a.frontTarget!==null&&a.stance!=='defend'&&daysElapsed-a.lastMovementDay>56){
   a.failedTarget=a.route[0];a.failedUntil=daysElapsed+28;
   a.route=[];a.plan=null;a.travelDays=0;a.lastMovementDay=daysElapsed;
   a.stallReason='Regrouping after a blocked offensive';
  }
  if(!a.route.length)continue;
  a.travelDays+=days;
  let steps=0;
  while(a.route.length&&a.travelDays>=(a.plan?2:4)/(divisionTraits(a.quality).pace*undefendedCaptureBonus(a,a.route[0]))&&steps++<(a.plan?20:10)){
   let next=a.route[0];
   const stageDays=(a.plan?2:4)/(divisionTraits(a.quality).pace*undefendedCaptureBonus(a,next));
   if(!countyGraph[a.county].includes(next)){a.route=[];a.plan=null;armyMessage='Border changed; General Staff is finding a new route.';break}
   if(territories[next].owner!==a.owner&&!alliance(a.owner,territories[next].owner)){
    if(!atWar(a.owner,territories[next].owner)){a.route=[];a.plan=null;armyMessage='Offensive canceled because the target is no longer at war with you.';break}
    if(a.plan&&typeof armyAdvantage==='function'){
     // An offensive that has spent several weeks on the same frontier must
     // finally engage. This also breaks stale odds/wait loops after rerouting.
     const awaitingBattle=daysElapsed-(a.lastMovementDay??daysElapsed);
     if(awaitingBattle>=21&&a.stance!=='defend'){
      a.plan.threshold=0;a.plan.stageUntil=0;a.plan.blockedDays=0;
     }
     a.plan.blockedDays=a.plan.blockedDays||0;
     const odds=armyAdvantage(a,next),required=a.plan.threshold;
     const unguarded=!armies.some(other=>other.owner===territories[next].owner&&other.county===next&&other.strength>0);
     const aggressive=required<=.85,deadline=aggressive?0:required>=1.15?10:3;
     // Balanced and cautious attacks wait briefly to concentrate. Aggressive
     // formations attack even when outnumbered; failure prompts a flank.
     // Balanced troops press ahead into undefended territory immediately.
     // Aggressive troops attack regardless of projected losses.
     if(!unguarded&&!aggressive&&a.plan.stageUntil&&daysElapsed<a.plan.stageUntil){a.travelDays=Math.min(a.travelDays,2);break}
     if(!unguarded&&!aggressive&&odds<required&&a.plan.blockedDays<deadline){
      a.plan.blockedDays+=days;
     // Routine replacements are already included in monthly military upkeep.
     // They must never silently debit the player's treasury a second time.
     const funding=countries[a.owner].militaryPolicy||'normal';
     const reinforcementDays=funding==='high'?10:funding==='low'?22:15;
     const reinforcementSize=funding==='high'?2:funding==='low'?.5:1;
     if(a.plan.blockedDays>=14&&Math.floor(a.plan.blockedDays/reinforcementDays)>Math.floor((a.plan.blockedDays-days)/reinforcementDays)){
       a.strength=Math.max(a.strength,Math.min(a.quality==='elite'?22:12,a.strength+reinforcementSize));
      }
      a.travelDays=Math.min(a.travelDays,2);break;
     }
     // Search for a flank once (balanced) or a few times (cautious), but
     // never abandon every assault forever just because all odds are poor.
     const maxFlanks=required>=1.15?2:1;
     if(!unguarded&&!aggressive&&odds<Math.min(.8,required*.72)&&a.plan.blockedDays>=deadline&&(a.flankAttempts||0)<maxFlanks){
      a.flankAttempts=(a.flankAttempts||0)+1;
      a.failedTarget=next;a.failedUntil=daysElapsed+45;
      a.route=[];a.plan=null;a.travelDays=0;
      armyMessage='Division '+a.id+' searches for a weaker crossing near '+territories[next].name+'.';break;
     }
    }
    if(!resolveArmyAssault(a,next)){
     if(a.plan){a.travelDays=0;a.plan.blockedDays=0;a.plan.failures=(a.plan.failures||0)+1;
      if(a.plan.failures>=2||a.strength<=3){a.failedTarget=next;a.failedUntil=daysElapsed+45;a.route=[];a.plan=null;a.planRetryAt=daysElapsed+7;armyMessage='Division '+a.id+' is regrouping and seeking another route.'}
     }
     else a.route=[];
     break;
    }
    if(a.plan){a.plan.blockedDays=0;a.plan.failures=0;a.flankAttempts=0}
   }
   a.county=next;a.route.shift();a.travelDays-=stageDays;a.entrench=0;a.lastMovementDay=daysElapsed;a.lastMovementCounty=next;a.stallReason='';
   a.marchFatigue=Math.min(2,(a.marchFatigue||0)+.22);
   if(!a.route.length)a.plan=null;
  }
 }
 retreatDisplacedArmies();
 if(typeof restorePeaceArmies==='function')restorePeaceArmies();
 armies=armies.filter(a=>a.strength>0&&countryStats(countries[a.owner]).holdings.length>0);
}
function friendlyBorderCandidates(id){
 return territories.filter((t,i)=>(t.owner===id||alliance(id,t.owner))&&countyGraph[i].some(j=>atWar(id,territories[j].owner)));
}
function automaticArmyOrders(days){
 if(!chance(.999,days))return;
 for(const c of validCountries()){
  if(!enemies(c.id).length)continue;
  if(gameMode==='player'&&c.id===humanId)continue;
  let borders=friendlyBorderCandidates(c.id);if(!borders.length)continue;
  const setting=typeof aiChallenge==='undefined'?'medium':aiChallenge;
  const ownForces=ownedArmies(c.id),enemyForces=armies.filter(a=>enemies(c.id).includes(a.owner));
  const baseDesired=Math.max(3,Math.min(setting==='hard'?22:setting==='easy'?9:16,Math.ceil(countryStats(c).holdings.length/(setting==='hard'?9:setting==='easy'?23:14)),Math.ceil((enemyForces.length+2)*(setting==='medium'?.9:1))));
  // Regular AI fields about 45% fewer divisions than the original target.
  // This limits army-size advantage without changing battlefield decisions.
  const desired=Math.max(2,Math.ceil(baseDesired*({easy:.57,medium:.55,hard:1.13})[setting]));
  if(c.treasury>=35&&ownForces.length<desired&&chance(setting==='hard'?.9999:setting==='easy'?.86:.997,days)){
   const threatened=borders.filter(t=>countyGraph[t.i].some(j=>atWar(c.id,territories[j].owner)));
   const staging=(threatened.length?threatened:borders).filter(t=>t.owner===c.id);
   const location=choice(staging.length?staging:countryStats(c).holdings);if(!location)continue;
   // Rivals recruit the same three formations and pay their actual treasury costs.
   // Rich armies favor veterans, while stretched governments field more militia.
   const hasVeteranOpposition=enemyForces.some(a=>a.quality==='elite');
   const veteranChance=setting==='hard'?.39:setting==='medium'?.22:.13;
   const quality=c.treasury>=100&&rand()<veteranChance+(hasVeteranOpposition?.12:0)?'elite':'militia';
   let assessment=aiMilitaryRecruitmentCapacity(c,quality,false);
   let pickedQuality=quality;
   if(!assessment.affordable&&quality==='elite'){pickedQuality='militia';assessment=aiMilitaryRecruitmentCapacity(c,pickedQuality,false)}
   if(assessment.affordable){c.treasury-=assessment.price;createArmy(c.id,location.i,pickedQuality==='militia'?9:15,pickedQuality)}
  }
  const own=ownedArmies(c.id),enemyBorder=[];
  const threat=borders.map(t=>{
   const adjacent=countyGraph[t.i].filter(j=>atWar(c.id,territories[j].owner));
   for(const j of adjacent)if(!enemyBorder.includes(j))enemyBorder.push(j);
   const incoming=adjacent.reduce((n,j)=>n+armies.filter(x=>x.owner===territories[j].owner&&x.county===j).reduce((s,x)=>s+x.strength*divisionTraits(x.quality).combat,0),0);
   const guards=own.filter(x=>x.county===t.i).reduce((n,x)=>n+x.strength*divisionTraits(x.quality).combat,0);
   return {t,incoming,guards,priority:incoming-guards+t.p*.3+t.e*.4};
  }).sort((a,b)=>b.priority-a.priority);
  const targetLoad=new Map();
  for(const a of own)if(a.route?.length){const last=a.route.at(-1);targetLoad.set(last,(targetLoad.get(last)||0)+1)}
  // Reserve troops for real incursions, without leaving the entire army idle
  // behind its own border. Better AI reacts with more formations.
  const threatened=threat.filter(x=>x.incoming>x.guards*.7+3);
  const guardQuota=Math.min(own.length-1,Math.ceil(own.length*(threatened.length?(setting==='hard'?.45:.35):.16)));
  const defending=new Set([...own].sort((a,b)=>(a.quality==='militia'?1:0)-(b.quality==='militia'?1:0)||a.id-b.id).slice(0,Math.max(0,guardQuota)).map(a=>a.id));
  for(const a of own){
   if(a.route?.length){
    const destination=a.route.at(-1),owner=territories[destination]?.owner;
    if(owner!==undefined&&(owner===c.id||atWar(c.id,owner)))continue;
    a.route=[];
   }
   if(defending.has(a.id)&&threat.length){
    const options=threat.map(x=>({...x,path:shortestCountyRoute(a.county,x.t.i,c.id)})).filter(x=>x.path!==null)
     .sort((x,y)=>(y.priority-(targetLoad.get(y.t.i)||0)*10)-(x.priority-(targetLoad.get(x.t.i)||0)*10));
    const spot=options[0];
    if(spot){
     const counter=(countyGraph[spot.t.i]||[]).filter(j=>atWar(c.id,territories[j].owner))
      .map(j=>({j,enemy:armies.filter(x=>x.owner===territories[j].owner&&x.county===j).reduce((n,x)=>n+x.strength*divisionTraits(x.quality).combat,0)}))
      .sort((x,y)=>y.enemy-x.enemy)[0];
     const support=own.filter(x=>x.id!==a.id&&(x.county===spot.t.i||x.route?.at(-1)===spot.t.i)).reduce((n,x)=>n+x.strength*.5,0);
     if(counter&&a.quality!=='militia'&&a.strength*divisionTraits(a.quality).combat+support>=counter.enemy*.72){
      a.route=[...spot.path,counter.j];a.entrench=0;targetLoad.set(counter.j,(targetLoad.get(counter.j)||0)+1);continue;
     }
     a.route=spot.path;a.entrench=a.route.length?0:Math.max(.8,a.entrench||0);targetLoad.set(spot.t.i,(targetLoad.get(spot.t.i)||0)+1);continue
    }
   }
   const options=enemyBorder.map(j=>{
    const staging=(countyGraph[j]||[]).filter(i=>territories[i].owner===c.id||alliance(c.id,territories[i].owner))
     .map(i=>({i,path:shortestCountyRoute(a.county,i,c.id)})).filter(x=>x.path!==null).sort((x,y)=>x.path.length-y.path.length)[0];
    if(!staging)return null;
    const opponents=armies.filter(x=>x.owner===territories[j].owner&&x.county===j);
    const resistance=opponents.reduce((n,x)=>n+x.strength*divisionTraits(x.quality).combat,0);
    const support=own.filter(x=>x.id!==a.id&&(x.county===staging.i||x.route?.at(-1)===j)).reduce((n,x)=>n+x.strength*.4,0);
    const power=a.strength*divisionTraits(a.quality).combat+support;
    const load=targetLoad.get(j)||0;
    const reconquest=territories[j].recentlyCapturedFrom===c.id&&daysElapsed-(territories[j].captureDay||0)<365;
    const role=a.quality==='militia'?(opponents.length?24:-20):opponents.length?-12:8;
    const score=staging.path.length*2+resistance/Math.max(2,power)*(a.quality==='militia'?23:9)+load*(resistance>power?3:13)-territories[j].p*.55-territories[j].e*.4+role-(reconquest&&a.quality!=='militia'?24:0);
    return {j,route:[...staging.path,j],score};
   }).filter(Boolean).sort((a,b)=>a.score-b.score);
   if(!options.length)continue;
   const target=setting==='easy'&&options.length>1?choice(options.slice(0,Math.min(3,options.length))):options[0];
   a.route=target.route;a.auto=false;a.entrench=0;
   targetLoad.set(target.j,(targetLoad.get(target.j)||0)+1);
  }
 }
}
// Shared operational logic for unattended countries: defend threatened borders,
// fan inexpensive militia into open counties, and group veterans for real fights.
// An army with an unchanged county for a month may be given a new route.
function proactiveAiBorderAdvance(){
 for(const c of validCountries()){
  if(gameMode==='player'&&c.id===humanId||!enemies(c.id).length)continue;
  const own=ownedArmies(c.id).filter(a=>a.strength>3);
  if(!own.length)continue;
  const rivalUnits=armies.filter(a=>atWar(c.id,a.owner)&&a.strength>0);
  const garrison=new Map();for(const a of rivalUnits)garrison.set(a.county,(garrison.get(a.county)||0)+fieldStrength(a)*divisionTraits(a.quality).combat);
  const borders=territories.filter(t=>atWar(c.id,t.owner)&&(countyGraph[t.i]||[]).some(i=>territories[i].owner===c.id));
  if(!borders.length)continue;
  const targetPool=borders.map(t=>({t,guard:garrison.get(t.i)||0,recapture:t.recentlyCapturedFrom===c.id&&daysElapsed-(t.captureDay||0)<365}))
   .sort((a,b)=>(a.guard?1:0)-(b.guard?1:0)||+(b.recapture)-+(a.recapture)||b.t.p-a.t.p).slice(0,30);
  const reservations=new Map();
  for(const a of own)if(a.route?.length&&daysElapsed-(a.lastMovementDay??daysElapsed)<28){const id=a.route.at(-1);reservations.set(id,(reservations.get(id)||0)+a.strength*divisionTraits(a.quality).combat)}
  // Keep enough veteran strength on immediately threatened home borders.
  const danger=countryStats(c).holdings.filter(t=>(countyGraph[t.i]||[]).some(i=>atWar(c.id,territories[i].owner)))
   .map(t=>({t,enemy:(countyGraph[t.i]||[]).reduce((n,i)=>n+(garrison.get(i)||0),0),guard:own.filter(a=>a.county===t.i).reduce((n,a)=>n+a.strength*divisionTraits(a.quality).combat,0)}))
   .filter(x=>x.enemy>x.guard+8).sort((a,b)=>b.enemy-b.guard-(a.enemy-a.guard));
  const forces=own.filter(a=>!a.route?.length||daysElapsed-(a.lastMovementDay??daysElapsed)>=28);
  for(const a of forces){
   if(a.quality==='elite'&&danger.length){
    const threatened=danger[0],route=shortestCountyRoute(a.county,threatened.t.i,c.id);
    if(route&&route.length&&threatened.enemy>threatened.guard*1.2){a.route=route;a.plan=null;a.travelDays=0;threatened.guard+=a.strength*1.45;continue}
   }
   let best=null;
   for(const {t,guard,recapture} of targetPool){
    // Never send militia blindly against a veteran stronghold if an open
    // crossing exists. Veterans deliberately seek the contested front.
    for(const i of countyGraph[t.i]||[]){
     if(territories[i].owner!==c.id)continue;
     const path=shortestCountyRoute(a.county,i,c.id);if(path===null)continue;
     const committed=reservations.get(t.i)||0;
     const local=own.filter(x=>x.county===i).reduce((n,x)=>n+x.strength*divisionTraits(x.quality).combat,0);
     const defense=guard+3+(countries[t.owner]?.fort||0)*3;
     const needed=defense*1.2;
     const strength=a.strength*divisionTraits(a.quality).combat+committed+local*.35;
     const opposed=guard>0;
     const role=a.quality==='militia'?(opposed?45:-35):(opposed?-24:7);
     const gathering=opposed?(strength<needed?-Math.min(35,committed*.85):committed>needed*1.6?25:-15):committed*1.7;
     const score=path.length*4+role+gathering+Math.max(0,defense-strength)*(a.quality==='militia'?1.1:.28)-(recapture?32:0)-t.p*.25;
     if(!best||score<best.score)best={score,route:[...path,t.i],target:t.i};
    }
   }
   if(best){a.route=best.route;a.plan={threshold:a.quality==='elite'?.78:.84,blockedDays:0,stageUntil:daysElapsed};a.travelDays=0;a.entrench=0;a.auto=false;a.stallReason='';reservations.set(best.target,(reservations.get(best.target)||0)+a.strength*divisionTraits(a.quality).combat)}
  }
 }
}
// Emergency wartime AI: respond to real incursions, build an affordable
// defensive army, and turn open enemy crossings into actual attacks. This is
// deliberately deterministic rather than gated behind a tiny random chance.
function emergencyAiWarResponse(){
 for(const c of validCountries()){
  if((gameMode==='player'&&c.id===humanId)||!enemies(c.id).length)continue;
  const borders=[];
  for(const t of territories){
   if(!atWar(c.id,t.owner))continue;
   const ownNeighbors=(countyGraph[t.i]||[]).filter(i=>territories[i]?.owner===c.id);
   if(ownNeighbors.length)borders.push({t,ownNeighbors});
  }
  if(!borders.length)continue;
  let own=ownedArmies(c.id),enemy=enemies(c.id);
  const invasion=borders.some(({t})=>t.recentlyCapturedFrom===c.id&&daysElapsed-(t.captureDay||0)<365);
  const enemyNear=armies.filter(a=>enemy.includes(a.owner)&&borders.some(({t})=>a.county===t.i));
  const threatened=invasion||enemyNear.length>0;
  // A country facing invasion spends its accessible reserves on emergency
  // mobilization, unlike the routine AI budget which waits for a surplus.
  const baseDesired=Math.min(28,Math.ceil(Math.max(5,Math.ceil(countryStats(c).holdings.length/8),enemyNear.length*2+3)*(typeof aiChallenge!=='undefined'&&aiChallenge==='medium'?.9:1)));
  // Regular AI fields about 45% fewer divisions than the original target.
  // This limits army-size advantage without changing battlefield decisions.
  const challenge=typeof aiChallenge==='undefined'?'medium':aiChallenge;
  const desired=Math.max(2,Math.ceil(baseDesired*({easy:.57,medium:.55,hard:1.13})[challenge]));
  const reserve=threatened?Math.max(5,c.treasury*.12):Math.max(25,c.treasury*.4);
  // Defensive emergency funding is temporary and carries a political cost.
  if(threatened&&c.treasury<countryDivisionRecruitPrice(c,'militia')*3&&
     daysElapsed>=(c.lastWarTaxDay||-10000)+365&&(c.warTaxUntil||0)<=daysElapsed){
   c.warTaxUntil=daysElapsed+365;c.lastWarTaxDay=daysElapsed;
   c.stability=clamp(c.stability-2,5,99);
  }
  // Regular AI cannot replace a large army in a single emergency cycle.
  const maxRecruit=threatened?(typeof aiChallenge!=='undefined'&&aiChallenge==='hard'?3:2):1;
  for(let n=0;n<maxRecruit&&own.length<desired;n++){
   const veteran=threatened&&c.treasury>countryDivisionRecruitPrice(c,'elite')+reserve&&own.filter(a=>a.quality==='elite').length<Math.ceil(own.length*.55);
   let quality=veteran?'elite':'militia';
   let assessment=aiMilitaryRecruitmentCapacity(c,quality,threatened);
   // Expensive veterans shouldn't block affordable militia reinforcements.
   if(!assessment.affordable&&quality==='elite'){quality='militia';assessment=aiMilitaryRecruitmentCapacity(c,quality,threatened)}
   if(!assessment.affordable)break;
   const staging=borders.map(({t,ownNeighbors})=>({t,i:ownNeighbors[0],priority:
    (t.recentlyCapturedFrom===c.id?20:0)+
    armies.filter(a=>enemy.includes(a.owner)&&a.county===t.i).length*15+
    t.p*.4+t.e*.3})).sort((a,b)=>b.priority-a.priority)[0];
   if(!staging)break;
   c.treasury-=assessment.price;
   createArmy(c.id,staging.i,quality==='elite'?15:9,quality);
   own=ownedArmies(c.id);
  }
  // Counterattack occupied home counties; otherwise exploit ungarrisoned
  // enemy counties. Veterans respond to enemy divisions, militia spread out.
  const reserved=new Map();
  for(const a of own)if(a.route?.length&&daysElapsed-(a.lastMovementDay??daysElapsed)<14){
   const destination=a.route.at(-1);reserved.set(destination,(reserved.get(destination)||0)+1)
  }
  const possible=borders.map(({t,ownNeighbors})=>{
   const garrison=armies.filter(a=>a.owner===t.owner&&a.county===t.i);
   return {target:t.i,ownNeighbors,resistance:garrison.reduce((n,a)=>n+fieldStrength(a)*divisionTraits(a.quality).combat,0),
    recapture:t.recentlyCapturedFrom===c.id&&daysElapsed-(t.captureDay||0)<365,
    pop:t.p,economy:t.e};
  });
  const assaulting=own.filter(a=>a.strength>0).sort((a,b)=>(a.quality==='militia'?0:1)-(b.quality==='militia'?0:1)||a.id-b.id);
  // Roughly half of the available force commits to exposed, ungarrisoned land;
  // the remaining formations can counterattack defended counties or hold reserves.
  const openQuota=Math.ceil(assaulting.length*.5);
  for(const [assaultIndex,a] of assaulting.entries()){
   // Retain productive offensives. Stale routes and stagnant holding orders
   // are actively replaced rather than left to sit at the frontier.
   if(a.route?.length&&daysElapsed-(a.lastMovementDay??daysElapsed)<14)continue;
   let best=null;
   for(const x of possible){
    if(assaultIndex<openQuota&&possible.some(y=>y.resistance===0)&&x.resistance>0)continue;
    const paths=x.ownNeighbors.map(i=>({i,path:shortestCountyRoute(a.county,i,c.id)})).filter(x=>x.path!==null).sort((a,b)=>a.path.length-b.path.length);
    if(!paths.length)continue;
    const path=paths[0],load=reserved.get(x.target)||0;
    const professional=a.quality==='elite';
    const score=path.path.length*6+load*(x.resistance>0?2:24)+
      (professional?(x.resistance>0?-24:8):(x.resistance>0?37:-28))+
      x.resistance/(fieldStrength(a)*divisionTraits(a.quality).combat+1)*(professional?9:23)-
      (x.recapture?30:0)-x.pop*.45-x.economy*.35;
    if(!best||score<best.score)best={score,route:[...path.path,x.target],target:x.target};
   }
   if(best){
    a.route=best.route;a.plan={threshold:0,blockedDays:0,stageUntil:0,failures:0};
    a.stance='.82';a.auto=false;a.entrench=0;a.travelDays=0;
    a.lastMovementDay=daysElapsed;
    reserved.set(best.target,(reserved.get(best.target)||0)+1);
   }
  }
 }
}
function countyComponents(owner){
 const indices=territories.filter(t=>t.owner===owner).map(t=>t.i),remaining=new Set(indices),parts=[];
 while(remaining.size){
  const first=remaining.values().next().value,part=[],queue=[first];remaining.delete(first);
  for(let head=0;head<queue.length;head++){
   const cur=queue[head];part.push(cur);
   for(const next of countyGraph[cur])if(remaining.delete(next))queue.push(next);
  }
  parts.push(part);
 }
 return parts.sort((a,b)=>nums(b.map(i=>territories[i].p))-nums(a.map(i=>territories[i].p)));
}
function alignmentScore(county,candidate,former){
 let score=countryStats(candidate).power*.012;
 if(county.region===candidate.origin)score+=7;
 if(alliance(former,candidate.id))score+=5;
 if(atWar(former,candidate.id))score-=4;
 const centroid=countryStats(candidate).holdings.slice(0,20);
 if(centroid.length){let similar=centroid.filter(t=>t.region===county.region).length/centroid.length;score+=similar*6}
 return score+rand()*4;
}
function fixEnclaves(silent=false){
 // Wartime occupations and temporarily disconnected holdings are NOT gifts
 // to neutral neighbors. Keep original sovereignty until a legal peace,
 // capitulation, uprising, or explicit territorial demand changes it.
 if(!silent)return 0;
 let changed=0;
 for(const c of validCountries()){
  const parts=countyComponents(c.id);
  if(parts.length<=1)continue;
  // The largest connected territory remains the homeland.
  for(const part of parts.slice(1)){
   const options=new Set();
   for(const i of part)for(const j of countyGraph[i])if(territories[j].owner!==c.id)options.add(territories[j].owner);
   if(!options.size)continue; // Islands with no land border remain attached by sea.
   const recipients=[...options].filter(id=>countryStats(countries[id]).holdings.length);
   if(!recipients.length)continue;
   const focal=territories[part[0]];
   recipients.sort((a,b)=>alignmentScore(focal,countries[b],c.id)-alignmentScore(focal,countries[a],c.id));
   const newOwner=recipients[0];
   for(const i of part)territories[i].owner=newOwner;
   changed+=part.length;
   if(!silent)log('Isolated territory of '+c.name+' realigns with '+countries[newOwner].name+' ('+part.length+' counties).','peace');
   invalidate();
  }
 }
 if(changed){retreatDisplacedArmies();invalidate()}
 return changed;
}
function capitulate(c){
 const remaining=countryStats(c).holdings;
 if(!remaining.length||c.surrendered)return false;
 const invaders=enemies(c.id).filter(id=>countries[id]&&!countries[id].surrendered&&countryStats(countries[id]).holdings.length);
 if(!invaders.length)return false;
 const beneficiaries=new Map();
 let unassigned=new Set(remaining.map(t=>t.i)),guard=0;
 // Transfers propagate inward from actual frontiers, keeping recipients contiguous.
 while(unassigned.size&&guard++<remaining.length+2){
  let progressed=false;
  for(const i of [...unassigned]){
   const t=territories[i],options=[...new Set(countyGraph[i].map(j=>territories[j].owner))].filter(id=>invaders.includes(id)&&countryStats(countries[id]).holdings.length);
   if(!options.length)continue;
   options.sort((a,b)=>{
    const evaluate=id=>alignmentScore(t,countries[id],c.id)+(invaders.includes(id)?8:0)+countryStats(countries[id]).power*.015;
    return evaluate(b)-evaluate(a);
   });
   const recipient=options[0];t.owner=recipient;unassigned.delete(i);
   beneficiaries.set(recipient,(beneficiaries.get(recipient)||0)+1);progressed=true;invalidate();
  }
  if(!progressed)break;
 }
 c.surrendered=true;c.stability=0;
 const leftover=unassigned.size;
 // Remaining islands and disconnected enclaves are negotiated away to the
 // most closely aligned surviving government, even without a land frontier.
 if(leftover){
  const candidates=validCountries().filter(other=>invaders.includes(other.id));
  for(const i of unassigned){
   if(!candidates.length)break;
   const t=territories[i],preferred=[...candidates].sort((a,b)=>alignmentScore(t,b,c.id)-alignmentScore(t,a,c.id))[0];
   t.owner=preferred.id;beneficiaries.set(preferred.id,(beneficiaries.get(preferred.id)||0)+1);invalidate();
  }
 }
 const seizedTreasury=Math.max(0,c.treasury||0);
 const victor=[...beneficiaries.keys(),...invaders].filter(id=>id!==c.id&&countryStats(countries[id]).holdings.length).sort((a,b)=>
  (beneficiaries.get(b)||0)-(beneficiaries.get(a)||0)||countryStats(countries[b]).power-countryStats(countries[a]).power)[0];
 if(victor!==undefined){countries[victor].treasury=(countries[victor].treasury||0)+seizedTreasury;c.treasury=0}
 wars=wars.filter(w=>!w.includes(c.id));pacts=pacts.filter(p=>!p.includes(c.id));
 if(typeof restorePeaceArmies==='function')restorePeaceArmies();
 armies=armies.filter(a=>a.owner!==c.id&&territories[a.county]?.owner===a.owner);
 const winners=[...beneficiaries].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id,n])=>countries[id].name+' ('+n+')').join(', ');
 log(c.name+' capitulates. Territories transfer to '+(winners||'victorious belligerents')+'.'+(victor!==undefined?' '+countries[victor].name+' captures '+Math.round(seizedTreasury)+' treasury.':'')+(leftover?' Remote holdings are surrendered by agreement.':''),'warlog');
 if(gameMode==='player'&&c.id===humanId)armyMessage='Your government has capitulated. Select another faction to continue.';
 invalidate();return true;
}
function checkCapitulations(days){
 for(const c of validCountries()){
  if(c.surrendered||!enemies(c.id).length)continue;
  const stats=countryStats(c),hold=stats.holdings.length,initial=c.initialCount||hold;
  const lost=1-hold/Math.max(1,initial);
  const fighters=ownedArmies(c.id).reduce((total,a)=>total+a.strength,0);
  // A country that is merely losing battles or under political strain must
  // remain in the game. Only exceptionally terminal conditions permit surrender.
  const breakdown=c.stability<=5;
  c.collapseCrisisDays=breakdown?(c.collapseCrisisDays||0)+days:0;
  const economicRuin=stats.economy<.15;
  c.economicRuinDays=economicRuin?(c.economicRuinDays||0)+days:0;
  const militaryRuin=fighters===0&&c.readiness<=5&&c.treasury<5;
  c.militaryRuinDays=militaryRuin?(c.militaryRuinDays||0)+days:0;
  // Losing a few border counties, or a spell of instability, is not a reason
  // to surrender the rest of a functioning country. Only near-total conquest
  // or a prolonged, compounded collapse can trigger capitulation.
  const conquest=lost>=.95;
  const exhaustedArmy=fighters<Math.max(5,stats.pop*.8);
  // The government may concede before the last county falls if it is already
  // substantially overrun AND its political or military institutions fail.
  const politicalCollapse=lost>=.7&&c.stability<=12&&c.collapseCrisisDays>=120&&exhaustedArmy;
  const totalRuin=lost>=.85&&c.stability<=22&&(exhaustedArmy||economicRuin)&&
    (c.economicRuinDays>=90||c.militaryRuinDays>=90||c.collapseCrisisDays>=90);
  if(conquest||((politicalCollapse||totalRuin)&&chance(1.2,days)))capitulate(c);
 }
}
function armyDisplay(){
 const player=gameMode==='player'&&humanId!==null?countries[humanId]:null;
 const current=player?ownedArmies(player.id):[];
 $('armyCountry').textContent=player?player.name+' · '+current.length+' formations':'Switch to Play as a Faction to command armies.';
 $('armyTotal').textContent=current.length+' FORMATIONS';
 $('armyMessage').textContent=armyMessage||(awaitingDestination?'Click a county on the map to set your destination.':'Select a formation to issue orders.');
 const previous=$('armySelect').value;
 $('armySelect').innerHTML=current.map(a=>'<option value="'+a.id+'">Division '+a.id+' — '+describeCounty(territories[a.county])+'</option>').join('');
 if(current.some(a=>String(a.id)===previous))$('armySelect').value=previous;
 else if(current.some(a=>a.id===selectedArmyId))$('armySelect').value=String(selectedArmyId);
 else if(current.length){selectedArmyId=current[0].id;$('armySelect').value=String(selectedArmyId)}
 else selectedArmyId=null;
 const active=selectedArmy();
 $('armyRoster').innerHTML=current.map(a=>'<div class="army-entry '+(a.id===selectedArmyId?'selected':'')+'" data-id="'+a.id+'"><div>Division '+a.id+' · '+divisionName(a.quality)+'<small>'+describeCounty(territories[a.county])+(a.route.length?' → '+describeCounty(territories[a.route.at(-1)]):' · Holding')+((a.marchFatigue||0)+(a.supplyPenalty||0)>.1?' · Temporary fatigue −'+((a.marchFatigue||0)+(a.supplyPenalty||0)).toFixed(1):'')+(a.lastBattleResult&&daysElapsed-(a.lastBattleDay||0)<90?' · '+a.lastBattleResult:'')+'</small></div><strong>'+Math.round(a.strength)+' ⚔</strong></div>').join('');
 $('armyRoster').querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>{selectedArmyId=+el.dataset.id;armyDisplay();drawArmyMap()});
 for(const id of ['orderArmy','splitArmy','entrenchArmy','holdArmy','autoArmy'])$(id).disabled=!active;
 $('recruitArmy').disabled=!player||!countryStats(player).holdings.length;
}
function drawArmyMap(){
 if(!geomReady||!geoGroup)return;
 geoGroup.select('.unit-layer').remove();
 const layer=geoGroup.append('g').attr('class','unit-layer');
 const hostile=gameMode==='player'?new Set(enemies(humanId)):null;
 const visible=gameMode==='player'?armies.filter(a=>a.owner===humanId||hostile.has(a.owner)):armies.filter(a=>a.strength>=12);
 const locations=new Map();
 for(const a of visible){
  const t=territories[a.county];if(!t)continue;
  const count=locations.get(a.county)||0;locations.set(a.county,count+1);
  const angle=count*2.39996,radius=count===0?0:Math.min(8,2.7+Math.sqrt(count)*1.35),x=t.cx+Math.cos(angle)*radius,y=t.cy+Math.sin(angle)*radius;
  const isEnemy=gameMode==='player'&&a.owner!==humanId;
  layer.append('circle').attr('class','army-marker'+(isEnemy?' hostile':'')+(a.id===selectedArmyId?' selected':'')).attr('cx',x).attr('cy',y).attr('r',isEnemy?5:4.5).attr('fill',isEnemy?'#e27c72':a.owner===humanId?'#ffe0a1':'#daebe9')
   .attr('data-army-id',a.id).append('title').text(countries[a.owner]?.name+' · Division '+a.id+' · '+Math.round(a.strength)+' strength');
  layer.append('text').attr('class','army-type-symbol').attr('x',x).attr('y',y+1.7).attr('text-anchor','middle').attr('font-size','5.1px').attr('font-weight','900').attr('fill','#18202a').attr('pointer-events','none').text(a.quality==='elite'?'V':'M');
 }
 const active=selectedArmy();
 // Army destinations are conveyed in the roster, without cluttering the map
 // with persistent route lines.
 layer.on('click',ev=>{
  const node=ev.target.closest('[data-army-id]');if(!node)return;
  const id=+node.getAttribute('data-army-id'),army=armies.find(a=>a.id===id);
  if(army?.owner===humanId){ev.stopPropagation();selectedArmyId=id;setPanel('armies');armyDisplay();drawArmyMap()}
 });
}
const sourceGenerate=generate;
generate=function(reuse=false){
 sourceGenerate(reuse);if(!geomReady)return;
 initializeArmies();fixEnclaves(true);
 for(const c of validCountries()){c.initialCount=countryStats(c).holdings.length;c.initialPower=countryStats(c).power}
 armyDisplay();drawArmyMap();update();
};
const sourceTick=simulatePeriod;
simulatePeriod=function(){
 const before=daysElapsed;
 sourceTick();
 if(!geomReady)return;
 const days=Math.max(1,daysElapsed-before);
 moveArmies(days);
 automaticArmyOrders(days);
 proactiveAiBorderAdvance();
 emergencyAiWarResponse();
 // Re-plan every simulation step: captured counties, failed battles, and
 // changed borders otherwise leave automated formations idle indefinitely.
 if(gameMode==='player'&&humanId!==null&&typeof assignFrontRoutes==='function'&&countries[humanId]){
  assignFrontRoutes(countries[humanId]);
 }
 checkCapitulations(days);
 if(daysElapsed-lastContinuityDay>=28){fixEnclaves();lastContinuityDay=daysElapsed}
 invalidate();update();
};
tick=simulatePeriod;
// Start/pause must use the updated simulation function, not the earlier closure.
start=function(){if(timer){stop();return}timer=setInterval(simulatePeriod,+interval.value);$('play').textContent='❚❚ Pause'};
$('play').onclick=start;
$('step').onclick=()=>{stop();simulatePeriod()};
interval.onchange=()=>{if(timer){stop();start()}};
const preMilitaryUpdate=update;
update=function(){
 // At extreme pacing, update geography at a readable frame cadence.
 if(timer&&+interval.value<=100&&Date.now()-lastArmyRender<230)return;
 lastArmyRender=Date.now();
 preMilitaryUpdate();armyDisplay();drawArmyMap();
};
$('armySelect').onchange=()=>{selectedArmyId=+$('armySelect').value;armyDisplay();drawArmyMap()};
$('recruitArmy').onclick=()=>{
 if(gameMode!=='player'||humanId===null)return;
 const c=countries[humanId],t=territories[selectedCounty??-1];
 if(!t||t.owner!==humanId){armyMessage='First click one of your counties on the map.';armyDisplay();return}
 const quality=$('divisionQuality').value,price=divisionRecruitPrice(quality);
 if(c.treasury<price){armyMessage='A '+quality+' division costs '+price+' treasury; its ongoing upkeep also depends on quality.';armyDisplay();return}
 c.treasury-=price;const a=createArmy(humanId,t.i,quality==='militia'?9:15,quality);selectedArmyId=a.id;
 armyMessage='Division '+a.id+' ('+quality+') raised for '+price+' treasury in '+describeCounty(t)+'.';log(c.name+' raises a '+quality+' division in '+describeCounty(t)+'.');
 update();
};
$('orderArmy').onclick=()=>{if(!selectedArmy())return;awaitingDestination=true;armyMessage='Select a destination county on the map. A route will be calculated automatically.';armyDisplay();setPanel(null)};
$('splitArmy').onclick=()=>{
 const a=selectedArmy();if(!a||a.strength<6){armyMessage='Formation needs at least 6 strength to split.';armyDisplay();return}
 const half=Math.floor(a.strength/2);a.strength-=half;let n=createArmy(a.owner,a.county,half,a.quality);n.stance=a.stance;selectedArmyId=n.id;armyMessage='Division '+n.id+' splits off with '+half+' strength.';update();
};
$('entrenchArmy').onclick=()=>{const a=selectedArmy();if(!a)return;a.route=[];a.entrench=clamp(a.entrench+.25,0,1);armyMessage='Division '+a.id+' digs in. Defensive strength increases.';update()};
$('holdArmy').onclick=()=>{const a=selectedArmy();if(!a)return;a.route=[];a.auto=false;armyMessage='Division '+a.id+' holds position.';update()};
$('autoArmy').onclick=()=>{const a=selectedArmy();if(!a)return;a.auto=true;armyMessage='Division '+a.id+' assigned to frontier defense.';update()};
document.querySelector('#map').addEventListener('click',ev=>{
 if(!awaitingDestination)return;
 const node=ev.target.closest('[data-i]');if(!node)return;
 ev.preventDefault();ev.stopPropagation();awaitingDestination=false;
 orderArmyTo(selectedArmy(),+node.getAttribute('data-i'));setPanel('armies');update();
},true);
document.querySelector('#help .modal p:last-of-type').textContent='Tip: choose day, week, or month steps, including monthly advancement every 0.1 seconds. In Play as a Faction mode open Armies on the right rail, select or recruit a formation, click Move / Attack, then click a destination county. Armies march along connected county routes and fight when they cross an active war frontier. Fragmented enclaves realign with bordering countries, while critically weakened governments may capitulate.';
// The existing async geometry loader will call this final generate wrapper.
