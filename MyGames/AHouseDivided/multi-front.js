/* Separate national campaigns, each with its own formations and orders. */
function activeFronts(c){
 if(!c)return [];
 if(!Array.isArray(c.frontOrders))c.frontOrders=[];
 if(c.frontOrder){
  if(!c.frontOrders.some(f=>f.target===c.frontOrder.target))c.frontOrders.push({...c.frontOrder,armyIds:[]});
  c.frontOrder=null;
 }
 return c.frontOrders;
}
function freeFrontArmy(a){a.route=[];a.plan=null;a.frontOwner=null;a.frontTarget=null;a.auto=false;a.travelDays=0}
function releaseFront(c,msg='',target=null){
 if(!c)return;
 const fronts=activeFronts(c),removed=target===null?[...fronts]:fronts.filter(f=>f.target===target);
 if(!removed.length)return;
 const targets=new Set(removed.map(f=>f.target));
 for(const a of ownedArmies(c.id))if(a.frontOwner===c.id&&(target===null||targets.has(a.frontTarget)))freeFrontArmy(a);
 c.frontOrders=fronts.filter(f=>!targets.has(f.target));
 if(msg){armyMessage=msg;addCampaignStory('Offensive ended',msg)}
}
function frontRouteFor(army,destination,owner,target){
 const start=army.county;
 if(start===destination)return [];
 const queue=[start],seen=new Set([start]),prev=new Map();
 for(let k=0;k<queue.length;k++){
  const i=queue[k];if(i===destination)break;
  for(const j of countyGraph[i]||[]){
   if(seen.has(j)||![owner,target].includes(territories[j]?.owner)&&!alliance(owner,territories[j]?.owner))continue;
   seen.add(j);prev.set(j,i);queue.push(j);
  }
 }
 if(!seen.has(destination))return null;
 const route=[];let i=destination;
 while(i!==start){route.push(i);i=prev.get(i)}
 return route.reverse();
}
function assignFrontRoutes(c){
 const fronts=activeFronts(c);
 if(!fronts.length)return;
 for(const f of [...fronts]){
  if(!countries[f.target]||!atWar(c.id,f.target)||!countryStats(countries[f.target]).holdings.length){
   releaseFront(c,'The campaign against '+(countries[f.target]?.name||'a former rival')+' has ended.',f.target);
  }
 }
 const active=activeFronts(c);
 const troops=ownedArmies(c.id).filter(a=>a.strength>0);
 // Never reassign troops fighting on one front to another automatically.
 const used=new Set();
 for(const f of active){
  f.armyIds=(f.armyIds||[]).filter(id=>troops.some(a=>a.id===id));
  for(const id of f.armyIds)used.add(id);
 }
 for(const f of active){
  let existing=f.armyIds.map(id=>troops.find(a=>a.id===id)).filter(Boolean);
  const wanted=Math.min(troops.length,Math.max(0,Math.round(f.divisions??troops.length*f.commit)));
  while(f.armyIds.length>wanted){const id=f.armyIds.pop();used.delete(id);const released=troops.find(a=>a.id===id);if(released)freeFrontArmy(released)}
  existing=f.armyIds.map(id=>troops.find(a=>a.id===id)).filter(Boolean);
  // Spread troop types across simultaneous fronts instead of giving the first
  // campaign every veteran and leaving later campaigns with only militia.
  const reserve=troops.filter(a=>!used.has(a.id));
  const qualityCount=q=>existing.filter(a=>a.quality===q).length;
  while(f.armyIds.length<wanted&&reserve.length){
   reserve.sort((a,b)=>qualityCount(a.quality)-qualityCount(b.quality)||a.id-b.id);
   const a=reserve.shift();f.armyIds.push(a.id);existing.push(a);used.add(a.id);
  }
  const border=territories.filter(t=>t.owner===f.target&&(countyGraph[t.i]||[]).some(j=>territories[j].owner===c.id||alliance(c.id,territories[j].owner)));
  const assigned=f.armyIds.map(id=>troops.find(a=>a.id===id)).filter(Boolean);
  // Largest-remainder allocation gives each front a reproducible mix, even with small armies.
  const requested=f.mix||{breakthrough:f.strategy==='breakthrough'?100:0,balanced:f.strategy==='balanced'?100:0,cautious:f.strategy==='cautious'?100:0,defend:0};
  const mix=Object.values(requested).reduce((n,v)=>n+v,0)>0?requested:{breakthrough:0,balanced:100,cautious:0,defend:0};
  const strategies=['breakthrough','balanced','cautious','defend'];
  const quotas=strategies.map(k=>assigned.length*(mix[k]||0)/Math.max(1,strategies.reduce((n,x)=>n+(mix[x]||0),0)));
  const counts=quotas.map(Math.floor);let extra=assigned.length-counts.reduce((n,x)=>n+x,0);
  quotas.map((n,i)=>({i,rem:n-counts[i]})).sort((a,b)=>b.rem-a.rem).slice(0,extra).forEach(x=>counts[x.i]++);
  const troopOrder=[...assigned].sort((a,b)=>a.id-b.id);
  const stanceById=new Map();let offset=0;
  strategies.forEach((s,i)=>{for(const a of troopOrder.slice(offset,offset+counts[i]))stanceById.set(a.id,s);offset+=counts[i]});
  // Select a shared crossing for a front so units can combine their strength.
  // Reconsider it after reversals, and favor a flank with weaker defenders.
  const fighting=assigned.filter(a=>stanceById.get(a.id)!=='defend');
  const frontFailures=new Map();
  for(const a of fighting)if(a.failedTarget!==undefined&&daysElapsed<(a.failedUntil||0))frontFailures.set(a.failedTarget,(frontFailures.get(a.failedTarget)||0)+1);
  const frontCandidates=border.map(t=>{
   const routes=fighting.map(a=>frontRouteFor(a,t.i,c.id,f.target)).filter(p=>p?.length);
   if(!routes.length)return null;
   const garrison=ownedArmies(f.target).filter(x=>x.county===t.i).reduce((s,x)=>s+x.strength*divisionTraits(x.quality).combat,0);
   const neighbors=ownedArmies(f.target).filter(x=>(countyGraph[t.i]||[]).includes(x.county)).reduce((s,x)=>s+x.strength*.24,0);
   const distance=routes.reduce((s,p)=>s+p.length,0)/routes.length;
   return {id:t.i,score:garrison*1.6+neighbors+distance*2+(frontFailures.get(t.i)||0)*22-t.p*.45};
  }).filter(Boolean).sort((a,b)=>a.score-b.score);
  const chosenFocus=frontCandidates[0]?.id??null;
  // A large army should occupy several open crossings. Concentrate only when
  // every reachable frontier is contested strongly enough to need support.
  const typicalPower=fighting.reduce((n,a)=>n+a.strength*divisionTraits(a.quality).combat,0)/Math.max(1,fighting.length);
  const openCrossings=frontCandidates.filter(x=>{
   const garrison=ownedArmies(f.target).filter(a=>a.county===x.id).reduce((n,a)=>n+a.strength*divisionTraits(a.quality).combat,0);
   return garrison<typicalPower*.8;
  });
  const mixedRoles=fighting.some(a=>a.quality==='militia')&&fighting.some(a=>a.quality!=='militia')&&
   openCrossings.length>=1&&frontCandidates.some(x=>!openCrossings.some(open=>open.id===x.id));
  const spreadFront=(fighting.length>=4&&openCrossings.length>=2)||mixedRoles;
  const reserved=new Map();
  for(const a of fighting)if(a.route?.length){const destination=a.route.at(-1);reserved.set(destination,(reserved.get(destination)||0)+1)}
  const previousFocus=f.focusCounty;
  if(chosenFocus!==null)f.focusCounty=chosenFocus;
  for(const a of assigned){
   a.frontOwner=c.id;a.frontTarget=f.target;a.auto=false;
   const orders=stanceById.get(a.id)||'balanced';a.stance=orders==='defend'?'defend':orders==='breakthrough'?'.82':orders==='cautious'?'1.15':'.92';
   if(orders==='defend'){
    const guard=countryStats(c).holdings.filter(t=>countyGraph[t.i]?.some(j=>territories[j].owner===f.target))
     .map(t=>({t,path:shortestCountyRoute(a.county,t.i,c.id)})).filter(x=>x.path!==null)
     .sort((x,y)=>x.path.length-y.path.length)[0];
    if(guard&&guard.path.length){
     if(!a.route?.length||a.route.at(-1)!==guard.t.i)a.route=guard.path;
     a.plan=null;a.entrench=0;
    }else{a.route=[];a.plan=null;a.entrench=Math.max(a.entrench,.8)}
    continue;
   }
   // A changed focus means the division needs a new route to the flank.
   if(!spreadFront&&previousFocus!==undefined&&f.focusCounty!==previousFocus&&a.plan&&a.route?.at(-1)!==f.focusCounty){a.route=[];a.plan=null}
   if(a.route?.length){
    if(a.route.every(i=>territories[i]&&([c.id,f.target].includes(territories[i].owner)||alliance(c.id,territories[i].owner))))continue;
    a.route=[];a.plan=null;
   }
   if(!border.length){a.route=[];a.plan=null;a.stallReason='No shared land frontier';continue}
   const possible=border.map(t=>{
    const path=frontRouteFor(a,t.i,c.id,f.target);if(!path?.length)return null;
    const garrison=ownedArmies(f.target).filter(x=>x.county===t.i).reduce((s,x)=>s+x.strength,0);
    const adjacentSupport=assigned.filter(x=>x.id!==a.id&&(countyGraph[t.i]||[]).includes(x.county)).reduce((s,x)=>s+x.strength*divisionTraits(x.quality).combat*.65,0);
    const defending=5+garrison+(countries[f.target].fort||0)*8;
    const strength=a.strength*divisionTraits(a.quality).combat+adjacentSupport;
    const vulnerability=defending/Math.max(1,strength);
    const discouraged=a.failedTarget===t.i&&daysElapsed<(a.failedUntil||0)?35:0;
    const priority=orders==='breakthrough'?-t.p*1.1:orders==='cautious'?t.p*.5:-t.p*.5;
    const targetLoad=reserved.get(t.i)||0;
    const open=ownedArmies(f.target).every(x=>x.county!==t.i);
    const dispersion=spreadFront?targetLoad*(open?28:38):0;
    // Militia are scouts/occupiers; preserve professional divisions for
    // enemy formations. Regulars and veterans still take open ground when
    // no defended target is reachable.
    const roleBias=a.quality==='militia'?(open?-30:48):open?32:-36+Math.max(0,vulnerability-1.8)*32;
    return {target:t.i,path,score:priority+path.length*1.1+vulnerability*(orders==='breakthrough'?4:12)+discouraged+(spreadFront?0:t.i===f.focusCounty?-22:0)+dispersion+roleBias+rand()*2};
   }).filter(Boolean).sort((x,y)=>x.score-y.score);
   if(possible.length){
    const alternative=possible.find(x=>x.target!==a.failedTarget||daysElapsed>=(a.failedUntil||0));
    if(!alternative&&daysElapsed<(a.planRetryAt||0))continue;
    const chosen=alternative||possible[0];
    a.route=chosen.path;reserved.set(chosen.target,(reserved.get(chosen.target)||0)+1);
    a.plan={threshold:+a.stance,blockedDays:0,failures:0,stageUntil:orders==='breakthrough'?daysElapsed:daysElapsed+(orders==='cautious'?10:3)};a.travelDays=0;a.stallReason='';
   }else a.stallReason='No passable route to this front';
  }
  const idle=assigned.filter(a=>!a.route?.length&&a.stance!=='defend').length;
  const reasons=[...new Set(assigned.filter(a=>!a.route?.length&&a.stance!=='defend').map(a=>a.stallReason).filter(Boolean))];
  f.message=assigned.length+' formations · '+strategies.map((s,i)=>counts[i]+' '+(s==='breakthrough'?'aggressive':s)).join(' / ')+(wanted>assigned.length?' · recruit more troops to expand':'')+(!border.length?' · NO LAND FRONTIER':idle?' · '+idle+' regrouping or finding routes':'')+(reasons.length?' · '+reasons.join(', '):'');
 }
}
function renderNationalFront(){
 const c=countries[humanId];
 if(gameMode!=='player'||!c){frontSection.hidden=true;return}frontSection.hidden=false;
 const fronts=activeFronts(c);
 const targets=validCountries().filter(other=>other.id!==c.id&&!alliance(c.id,other.id)&&(bordering(c.id,other.id)||atWar(c.id,other.id)));
 const used=fronts.reduce((n,f)=>n+(f.armyIds||[]).filter(id=>ownedArmies(c.id).some(a=>a.id===id)).length,0);
 const total=ownedArmies(c.id).length,unassigned=Math.max(0,total-used);
 frontSection.innerHTML='<div class="quick-section-title">YOUR WAR FRONTS</div><p>Fight several enemies at once. Each front gets its own divisions and continues automatically until you cancel it or the war ends. Troops already committed elsewhere stay on their front.</p>'+
  '<div class="front-availability"><b>'+unassigned+' of '+total+'</b> formations available for new fronts</div>'+
  '<div class="multi-front-list">'+(fronts.length?fronts.map(f=>'<div class="multi-front-entry"><div><strong>⚔ '+(countries[f.target]?.name||'Former opponent')+'</strong><small>'+Math.round(f.commit*100)+'% requested · '+f.strategy+'</small></div><p>'+(f.message||'Preparing the offensive')+'</p><button data-stop-front="'+f.target+'">Stop this front</button></div>').join(''):'<p class="front-empty">No offensives underway. You can launch one against each enemy.</p>')+'</div>'+
  '<div class="quick-section-title">LAUNCH ANOTHER OFFENSIVE</div><label>Target country<select id="frontTarget">'+targets.map(x=>'<option value="'+x.id+'" '+(fronts.some(f=>f.target===x.id)?'disabled':'')+'>'+x.name+(atWar(c.id,x.id)?' · at war':' · declare war')+'</option>').join('')+'</select></label>'+
  '<div class="national-row"><label>Assign reserve<select id="frontCommit"><option value=".25">25% of total army</option><option value=".5" selected>50% of total army</option><option value=".75">75% of total army</option><option value="1">All available reserves</option></select></label></div>'+
  '<div class="front-mix-title">Orders by share of divisions · total 100%</div><div class="front-mix-grid">'+[['breakthrough','Aggressive',25],['balanced','Balanced',25],['cautious','Cautious',25],['defend','Defending',25]].map(([k,label,n])=>'<label>'+label+'<input class="mix-share" data-mix="'+k+'" type="number" min="0" max="100" step="5" value="'+n+'">%</label>').join('')+'</div><small id="mixTotal">100% assigned</small>'+
  '<div class="front-buttons"><button id="launchFront" '+(!targets.some(x=>!fronts.some(f=>f.target===x.id))||!unassigned?'disabled':'')+'>Launch front</button></div>'+
  '<div class="front-mix-title">RECRUIT DIVISIONS</div><div class="unit-trait-grid">'+[
   ['militia','MILITIA','90% attack / defense','10% more casualties','60% faster · extra 50% speed capturing undefended counties','55% upkeep'],
   ['elite','VETERANS','145% attack / defense','60% fewer casualties','Normal movement','160% upkeep']
  ].map(([id,name,power,damage,speed,upkeep])=>'<div class="unit-trait"><strong>'+name+' · '+divisionRecruitPrice(id)+' treasury</strong><span>'+power+'</span><span>'+damage+'</span><span>'+speed+'</span><span>'+upkeep+'</span></div>').join('')+'</div>'+
  '<label>Recruit division<select id="nationalQuality"><option value="militia" selected>Militia · '+divisionRecruitPrice('militia')+' treasury</option><option value="elite">Veterans · '+divisionRecruitPrice('elite')+' treasury</option></select></label><button class="raise-national" id="raiseNationalForce">＋ Recruit selected division</button>'+
  '<small>Commitments share the same army pool. A second offensive does not interrupt your first. Use Diplomacy to negotiate peace.</small>';
 const selector=frontSection.querySelector('#frontTarget');
 const recruitment=frontSection.querySelector('#nationalQuality');
 const recruitButton=frontSection.querySelector('#raiseNationalForce');
 function syncRecruit(){recruitButton.disabled=c.treasury<divisionRecruitPrice(recruitment.value)}
 recruitment.onchange=syncRecruit;syncRecruit();
 const shares=[...frontSection.querySelectorAll('.mix-share')];
 function checkMix(){const n=shares.reduce((sum,x)=>sum+(+x.value||0),0);frontSection.querySelector('#mixTotal').textContent=n===100?'100% assigned':n+'% — adjust to exactly 100%';frontSection.querySelector('#launchFront').disabled=n!==100||!targets.some(x=>!fronts.some(f=>f.target===x.id))||!unassigned}
 shares.forEach(x=>x.addEventListener('input',checkMix));checkMix();
 if(selector?.selectedOptions[0]?.disabled){const option=[...selector.options].find(o=>!o.disabled);if(option)selector.value=option.value}
 frontSection.querySelectorAll('[data-stop-front]').forEach(b=>b.onclick=()=>{
  const id=+b.dataset.stopFront;releaseFront(c,'Orders against '+(countries[id]?.name||'the rival')+' canceled.',id);update();renderNationalFront();
 });
 frontSection.querySelector('#launchFront').onclick=()=>{
  const target=+selector.value,foe=countries[target];
  if(!foe||activeFronts(c).some(f=>f.target===target))return;
  const reserve=ownedArmies(c.id).filter(a=>a.strength>0&&!activeFronts(c).some(f=>f.armyIds?.includes(a.id)));
  if(!reserve.length)return;
  const mix=Object.fromEntries(shares.map(x=>[x.dataset.mix,+x.value||0]));if(Object.values(mix).reduce((n,x)=>n+x,0)!==100)return;
  const strategy='mixed';
  const fraction=+frontSection.querySelector('#frontCommit').value;
  if(!atWar(c.id,target)){
   if(!confirm('Declare war on '+foe.name+' and open another front?'))return;
   war(c.id,target);c.stability=clamp(c.stability-3,5,99);c.warExhaustion=clamp(c.warExhaustion+4,0,100);
  }
  c.frontOrders.push({target,strategy,mix,commit:fraction,armyIds:[],message:'Generals preparing the offensive.'});
  assignFrontRoutes(c);
  addCampaignStory('New front opened','Against '+foe.name+' · mixed division orders · '+Math.round(fraction*100)+'% of army requested.');
  invalidate();update();renderNationalFront();if(!timer)start();
 };
 frontSection.querySelector('#raiseNationalForce').onclick=()=>{
  const quality=frontSection.querySelector('#nationalQuality').value,price=divisionRecruitPrice(quality);
  if(c.treasury<price)return;const holdings=countryStats(c).holdings;if(!holdings.length)return;
  const frontier=holdings.filter(t=>(countyGraph[t.i]||[]).some(j=>territories[j].owner!==c.id));
  const best=(frontier.length?frontier:holdings).slice().sort((a,b)=>b.infra-a.infra)[0];
  c.treasury-=price;const army=createArmy(c.id,best.i,quality==='militia'?9:15,quality);army.auto=false;
  addCampaignStory('Reinforcements recruited',divisionName(quality)+' division '+army.id+' raised near '+best.name+', '+best.state+' for '+price+' treasury.');
  assignFrontRoutes(c);update();renderNationalFront();
 };
}
renderNationalFront();
// The old county-by-county battle-plan interface is retired. Military
// decisions are issued entirely from the national campaign panel above.
const oldArmyHelp=document.querySelector('#help .modal > p:last-of-type');
if(oldArmyHelp&&/formation|Move \/ Attack|army/i.test(oldArmyHelp.textContent)){
 oldArmyHelp.textContent='Tip: in Play mode, open Military and launch a national offensive against a neighboring country. Recruit formations and divide your army among several fronts. The General Staff handles individual county movements automatically; cancel any front without interrupting the others.';
}
// Game-wide keyboard shortcuts. Never steal keys from menus, selections,
// dialogs or editable fields; keyboard navigation keeps working normally.
document.addEventListener('keydown',event=>{
 if(event.repeat||event.altKey||event.ctrlKey||event.metaKey)return;
 const el=document.activeElement;
 if(el?.closest('input,textarea,select,button,[contenteditable="true"]'))return;
 if(document.querySelector('dialog[open]')||choiceOverlay?.classList.contains('visible'))return;
 if(typeof dilemma!=='undefined'&&!dilemma.hidden)return;
 if(typeof importantOverlay!=='undefined'&&!importantOverlay.hidden)return;
 if(event.code==='Space'){
  event.preventDefault();
  if(geomReady)document.getElementById('play')?.click();
 }
});
document.getElementById('play')?.setAttribute('title','Space: pause / resume');
