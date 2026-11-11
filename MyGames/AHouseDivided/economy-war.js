/* National investments, military scale, peace guarantees, war fatigue and quiet alerts. */
function militaryPosture(c){
 const s=countryStats(c),forces=ownedArmies(c.id);
 const effective=forces.reduce((n,a)=>n+Math.max(0,a.strength),0)/12;
 const capacity=Math.max(2,s.pop*.48+s.holdings.length/42);
 const ratio=effective/capacity;
 const tier=ratio<.5?'underdefended':ratio<=1.15?'balanced':ratio<=1.75?'strong':'oversized';
 const rebelRisk=tier==='underdefended'?1.3:tier==='balanced'?.88:tier==='strong'?.64:clamp(.5/Math.sqrt(ratio),.22,.52);
 return {tier,ratio,effective,capacity,rebelRisk};
}

const originalScaleAdvance=advanceCabinet;
advanceCabinet=function(days){
 originalScaleAdvance(days);if(days<=0)return;
 const months=days/30.44;
 for(const c of validCountries()){
  const p=militaryPosture(c);
  const stability=p.tier==='underdefended'?-.12:p.tier==='balanced'?.06:p.tier==='strong'?.12:-Math.min(.55,.16+(p.ratio-1.75)*.12);
  const readiness=p.tier==='underdefended'?-.05:p.tier==='oversized'?-.13:0;
  c.stability=clamp(c.stability+stability*months,5,99);
  c.readiness=clamp(c.readiness+readiness*months,5,100);
  // Sustained fighting affects the economy and government, in addition to the
  // reduced military strength and tax collection tracked elsewhere.
  const fatigue=c.warExhaustion||0;
  if(fatigue>25){
   c.stability=clamp(c.stability-(fatigue-25)/270*months,5,99);
   c.readiness=clamp(c.readiness-(fatigue-25)/520*months,5,100);
  }
 }
};

const newInvestments={
 stimulus:{name:'Economic stimulus',cost:65,days:120,description:'Permanent productivity +4%; strongest in productive territories.',finish:c=>{c.baseEconomyFactor=clamp(c.baseEconomyFactor+.04,.45,1.8)}},
 security:{name:'Civil security',cost:55,days:85,description:'Stability +5; strength +3.',finish:c=>{c.stability=clamp(c.stability+5,5,99);c.readiness=clamp(c.readiness+3,5,100)}},
 training:{name:'Professional army training',cost:65,days:95,description:'Strength +9; morale +4.',finish:c=>{c.readiness=clamp(c.readiness+9,5,100);c.morale=clamp(c.morale+4,5,99)}},
 integration:{name:'Regional integration',cost:70,days:125,description:'Integration +0.07; stability +4. Eases governing conquered territory.',finish:c=>{c.integration=clamp((c.integration||0)+.07,0,.58);c.stability=clamp(c.stability+4,5,99)}},
 veterans:{name:'Veterans and civilian relief',cost:55,days:80,description:'War exhaustion −12; stability +3.',finish:c=>{c.warExhaustion=clamp((c.warExhaustion||0)-12,0,100);c.stability=clamp(c.stability+3,5,99)}}
};
Object.assign(nationalPrograms,newInvestments);
// Six distinct nationwide initiatives; obsolete overlapping investments are removed.
for(const id of Object.keys(nationalPrograms))if(!['infrastructure','industry','defense','housing','integration','unity'].includes(id))delete nationalPrograms[id];
// Equal starting prices make the choice about strategic need, not a cheap favorite.
for(const program of Object.values(nationalPrograms))program.cost=80;
nationalPrograms.infrastructure.description='Permanent economic productivity and stronger transport infrastructure across all counties.';
nationalPrograms.industry.description='Industrial output and taxable resource production grow nationwide.';
nationalPrograms.defense.description='Strength and lasting fortification improve; does not create free troops.';
nationalPrograms.housing.description='Population recovery and stability improve across the country.';
nationalPrograms.integration.description='Reduce the cost and political strain of integrating conquered regions.';
nationalPrograms.unity.description='Reduce war exhaustion and restore civic stability after hardship.';
function programUses(c,id){return c.completedInitiatives?.[id]||0}
function programEffect(c,id){return [1,.65,.4][programUses(c,id)]??0}
function programPrice(c,id){
 const base=nationalPrograms[id].cost,s=countryStats(c);
 return Math.ceil(base+Math.max(0,s.holdings.length-25)*.09+Math.max(0,s.pop-7)*.3);
}
for(const [id,p] of Object.entries(nationalPrograms)){
 const complete=p.finish;
 p.finish=function(c){
  const weight=programEffect(c,id);
  const attrs=['baseEconomyFactor','stability','readiness','fort','morale','warExhaustion','inclusion','integration','recovery','industryBonus'];
  const before=Object.fromEntries(attrs.map(k=>[k,c[k]]));
  const counties=countryStats(c).holdings;
  const local= new Map(counties.map(t=>[t.i,{p:t.p,res:t.res,infra:t.infra}]));
  complete(c);
  for(const k of attrs)if(typeof c[k]==='number'&&typeof before[k]==='number')c[k]=before[k]+(c[k]-before[k])*weight;
  for(const t of counties){const previous=local.get(t.i);for(const k of ['p','res','infra'])if(typeof previous[k]==='number'&&typeof t[k]==='number')t[k]=previous[k]+(t[k]-previous[k])*weight}
  c.completedInitiatives??={};c.completedInitiatives[id]=(c.completedInitiatives[id]||0)+1;
 };
}
const priorInvestmentLaunch=launchNationalProgram;
launchNationalProgram=function(c,id){
 const p=nationalPrograms[id];if(!p||programEffect(c,id)===0)return false;
 const oldPrice=p.cost;p.cost=programPrice(c,id);
 try{return priorInvestmentLaunch(c,id)}finally{p.cost=oldPrice}
};
const priorInvestmentCabinet=renderCabinet;
renderCabinet=function(force=false){
 priorInvestmentCabinet(force);
 const c=countries[humanId],section=document.querySelector('#cabinetBody .national-programs');
 if(!c||!section||gameMode!=='player')return;
 const select=section.querySelector('#nationalProgramChoice'),desc=section.querySelector('#nationalDescription'),button=section.querySelector('#launchNationalProgram');
 if(!select||!desc||!button)return;
 for(const opt of select.options){const id=opt.value,p=nationalPrograms[id];opt.textContent=p.name+' · '+programPrice(c,id)+' treasury'+(programEffect(c,id)===0?' · completed':'')}
 const describe=()=>{const id=select.value,p=nationalPrograms[id],factor=programEffect(c,id),cost=programPrice(c,id);
  desc.textContent=p.description+' · '+p.days+' days · '+Math.round(factor*100)+'% effectiveness'+(factor<1?' (diminishing returns)':'');
  button.disabled=factor<=0||c.treasury<cost||nationalQueue(c).length>=2||nationalQueue(c).some(x=>x.id===id);
 };
 select.onchange=describe;describe();
};

/* Non-aggression is distinct from military alliances and cannot call allies into war. */
const nonAggression=new Map();
function hasNonAggression(a,b){return (nonAggression.get(pactKey(a,b))||0)>daysElapsed}
function signNonAggression(a,b,years=5){
 const expires=daysElapsed+Math.round(years*365.25);
 nonAggression.set(pactKey(a,b),expires);
 log(countries[a].name+' and '+countries[b].name+' sign a '+years+'-year non-aggression pact.','peace');
}
const priorWarDeclaration=war;
war=function(a,b){if(hasNonAggression(a,b))return false;return priorWarDeclaration(a,b)};
const basePactGenerate=generate;
generate=function(reuse=false){nonAggression.clear();basePactGenerate(reuse)};
const basePactAdvance=advanceCabinet;
advanceCabinet=function(days){
 basePactAdvance(days);
 if(days<=0)return;
 for(const [key,until] of [...nonAggression])if(daysElapsed>=until){
  nonAggression.delete(key);const [a,b]=key.split(':').map(Number);
  if(countries[a]&&countries[b])log('The non-aggression pact between '+countries[a].name+' and '+countries[b].name+' expires.','peace');
 }
};

function borderSelection(own,other){return territories.filter(t=>t.owner===other.id&&(countyGraph[t.i]||[]).some(j=>territories[j].owner===own.id))}
// A demand may extend beyond the original border, but every demanded county
// must connect through other demanded counties to the demanding country.
function connectedBorderDemand(owner,ids){
 const chosen=new Set(ids),visited=new Set(),queue=[];
 for(const i of chosen)if((countyGraph[i]||[]).some(j=>territories[j]?.owner===owner)){visited.add(i);queue.push(i)}
 for(let p=0;p<queue.length;p++)for(const j of countyGraph[queue[p]]||[])if(chosen.has(j)&&!visited.has(j)){visited.add(j);queue.push(j)}
 return chosen.size>0&&visited.size===chosen.size;
}
function borderPayment(own,count){return Math.max(100,Math.ceil(own.treasury*.025*count))}
function demandOdds(own,other,count){
 const advantage=countryStats(own).power/Math.max(.1,countryStats(other).power);
 const relation=relationRating(own,other);
 const strengthRequired=1.2+(count-1)*.43;
 return clamp(.28+(advantage-strengthRequired)*.24+(relation-50)*.0025,.02,.90);
}
let borderPick=null;
const borderDock=document.createElement('div');borderDock.className='border-pick-dock';borderDock.hidden=true;
borderDock.innerHTML='<b>SELECT CONNECTED COUNTIES</b><span id="borderPickStatus"></span><button id="borderPickSend" disabled>Send demand</button><button id="borderPickCancel">Cancel</button>';
document.querySelector('.map-wrap').append(borderDock);
function cancelBorderPick(){borderPick=null;borderDock.hidden=true;document.querySelectorAll('.border-picked').forEach(x=>x.classList.remove('border-picked'));}
function refreshBorderPick(){
 if(!borderPick)return;
 const own=countries[humanId],other=countries[borderPick.target];
 if(!own||!other||atWar(own.id,other.id)||alliance(own.id,other.id)||hasNonAggression(own.id,other.id)){cancelBorderPick();return}
 borderPick.counties=new Set([...borderPick.counties].filter(i=>territories[i]?.owner===other.id));
 const count=borderPick.counties.size,cost=borderPayment(own,count),odds=demandOdds(own,other,count),connected=connectedBorderDemand(own.id,borderPick.counties);
 document.getElementById('borderPickStatus').textContent=count?(connected?count+' connected counties · '+cost+' treasury · '+Math.round(odds*100)+'% acceptance':count+' selected · connect every county to your border before sending'):'Click their counties on the map. Select a connected chain from your border.';
 document.getElementById('borderPickSend').disabled=!connected||own.treasury<cost;
 document.querySelectorAll('.border-picked').forEach(x=>x.classList.remove('border-picked'));
 for(const i of borderPick.counties)countyEls[i]?.classList.add('border-picked');
}
document.getElementById('borderPickCancel').onclick=()=>{cancelBorderPick();renderBilateral()};
document.getElementById('map').addEventListener('click',event=>{
 if(!borderPick)return;
 const node=event.target.closest('[data-i]');if(!node)return;
 event.preventDefault();event.stopImmediatePropagation();
 const i=+node.dataset.i,own=countries[humanId],other=countries[borderPick.target];
 if(territories[i]?.owner!==other.id){
  document.getElementById('borderPickStatus').textContent='Choose land belonging to '+other.name+'.';return;
 }
 if(borderPick.counties.has(i))borderPick.counties.delete(i);else borderPick.counties.add(i);
 refreshBorderPick();
},true);
document.getElementById('borderPickSend').onclick=()=>{
 if(!borderPick)return;
 const own=countries[humanId],other=countries[borderPick.target];
 const chosen=[...borderPick.counties].map(i=>territories[i]).filter(t=>t&&t.owner===other.id);
 const count=chosen.length,cost=borderPayment(own,count),odds=demandOdds(own,other,count);
 if(!count||!connectedBorderDemand(own.id,chosen.map(t=>t.i))||own.treasury<cost||alliance(own.id,other.id)||hasNonAggression(own.id,other.id))return;
 initAgency(own);initAgency(other);
 // Repeated and larger territorial ultimatums alarm surrounding governments.
 own.pressureDemands=(own.pressureDemands||[]).filter(day=>daysElapsed-day<365*3);
 own.pressureDemands.push(daysElapsed);
 const alarm=Math.min(22,3+count*2+Math.max(0,own.pressureDemands.length-1)*3);
 own.threat=clamp((own.threat||0)+alarm,0,100);
 own.reputation=clamp((own.reputation??55)-Math.ceil(alarm*.55),0,100);
 for(const neighbor of validCountries().filter(x=>x.id!==own.id&&x.id!==other.id&&bordering(x.id,own.id))){
  initAgency(neighbor);
  neighbor.relations[own.id]=clamp((neighbor.relations[own.id]||0)-Math.ceil(alarm*.9),-100,100);
 }
 own.relations[other.id]=clamp((own.relations[other.id]||0)-Math.min(35,12+count*4),-100,100);
 if(rand()<odds){
  for(const t of chosen)t.owner=own.id;
  own.treasury-=cost;other.treasury=(other.treasury||0)+cost;
  own.stability=clamp(own.stability-1,5,99);signNonAggression(own.id,other.id);
  log(other.name+' cedes '+count+' connected counties to '+own.name+' for '+cost+' treasury.','peace');
  actionNotice=other.name+' accepts: '+count+' counties transferred for '+cost+' treasury. Five-year non-aggression signed.';
 }else{
  own.stability=clamp(own.stability-2,5,99);
  actionNotice=other.name+' rejects your '+count+'-county demand. No payment made.';
  log(other.name+' rejects a territorial demand from '+own.name+'.');
 }
 cancelBorderPick();invalidate();update();renderBilateral();
};
const oldTerritoryLeverage=renderBilateral;
renderBilateral=function(){
 oldTerritoryLeverage();
 const own=countries[humanId],other=diplomacyTarget();
 if(gameMode!=='player'||!own||!other||own.id===other.id||relations.hidden)return;
 const region=relations.querySelector('.bilateral-extra');
 region?.querySelector('[data-leverage="demand"]')?.remove();
 const locked=atWar(own.id,other.id)||alliance(own.id,other.id)||hasNonAggression(own.id,other.id);
 const pact=document.createElement('div');pact.className='peace-pact-controls';
 const until=nonAggression.get(pactKey(own.id,other.id));
 pact.innerHTML=hasNonAggression(own.id,other.id)?'<small>NON-AGGRESSION · '+Math.ceil((until-daysElapsed)/365.25)+' years left</small>':
 '<button id="offerNonAggression" '+(locked?'disabled':'')+'>Offer 5-year non-aggression pact</button>';
 relations.querySelector('.bilateral-actions')?.append(pact);
 pact.querySelector('button')?.addEventListener('click',()=>{
  const relation=relationRating(own,other),odds=clamp(.28+(relation-50)*.009+(own.diplomacy+other.diplomacy)*.16,.06,.91);
  if(rand()<odds){signNonAggression(own.id,other.id);actionNotice=other.name+' accepts the five-year non-aggression pact.'}
  else actionNotice=other.name+' declines the non-aggression proposal.';
  update();renderBilateral();
 });
 if(!bordering(own.id,other.id)||locked)return;
 const eligible=borderSelection(own,other);
 if(!eligible.length)return;
 const button=document.createElement('button');button.id='beginBorderDemand';button.textContent='Demand connected territory';
 button.disabled=false;
 relations.querySelector('.bilateral-actions')?.append(button);
 button.onclick=()=>{
  borderPick={target:other.id,counties:new Set()};borderDock.hidden=false;
  // Keep the target's diplomatic panel visible until the demand is submitted.
  refreshBorderPick();
 };
};

// Front-line diplomacy may never bypass a five-year peace guarantee.
const oldPoliticalWarClick=document.getElementById('warBtn').onclick;
document.getElementById('warBtn').onclick=function(){
 const own=countries[humanId],other=countries[+document.getElementById('targetCountry').value];
 if(own&&other&&hasNonAggression(own.id,other.id)){
  actionNotice='A non-aggression pact prevents war until it expires.';update();return;
 }
 oldPoliticalWarClick();
};
const oldPeacefulFront=renderNationalFront;
renderNationalFront=function(){oldPeacefulFront();};
const previousPactUpdate=update;
update=function(){previousPactUpdate();
 const own=countries[humanId],other=diplomacyTarget();
 if(own&&other&&hasNonAggression(own.id,other.id))relations.querySelector('[data-diplomacy="war"]')?.setAttribute('disabled','');
 const world=cards.world;
 if(world){for(const el of world.querySelectorAll('*'))if(el.children.length===0&&/Est\. displaced \(M\)/i.test(el.textContent))el.closest('.stat,.metric')?.remove()}
};

// Non-pausing alerts are deliberately throttled so rapid simulation stays calm.
const noticeCooldown=new Map();
function quietNotice(kind,message){
 if(gameMode!=='player'||humanId===null||noticeOpen||agencyPending)return;
 const now=Date.now(),last=noticeCooldown.get(kind)||0;
 if(now-last<9000)return;noticeCooldown.set(kind,now);
 const box=document.createElement('div');box.className='army-toast';box.textContent=message;
 toastHolder.append(box);
 while(toastHolder.children.length>3)toastHolder.firstElementChild.remove();
 setTimeout(()=>box.remove(),5000);
}
const oldQuietLog=log;
log=function(message,type=''){
 oldQuietLog(message,type);
 if(gameMode!=='player'||humanId===null)return;
 const own=countries[humanId];if(!own)return;
 if(message.includes(own.name+' completes '))quietNotice('project','✓ '+message);
 else if(message.includes(own.name+' and ')&&/sign a defense treaty|form a defense alliance|sign a .*non-aggression pact/i.test(message))quietNotice('treaty','◇ '+message);
 else if(/cedes \d+ border counties/.test(message)&&message.includes(own.name))quietNotice('border','▣ '+message);
 else if(message.includes(own.name)&&/loses an unfinished construction project|withdraws from its defense pact/i.test(message))quietNotice('setback','! '+message);
 else if(message.includes(' declares war on ')&&!message.endsWith(' on '+own.name+'.')){
  const actors=message.split(' declares war on '),a=validCountries().find(c=>c.name===actors[0]);
  if(a&&bordering(own.id,a.id))quietNotice('nearwar','⚔ '+message);
 }
};
let lastFatigueZone=0,lastTreasureZone=0;
const originalQuietAdvance=advanceCabinet;
advanceCabinet=function(days){
 originalQuietAdvance(days);if(days<=0||gameMode!=='player'||humanId===null)return;
 const c=countries[humanId];if(!c)return;
 const zone=c.warExhaustion>=75?3:c.warExhaustion>=50?2:c.warExhaustion>=25?1:0;
 if(zone>lastFatigueZone)quietNotice('fatigue','! War exhaustion reaches '+Math.round(c.warExhaustion)+'/100. Stability and income are suffering.');
 lastFatigueZone=zone;
 const low=c.treasury<25?1:0;
 if(low&&!lastTreasureZone&&recurringLedger(c).net<0)quietNotice('treasury','! Treasury nearly empty. Cut spending or raise income.');
 lastTreasureZone=low;
};

// Simple, live, decision-facing summary in Government.
const originalPostureCabinet=renderCabinet;
renderCabinet=function(force=false){
 originalPostureCabinet(force);
 const c=countries[humanId],body=document.getElementById('cabinetBody');
 if(!c||!body||gameMode!=='player')return;
 const p=militaryPosture(c),ledger=recurringLedger(c),panel=document.createElement('div');
 panel.className='posture-summary';
 const names={underdefended:'Underdefended',balanced:'Balanced',strong:'Strong',oversized:'Overextended'};
 const consequences={underdefended:'Cheap; higher rebellion risk, slight instability.',balanced:'Manageable upkeep; slight stability bonus.',strong:'Higher upkeep; stability and rebellion resistance improve.',oversized:'Highest upkeep; stability and strength suffer, rebellion harder.'};
 panel.innerHTML='<div class="cabinet-section">NATIONAL CAPACITY</div><div class="capacity-row"><b>Military: '+names[p.tier]+'</b><small>'+ownedArmies(c.id).length+' divisions · '+consequences[p.tier]+'</small></div><div class="capacity-row"><b>War exhaustion: '+Math.round(c.warExhaustion)+'/100</b><small>Wars and losses raise it; peace and relief lower it. High exhaustion weakens revenue and stability.</small></div><div class="capacity-row"><b>Monthly balance: '+(ledger.net>=0?'+':'')+ledger.net.toFixed(1)+'</b><small>Includes government, divisions, and administration of conquered territory.</small></div>';
 body.querySelector('.national-programs')?.before(panel);
};

const tutorial=document.querySelector('.play-guide');
if(tutorial)tutorial.insertAdjacentHTML('beforeend','<p><b>Military scale:</b> A defensive army improves security, but enormous militaries strain stability and finances. <b>War fatigue:</b> Conquests and casualties raise exhaustion; relief and peace restore it. <b>Border demands:</b> More counties require much greater leverage, and accepted transfers cost at least 100 treasury and secure five years of peace.</p>');

// Critical-strength formations automatically consolidate; disbanding returns a partial refund.
function divisionMergeLimit(quality){return quality==='elite'?28:20}
function canMergeDivisions(a,b){
 return !!a&&!!b&&a.id!==b.id&&a.owner===b.owner&&a.strength>0&&b.strength>0&&a.strength<=10&&b.strength<=10;
}
function mergeDivisions(c,firstId,secondId){
 const a=ownedArmies(c.id).find(x=>x.id===firstId),b=ownedArmies(c.id).find(x=>x.id===secondId);
 if(!canMergeDivisions(a,b))return false;
 const keep=a.strength>=b.strength?a:b,remove=keep===a?b:a;
 // Combine training levels proportionally; mixing militia with veterans cannot
 // turn an entire militia formation into veterans for free.
 const rank={militia:1,elite:2};
 const combined=keep.strength+remove.strength;
 const training=(keep.strength*(rank[keep.quality]||1)+remove.strength*(rank[remove.quality]||1))/combined;
 keep.quality=training>=1.66?'elite':'militia';
 keep.strength+=remove.strength;
 armies=armies.filter(x=>x!==remove);
 for(const f of activeFronts(c)){
  if(f.armyIds?.includes(remove.id)){
   f.armyIds=f.armyIds.filter(id=>id!==remove.id);
   if(Number.isFinite(f.divisions))f.divisions=Math.max(0,f.divisions-1);
  }
 }
 if(selectedArmyId===remove.id)selectedArmyId=keep.id;
 assignFrontRoutes(c);invalidate();
 return keep;
}
function autoMergeCriticallyWeakDivisions(c){
 let changes=0;
 for(let tries=0;tries<100;tries++){
  const units=ownedArmies(c.id).filter(a=>a.strength>0);
  const weak=units.filter(a=>a.strength<=3).sort((a,b)=>a.strength-b.strength)
   .find(a=>units.some(b=>canMergeDivisions(a,b)));
  if(!weak)break;
  const partner=units.filter(a=>canMergeDivisions(weak,a))
   .sort((a,b)=>Math.abs(6-weak.strength-a.strength)-Math.abs(6-weak.strength-b.strength))[0];
  const joined=mergeDivisions(c,weak.id,partner.id);if(!joined)break;
  changes++;
  const fronts=activeFronts(c).filter(f=>atWar(c.id,f.target));
  if(fronts.length){
   const smallest=[...fronts].sort((a,b)=>(a.armyIds||[]).length-(b.armyIds||[]).length)[0];
   for(const f of fronts)f.armyIds=(f.armyIds||[]).filter(id=>id!==joined.id);
   smallest.armyIds.push(joined.id);
   smallest.divisions=Math.max(smallest.divisions||0,smallest.armyIds.length);
   joined.frontOwner=c.id;joined.frontTarget=smallest.target;joined.route=[];joined.plan=null;
   assignFrontRoutes(c);
  }
 }
 return changes;
}
const preAutoMergePeriod=simulatePeriod;
simulatePeriod=function(){
 const before=daysElapsed;preAutoMergePeriod();
 if(daysElapsed<=before)return;
 for(const c of validCountries())autoMergeCriticallyWeakDivisions(c);
};
tick=simulatePeriod;
const previousDivisionRoster=renderNationalFront;
renderNationalFront=function(){
 const disbandWasOpen=frontSection.querySelector('.disband-roster')?.open||false;
 previousDivisionRoster();
 const c=countries[humanId];if(!c||gameMode!=='player'||frontSection.hidden)return;
 const units=ownedArmies(c.id);
 const autoNote=document.createElement('p');autoNote.className='division-help';
 autoNote.textContent='Automatic consolidation: divisions at 1–3 strength combine with another division of 10 or less, keeping all surviving troops. The result reinforces the least-staffed active front. No orders needed.';
 frontSection.append(autoNote);
 const disbandDetails=document.createElement('details');disbandDetails.className='division-roster disband-roster';disbandDetails.open=disbandWasOpen;
 disbandDetails.innerHTML='<summary>Disband divisions ('+units.length+') <small>Permanently remove a formation</small></summary>'+
 '<p class="division-help">Recover some recruitment funds and return surviving soldiers to the population.</p><div class="division-list">'+units.map(a=>'<div class="division-item"><span>Division '+a.id+' · '+Math.round(a.strength)+' strength <small>'+(territories[a.county]?.name||'Unknown')+'</small></span><button data-disband="'+a.id+'">Disband</button></div>').join('')+'</div>';
 frontSection.append(disbandDetails);
 disbandDetails.querySelectorAll('[data-disband]').forEach(button=>button.onclick=()=>{
  const id=+button.dataset.disband,a=armies.find(x=>x.id===id&&x.owner===c.id);
  if(!a)return;
  const original=a.quality==='elite'?15:9;
  const refund=Math.floor(divisionRecruitPrice(a.quality)*.25*Math.min(1,a.strength/original));
  const returning=Math.max(0,a.strength)*.00045;
  c.treasury+=refund;
  const home=territories[a.county]?.owner===c.id?territories[a.county]:countryStats(c).holdings[0];
  if(home)home.p+=returning;
  armies=armies.filter(x=>x!==a);
  for(const f of activeFronts(c)){
   f.armyIds=(f.armyIds||[]).filter(value=>value!==id);
   f.divisions=Math.max(0,(f.divisions??f.armyIds.length)-1);
  }
  assignFrontRoutes(c);quietNotice('disband','✓ Division '+id+' disbanded. +'+refund+' treasury, '+Math.round(returning*1e6).toLocaleString()+' people returned, upkeep reduced.');
  invalidate();update();renderNationalFront();
 });
};

const priorCountryHud=update;
update=function(){priorCountryHud();
 if(!brief)return;
 const c=countries[humanId];
 if(gameMode!=='player'||!c){brief.innerHTML='';return}
 const s=countryStats(c),n=ownedArmies(c.id).length;
 brief.innerHTML='<span><b>'+s.holdings.length+'</b> COUNTIES</span><span><b>'+s.pop.toFixed(2)+'M</b> POPULATION</span><span><b>'+n+'</b> DIVISIONS</span><span><b>'+enemies(c.id).length+'</b> FRONTS</span>';
};
// Keep the hidden value node alive: the map's statistics updater still writes
// to it every tick. Only remove it from the visible interface.
if(document.querySelector('#casualtyCount')?.parentElement)document.querySelector('#casualtyCount').parentElement.style.display='none';

// An event that means 20 treasury to a minor state should mean more to an
// industrial power. Keep political effects on the same understandable scale.
function eventMoneyScale(c){
 const s=countryStats(c);
 return clamp(1+Math.max(0,Math.sqrt(Math.max(0,c.treasury)/180)-1)*.5+Math.max(0,s.pop-5)*.013,1,3);
}
function eventCivicScale(c){return clamp(1+Math.max(0,countryStats(c).pop-4)*.004,1,1.16)}
const originalScaledDilemma=createDilemma;
createDilemma=function(c){
 originalScaledDilemma(c);
 if(!agencyPending||agencyPending.countryId!==c.id||dilemma.hidden)return;
 const money=eventMoneyScale(c),civic=eventCivicScale(c),choices=dilemma.querySelectorAll('[data-decision]');
 agencyPending.event.options.forEach((option,i)=>{
  option._originalDescription??=option[1];option._originalAction??=option[2];
  const original=option._originalDescription;
  option[1]=original.replace(/(Treasury\s*[+−-]\s*)(\d+)/gi,(_,prefix,amount)=>prefix+Math.round(+amount*money))
   .replace(/((?:Stability|Strength)\s*[+−-]\s*)(\d+)/gi,(_,prefix,amount)=>prefix+Math.round(+amount*civic));
  option[2]=target=>{
   const before={treasury:target.treasury,stability:target.stability,readiness:target.readiness};
   option._originalAction(target);
   target.treasury=before.treasury+Math.round((target.treasury-before.treasury)*money);
   target.stability=clamp(before.stability+Math.round((target.stability-before.stability)*civic),5,99);
   target.readiness=clamp(before.readiness+Math.round((target.readiness-before.readiness)*civic),5,100);
  };
  const button=choices[i];if(!button)return;
  const moneyCost=+(option[1].match(/Treasury\s*−\s*(\d+)/)?.[1]||0);
  button.disabled=c.treasury<moneyCost;
  button.querySelector('small').textContent=option[1];
 });
};
update();

// Initial geography is loaded asynchronously; if the military initializer ran
// before map data arrived, seed armies on the first playable world entry.
let initialArmiesVerified=false;
function ensureStartingArmies(){
 if(initialArmiesVerified||!geomReady||!validCountries().length)return;
 initialArmiesVerified=true;
 if(!armies.length){initializeArmies();drawArmyMap();update()}
}
document.getElementById('confirmCountry')?.addEventListener('click',ensureStartingArmies);
document.getElementById('enterWorld')?.addEventListener('click',()=>{if(choiceMode!=='player')ensureStartingArmies()});
const previousArmySeedTick=simulatePeriod;
simulatePeriod=function(){ensureStartingArmies();previousArmySeedTick()};
const priorArmySeedGenerate=generate;
generate=function(reuse=false){cancelBorderPick();initialArmiesVerified=false;priorArmySeedGenerate(reuse);if(geomReady&&armies.length)initialArmiesVerified=true};
const priorBorderPickUpdate=update;
update=function(){priorBorderPickUpdate();if(borderPick&&!borderDock.hidden)refreshBorderPick()};
