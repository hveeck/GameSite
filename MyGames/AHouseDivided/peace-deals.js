/* Treaty negotiation: every ceasefire is a decision, never a random timer. */
let peaceDialog=null,peaceLastOffers=new Map(),peaceMinimumCounties=new Map(),peaceCapitulationOnly=new Set(),peaceOfferDays=0,peaceHoverCleanup=null;
function completeTotalConquest(winnerId,loserId){
 const victor=countries[winnerId],defeated=countries[loserId];
 if(!victor||!defeated||countryStats(defeated).holdings.length)return false;
 if(defeated.surrendered)return true;
 defeated.surrendered=true;defeated.stability=0;
 const treasury=Math.max(0,defeated.treasury||0);victor.treasury=(victor.treasury||0)+treasury;defeated.treasury=0;
 wars=wars.filter(w=>!w.includes(loserId));pacts=pacts.filter(p=>!p.includes(loserId));
 restorePeaceArmies();
 armies=armies.filter(a=>a.owner!==loserId&&a.strength>0);
 log(defeated.name+' capitulates. '+victor.name+' annexes its remaining territory and seizes '+Math.round(treasury)+' treasury.','warlog');
 if(gameMode==='player'&&(winnerId===humanId||loserId===humanId))queueNotice('TOTAL CAPITULATION',defeated.name+' defeated',victor.name+' captures '+Math.round(treasury)+' treasury. Surviving divisions return home.');
 return true;
}
function restorePeaceArmies(){
 if(typeof armies==='undefined'||!territories.length)return;
 for(const unit of armies){
  if(unit.strength<=0||!countries[unit.owner]||!countryStats(countries[unit.owner]).holdings.length)continue;
  const at=territories[unit.county];
  if(at&&(at.owner===unit.owner||alliance(unit.owner,at.owner)||atWar(unit.owner,at.owner)))continue;
  const land=countryStats(countries[unit.owner]).holdings;
  const destination=land.reduce((best,t)=>{
   const d=at?Math.hypot(t.cx-at.cx,t.cy-at.cy):0;
   return !best||d<best.d?{i:t.i,d}:best;
  },null);
  if(destination){unit.county=destination.i;unit.route=[];unit.plan=null;unit.travelDays=0;unit.auto=false;unit.entrench=0}
 }
 for(const c of countries){
  if(!c.frontOrders)continue;
  c.frontOrders=c.frontOrders.filter(f=>countryStats(c).holdings.length&&atWar(c.id,f.target));
 }
}
function treatyCounties(giver,taker){
 const war=coalitionOf(giver,taker);
 return territories.filter(t=>{
  const original=war?.startOwners?.get(t.i)??t.owner;
  // Treaty maps must let the player select any prewar holding of a belligerent,
  // whether it remains controlled, is occupied, or lies far from the frontier.
  return original===giver;
 });
}
function treatyCountyValue(t){return Math.max(9,6+t.p*15+t.e*2+t.res*2)}
function treatyMomentum(a,b){
 const c=coalitionOf(a,b),powerA=countryStats(countries[a]).power,powerB=countryStats(countries[b]).power;
 const force=(powerA-powerB)/Math.max(1,powerA+powerB);
 const contribution=c?((c.contributions[a]||0)-(c.contributions[b]||0))/Math.max(1,(c.contributions[a]||0)+(c.contributions[b]||0)):0;
 const fatigue=((countries[b].warExhaustion||0)-(countries[a].warExhaustion||0))/180;
 return clamp(force*.52+contribution*.34+fatigue,-.85,.85);
}
function normalizedTreaty(offer){
 return {...offer,give:offer.give||[],take:offer.take||[],pay:Math.max(0,Math.floor(+offer.pay||0)),receive:Math.max(0,Math.floor(+offer.receive||0))};
}
function treatyAcceptance(offer){
 const o=normalizedTreaty(offer),giver=countries[o.from],receiver=countries[o.to];
 if(!giver||!receiver||!atWar(o.from,o.to))return 0;
 const acceptedValue=o.give.reduce((v,id)=>v+treatyCountyValue(territories[id]),0)+o.pay;
 const demandedValue=o.take.reduce((v,id)=>v+treatyCountyValue(territories[id]),0)+o.receive;
 const net=acceptedValue-demandedValue;
 const momentum=treatyMomentum(o.from,o.to),fatigue=(receiver.warExhaustion||0)/100;
 const base=.32+momentum*.63+fatigue*.3;
 const priceFactor=net/Math.max(42,countryStats(receiver).economy*13+receiver.treasury*.14);
 return clamp(base+priceFactor*.42-(o.white?.03:0),.02,.96);
}
function validateTreaty(offer){
 const o=normalizedTreaty(offer),from=countries[o.from],to=countries[o.to];
 if(!from||!to||!atWar(o.from,o.to))return 'The countries are no longer at war.';
 if(o.white&&(o.give.length||o.take.length||o.pay||o.receive))return 'White peace cannot include territorial or treasury demands.';
 if(o.pay>from.treasury||o.receive>to.treasury)return 'A government cannot promise more treasury than it holds.';
 if(o.give.some(i=>!treatyCounties(o.from,o.to).some(t=>t.i===i))||o.take.some(i=>!treatyCounties(o.to,o.from).some(t=>t.i===i)))return 'Only counties held by the country before the war can be ceded.';
 const prewarFrom=coalitionOf(o.from,o.to)?.startOwners;
 const fromCount=prewarFrom?[...prewarFrom.values()].filter(id=>id===o.from).length:countryStats(from).holdings.length;
 const toCount=prewarFrom?[...prewarFrom.values()].filter(id=>id===o.to).length:countryStats(to).holdings.length;
 if(fromCount-o.give.length+o.take.length<=0||toCount-o.take.length+o.give.length<=0)return 'A peace agreement cannot eliminate a country; that requires capitulation.';
 return null;
}
function finalizePeace(offer){
 const o=normalizedTreaty(offer),problem=validateTreaty(o);if(problem)return problem;
 const A=countries[o.from],B=countries[o.to],c=coalitionOf(o.from,o.to);
 // Every settlement first clears wartime occupation. Only counties explicitly
 // named in the signed treaty are then ceded; no undeclared annexations.
 let restored=0;
 if(c){
  for(const [id,owner] of c.startOwners){
   const t=territories[id];
   if(t&&t.owner!==owner&&coalitionSide(c,owner)!==-1&&coalitionSide(c,t.owner)!==-1&&coalitionSide(c,owner)!==coalitionSide(c,t.owner)&&countries[owner]&&!countries[owner].surrendered){t.owner=owner;restored++}
  }
 }
 if(!o.white){
  for(const id of o.give)territories[id].owner=o.to;
  for(const id of o.take)territories[id].owner=o.from;
  A.treasury+=o.receive-o.pay;B.treasury+=o.pay-o.receive;
 }
 const sides=c?.sides?.map(s=>[...s]);
 if(c)endCoalition(c,'settlement');
 wars=wars.filter(w=>pactKey(w[0],w[1])!==pactKey(o.from,o.to));
 // All belligerents in a settled coalition receive five years of peace.
 if(typeof signNonAggression==='function'){
  if(sides?.length===2){for(const x of sides[0])for(const y of sides[1])if(countries[x]&&countries[y]&&countryStats(countries[x]).holdings.length&&countryStats(countries[y]).holdings.length)signNonAggression(x,y,5)}
  else signNonAggression(o.from,o.to,5);
 }
 peaceLastOffers.delete(pactKey(o.from,o.to));
 peaceMinimumCounties.delete(pactKey(o.from,o.to));
 peaceCapitulationOnly.delete(pactKey(o.from,o.to));
 for(const id of [o.from,o.to])countries[id].warExhaustion=Math.max(0,(countries[id].warExhaustion||0)-16);
 invalidate();restorePeaceArmies();
 const summary=o.white?'white peace; prewar borders restored':`peace treaty; ${o.give.length+o.take.length} counties ceded, ${restored} occupied counties restored, ${Math.abs(o.pay-o.receive)} net treasury exchanged`;
 log(A.name+' and '+B.name+' sign '+summary+'.','peace');
 if(gameMode==='player'&&[o.from,o.to].includes(humanId)){
  actionNotice='Peace signed: '+summary+'. Divisions return home.';
  if(typeof quietNotice==='function')quietNotice('peace','✓ '+A.name+' and '+B.name+' sign peace.');
 }
 update();return null;
}
function treatyOriginalOwner(offer,id){
 return coalitionOf(offer.from,offer.to)?.startOwners?.get(id)??territories[id]?.owner;
}
function treatyCountyDescription(offer,id){
 const t=territories[id];if(!t)return 'Unknown county';
 const before=countries[treatyOriginalOwner(offer,id)]?.name||'Unknown';
 const now=countries[t.owner]?.name||'Unknown';
 return t.name+', '+t.state+' (prewar: '+before+(before===now?'':'; occupied by '+now)+')';
}
function peaceOfferMarkup(offer,incoming){
 const from=countries[offer.from],to=countries[offer.to];
 const summary=(ids)=>ids.length?ids.map(i=>treatyCountyDescription(offer,i)).join(' · '):'None';
 const label=incoming?'INCOMING PEACE OFFER':'OFFER PEACE';
 const disabled=incoming?' disabled':'';
 return '<div class="peace-shade peace-map-mode"><section class="peace-window" role="dialog" aria-modal="'+incoming+'" aria-label="Peace negotiations">'+
 '<div class="peace-head"><strong>'+label+'</strong><button id="closePeace" aria-label="Close">×</button></div>'+
 '<h2>'+from.name+' ↔ '+to.name+'</h2>'+
 '<p>'+(incoming?'The enemy offers these exact terms. Accept, reject, or counter.':'Choose who receives the counties, then click them on the map. Occupied land returns home unless explicitly ceded.')+'</p>'+
 '<div class="peace-legend"><span class="peace-from-key">Prewar '+from.name+'</span><span class="peace-to-key">Prewar '+to.name+'</span><span class="peace-occupied-key">Wartime occupation</span><span class="peace-demand-key">Demanded in treaty</span></div><div id="peaceHoverDetails" class="peace-hover-details">Hover over a county to see its original owner, occupier, and treaty status.</div>'+
 '<div class="peace-options"><label><input type="checkbox" id="peaceWhite" '+(offer.white?'checked':'')+disabled+'> White peace — restore prewar borders</label></div>'+
 '<div class="peace-grid"><div><button class="peace-pick-active" id="peacePickGive"'+disabled+'>Select counties from '+from.name+'</button><small id="peaceGiving">'+summary(offer.give)+'</small></div><div><button id="peacePickTake"'+disabled+'>Select counties from '+to.name+'</button><small id="peaceTaking">'+summary(offer.take)+'</small></div></div>'+
 '<label class="peace-search-label">Counties available to demand (click map or select here)<input type="search" id="peaceCountySearch" placeholder="Search county or state" autocomplete="off"></label><div id="peaceCountyOptions" class="peace-county-options"></div>'+
 '<div class="peace-money"><label>'+from.name+' pays <input id="peacePay" type="number" min="0" max="'+Math.floor(from.treasury)+'" value="'+offer.pay+'"'+disabled+'></label>'+
 '<label>'+to.name+' pays <input id="peaceReceive" type="number" min="0" max="'+Math.floor(to.treasury)+'" value="'+offer.receive+'"'+disabled+'></label></div>'+
 '<small id="peaceEstimate"></small>'+(incoming?'<div class="peace-reject-choices"><strong>IF YOU REJECT — choose one:</strong><label class="peace-reject-choice"><input id="peaceRequireCounties" name="peaceRejectTerms" type="checkbox" checked><span><b>Require counties</b> — minimum <input id="peaceMinimumCounties" type="number" min="1" max="'+Math.max(1,countryStats(from).holdings.length)+'" step="1" value="'+Math.max(1,peaceMinimumCounties.get(pactKey(offer.from,offer.to))??Math.max(1,offer.give.length+1))+'"> <small>('+countryStats(from).holdings.length+' counties remaining in '+from.name+')</small></span></label><label class="peace-reject-choice capitulation-option"><input id="peaceCapitulationOnly" name="peaceRejectTerms" type="checkbox"><span><b>Total capitulation only</b> — no more peace proposals; fight until their government surrenders</span></label></div>':'')+
 '<div class="peace-actions"><button id="peaceCancel">'+(incoming?'Reject':'Cancel')+'</button>'+(incoming?'<button id="peaceCounter">Counteroffer</button>':'')+'<button id="peaceConfirm">'+(incoming?'Accept treaty':'Send proposal')+'</button></div></section></div>';
}
let peaceSelection=null;
function clearPeaceSelection(){
 peaceSelection=null;
 document.querySelectorAll('.peace-map-picked,.peace-prewar-from,.peace-prewar-to,.peace-occupied').forEach(el=>el.classList.remove('peace-map-picked','peace-prewar-from','peace-prewar-to','peace-occupied'));
}
document.getElementById('map').addEventListener('click',event=>{
 if(!peaceSelection)return;
 const path=event.target.closest('[data-i]');if(!path)return;
 event.preventDefault();event.stopImmediatePropagation();
 const i=+path.dataset.i,s=peaceSelection,o=s.offer(),giver=s.mode==='give'?o.from:o.to,taker=s.mode==='give'?o.to:o.from;
 if(!treatyCounties(giver,taker).some(t=>t.i===i)){s.message('Select a county belonging to '+countries[giver].name+' before the war.');return}
 const chosen=s.mode==='give'?s.give:s.take;
 if(chosen.has(i))chosen.delete(i);else chosen.add(i);
 s.refresh();
},true);
function openPeaceNegotiation(from,to,proposal=null,initialDraft=null){
 const incomingWasPlaying=!!proposal&&!!timer;
 if(proposal)stop();
 if(peaceHoverCleanup){peaceHoverCleanup();peaceHoverCleanup=null}
 if(peaceDialog)peaceDialog.remove();clearPeaceSelection();
 if(typeof cancelBorderPick==='function')cancelBorderPick();
 const incoming=!!proposal,offer=normalizedTreaty(proposal||initialDraft||{from,to,give:[],take:[],pay:0,receive:0,white:false});
 peaceDialog=document.createElement('div');peaceDialog.innerHTML=peaceOfferMarkup(offer,incoming);document.body.append(peaceDialog);
 const root=peaceDialog,white=root.querySelector('#peaceWhite');
 const give=new Set(offer.give),take=new Set(offer.take);
 const getOffer=()=>({...offer,white:white.checked,give:[...give],take:[...take],pay:+root.querySelector('#peacePay').value,receive:+root.querySelector('#peaceReceive').value});
 const selection={mode:'give',give,take,offer:getOffer,message:text=>root.querySelector('#peaceEstimate').textContent=text,refresh};
 if(!incoming)peaceSelection=selection;
 const onHover=event=>{
  const path=event.target.closest?.('[data-i]');if(!path)return;
  const id=+path.dataset.i,t=territories[id],status=root.querySelector('#peaceHoverDetails');if(!t||!status)return;
  const original=countries[treatyOriginalOwner(getOffer(),id)]?.name||'Unknown';
  const current=countries[t.owner]?.name||'Unknown';
  const demanded=give.has(id)?' · TO '+countries[to].name:take.has(id)?' · TO '+countries[from].name:'';
  status.textContent=t.name+', '+t.state+' · Prewar: '+original+' · Now: '+current+(original!==current?' (occupied)':'')+(demanded?' · DEMANDED'+demanded:original!==current?' · Not demanded: occupation restored':' · No territorial change');
 };
 document.getElementById('map').addEventListener('pointerover',onHover);
 peaceHoverCleanup=()=>document.getElementById('map').removeEventListener('pointerover',onHover);
 function refresh(){
  if(white.checked&&!incoming){give.clear();take.clear();root.querySelector('#peacePay').value='0';root.querySelector('#peaceReceive').value='0'}
  const o=getOffer();root.querySelectorAll('.peace-money input').forEach(el=>{el.disabled=incoming||o.white});
  root.querySelector('#peaceGiving').textContent=o.give.length?o.give.map(i=>treatyCountyDescription(o,i)).join(' · '):'None';
  root.querySelector('#peaceTaking').textContent=o.take.length?o.take.map(i=>treatyCountyDescription(o,i)).join(' · '):'None';
  const search=root.querySelector('#peaceCountySearch'),list=root.querySelector('#peaceCountyOptions');
  const giving=selection.mode==='give',giver=giving?from:to,selected=giving?give:take;
  const matches=treatyCounties(giver,giving?to:from).filter(t=>!search.value.trim()||(t.name+' '+t.state).toLowerCase().includes(search.value.trim().toLowerCase()));
  list.innerHTML=matches.slice(0,90).map(t=>'<label class="peace-county-row"><input type="checkbox" data-peace-county="'+t.i+'" '+(selected.has(t.i)?'checked':'')+(incoming||o.white?' disabled':'')+'><span>'+t.name+', '+t.state+'</span><small>'+(t.owner===giver?'Home':'Occupied by '+(countries[t.owner]?.name||'other'))+'</small></label>').join('')+(matches.length>90?'<small>Showing first 90 of '+matches.length+' counties. Search to find more.</small>':'');
  list.querySelectorAll('[data-peace-county]').forEach(input=>input.onchange=()=>{const id=+input.dataset.peaceCounty;if(input.checked)selected.add(id);else selected.delete(id);refresh()});
  root.querySelectorAll('.peace-grid button').forEach(el=>{el.disabled=incoming||o.white;el.classList.toggle('peace-pick-active',el.id===(selection.mode==='give'?'peacePickGive':'peacePickTake'))});
  clearPeaceSelection();if(!incoming)peaceSelection=selection;
  const coalition=coalitionOf(from,to);
  if(coalition)for(const [id,original] of coalition.startOwners){
   const el=countyEls[id],t=territories[id];if(!el||!t)continue;
   if(original===from)el.classList.add('peace-prewar-from');
   else if(original===to)el.classList.add('peace-prewar-to');
   if(original!==t.owner&&coalitionSide(coalition,original)!==-1&&coalitionSide(coalition,t.owner)!==-1&&coalitionSide(coalition,original)!==coalitionSide(coalition,t.owner))el.classList.add('peace-occupied');
  }
  for(const i of [...give,...take])countyEls[i]?.classList.add('peace-map-picked');
  root.querySelector('#peaceEstimate').textContent=incoming?'Their proposed terms are shown above.':`Map: select ${selection.mode==='give'?countries[from].name:countries[to].name} counties · Estimated acceptance ${Math.round(treatyAcceptance(o)*100)}%`;
 }
 const close=(resume=true)=>{peaceHoverCleanup?.();peaceHoverCleanup=null;root.remove();if(peaceDialog===root)peaceDialog=null;clearPeaceSelection();if(resume&&incomingWasPlaying&&!timer&&!agencyPending&&(typeof importantOverlay==='undefined'||importantOverlay.hidden))start()};
 root.querySelector('#closePeace').onclick=close;
 if(incoming){
  const require=root.querySelector('#peaceRequireCounties'),total=root.querySelector('#peaceCapitulationOnly'),number=root.querySelector('#peaceMinimumCounties');
  require.onchange=()=>{if(require.checked)total.checked=false;else if(!total.checked)require.checked=true;number.disabled=!require.checked};
  total.onchange=()=>{if(total.checked)require.checked=false;else if(!require.checked)require.checked=true;number.disabled=!require.checked};
 }
 root.querySelector('#peaceCancel').onclick=()=>{if(incoming){
  const key=pactKey(from,to),total=root.querySelector('#peaceCapitulationOnly').checked;
  const max=Math.max(1,countryStats(countries[from]).holdings.length),min=Math.max(1,Math.min(max,Math.floor(+root.querySelector('#peaceMinimumCounties').value||1)));
  peaceLastOffers.set(key,Math.min(5,(peaceLastOffers.get(key)||0)+1));
  if(total){
   peaceCapitulationOnly.add(key);peaceMinimumCounties.delete(key);
   // A near-collapsed AI government may accept unconditional surrender,
   // but a functioning military will almost always fight on.
   const losing=countries[from],victor=countries[to];
   const holdings=countryStats(losing).holdings.length;
   const lost=1-holdings/Math.max(1,losing.initialCount||holdings);
   const loserForce=ownedArmies(from).reduce((n,a)=>n+a.strength*divisionTraits(a.quality).combat,0);
   const victorForce=ownedArmies(to).reduce((n,a)=>n+a.strength*divisionTraits(a.quality).combat,0);
   const desperate=lost>.7&&losing.stability<28&&loserForce<victorForce*.35;
   if(desperate&&rand()<Math.min(.5,.1+(lost-.7)*1.1)){
    for(const t of territories)if(t.owner===from)t.owner=to;
    invalidate();completeTotalConquest(to,from);
    actionNotice=losing.name+' accepts unconditional capitulation.';
   }
  }else{peaceCapitulationOnly.delete(key);peaceMinimumCounties.set(key,min)}
  log(countries[to].name+' rejects a peace offer from '+countries[from].name+(total?' and demands total capitulation. No more offers will be delivered.':'. Future offers must include at least '+min+' counties.'),'peace')
 }close()};
 root.querySelector('#peacePickGive').onclick=()=>{selection.mode='give';refresh()};
 root.querySelector('#peacePickTake').onclick=()=>{selection.mode='take';refresh()};
 root.querySelector('#peaceCountySearch').oninput=refresh;
 root.querySelector('#peaceCounter')?.addEventListener('click',()=>{
  const reversed={from:to,to:from,give:[...take],take:[...give],pay:offer.receive,receive:offer.pay,white:offer.white};
  close();openPeaceNegotiation(to,from,null,reversed);
 });
 root.querySelectorAll('#peaceWhite,#peacePay,#peaceReceive').forEach(el=>el.onchange=refresh);refresh();
 root.querySelector('#peaceConfirm').onclick=()=>{
  const o=getOffer(),error=validateTreaty(o);if(error){root.querySelector('#peaceEstimate').textContent=error;return}
  if(incoming||rand()<treatyAcceptance(o)){
   const result=finalizePeace(o);if(result){root.querySelector('#peaceEstimate').textContent=result;return}close();
  }else{actionNotice=countries[to].name+' rejected the peace terms.';log(countries[to].name+' rejects a peace offer from '+countries[from].name+'.','peace');close();update()}
 };
}
// Replace the old single-click random ceasefire with player-selected terms.
const peaceAction=document.getElementById('peaceBtn');
peaceAction.onclick=()=>{
 if(gameMode!=='player'||humanId===null)return;
 const target=+document.getElementById('targetCountry').value;
 if(!atWar(humanId,target)){actionNotice='Not at war with this country.';update();return}
 openPeaceNegotiation(humanId,target);
};
function generateBotOffer(from,to){
 const momentum=treatyMomentum(from,to),sender=countries[from];
 const losing=momentum<-.08;
 const offer={from,to,give:[],take:[],pay:0,receive:0,white:false};
 // AI territorial concessions must connect to the recipient's land, or to
 // another county already included in this offer. Never hand over enclaves.
 const adjacentConcessions=(giver,recipient,selected=[])=>{
  const included=new Set(selected);
  return treatyCounties(giver,recipient).filter(t=>!included.has(t.i)&&(countyGraph[t.i]||[]).some(j=>territories[j]?.owner===recipient||included.has(j)))
   .sort((a,b)=>treatyCountyValue(a)-treatyCountyValue(b));
 };
 if(losing){
  const candidates=adjacentConcessions(from,to);
  if(candidates.length&&countryStats(sender).holdings.length>3)offer.give=[candidates[0].i];
  else offer.pay=Math.min(Math.floor(sender.treasury*.14),40);
 }else if(momentum>.23){
  const available=adjacentConcessions(to,from);
  if(available.length)offer.take=[available[0].i];
  else offer.receive=Math.min(Math.floor(countries[to].treasury*.1),25);
 }else offer.white=true;
 const rejected=peaceLastOffers.get(pactKey(from,to))||0;
 if(rejected){
  // An opponent cannot simply resend the same rejected terms.
  offer.white=false;offer.take=[];offer.receive=0;
  const minCount=peaceMinimumCounties.get(pactKey(from,to))??rejected;
  const maxCount=Math.max(0,treatyCounties(from,to).length-1-offer.give.length);
  for(let i=0;i<Math.min(Math.max(rejected,minCount-offer.give.length),maxCount);i++){
   const next=adjacentConcessions(from,to,offer.give)[0];
   if(!next)break;
   offer.give.push(next.i);
  }
  offer.pay=Math.min(Math.floor(sender.treasury*.6),Math.floor(sender.treasury*(.10+.10*rejected)));
  if(offer.give.length<minCount)return null; // Do not pester the player with insufficient terms.
 }
 return offer;
}
const priorPeaceTick=simulatePeriod;
simulatePeriod=function(){
 const before=daysElapsed;priorPeaceTick();if(daysElapsed-before<=0)return;
 if(daysElapsed-peaceOfferDays<91)return;peaceOfferDays=daysElapsed;
 for(const c of [...coalitionWars.values()]){
  if(daysElapsed-c.started<180)continue;
  const [a,b]=c.leaders;if(!atWar(a,b))continue;
  const exhausted=Math.max(countries[a].warExhaustion||0,countries[b].warExhaustion||0);
  if(exhausted<20&&daysElapsed-c.started<730)continue;
  if(rand()>.18+exhausted/250)continue;
  const sender=treatyMomentum(a,b)<0?a:b,receiver=sender===a?b:a;
  if(gameMode==='player'&&receiver===humanId&&peaceCapitulationOnly.has(pactKey(sender,receiver)))continue;
  const offer=generateBotOffer(sender,receiver);
  if(!offer)continue;
  if(gameMode==='player'&&receiver===humanId){if(!peaceDialog)openPeaceNegotiation(sender,receiver,offer)}
  else if(gameMode!=='player'||sender!==humanId){if(!validateTreaty(offer)&&rand()<treatyAcceptance(offer))finalizePeace(offer)}
 }
};
tick=simulatePeriod;
const priorPeaceGenerate=generate;
generate=function(reuse=false){peaceHoverCleanup?.();peaceHoverCleanup=null;if(peaceDialog){peaceDialog.remove();peaceDialog=null}clearPeaceSelection();peaceOfferDays=0;peaceLastOffers.clear();peaceMinimumCounties.clear();peaceCapitulationOnly.clear();priorPeaceGenerate(reuse)};
// The simulation always advances by a week, with just three simple speeds.
timeUnit.value='week';
timeUnit.closest('label').hidden=true;
interval.innerHTML='<option value="1000">1 sec / week</option><option value="100">0.1 sec / week</option><option value="10">0.01 sec / week</option>';
interval.value='1000';
interval.closest('label').firstChild.textContent='Simulation speed';
// Keep the three pacing choices in plain sight, including in Watch mode.
const visiblePacing=interval.closest('label');
visiblePacing.hidden=false;
visiblePacing.classList.add('visible-week-speed');
document.querySelector('.war-bottom .runrow')?.after(visiblePacing);
const obsoleteClockToggle=document.getElementById('clockOptionsToggle');
if(obsoleteClockToggle)obsoleteClockToggle.hidden=true;
// The old Restart handler deliberately reused the seed and reopened the
// campaign chooser. The map button now creates a fresh scenario in place.
const liveRegenerate=$('reset');
liveRegenerate.textContent='↻ Regenerate world';
liveRegenerate.title='Build a new world seed on this map without reopening the start screen';
liveRegenerate.onclick=()=>{
 const previousSeed=initSeed;
 generate(false);
 if(initSeed===previousSeed)generate(false);
 if(typeof fillChoiceNations==='function')fillChoiceNations();
 if(typeof update==='function')update();
};

// Treasury audit: show recurring income separately from discretionary or event costs.
const preAuditTick=simulatePeriod;
simulatePeriod=function(){
 const c=gameMode==='player'&&humanId!==null?countries[humanId]:null;
 const previousCash=c?.treasury??0,previousDay=daysElapsed;
 preAuditTick();
 if(!c||daysElapsed<=previousDay)return;
 const change=c.treasury-previousCash;
 const recurring=c.lastRecurringDays===daysElapsed-previousDay?(c.lastRecurringCredit||0):0;
 c.lastTreasuryAudit={days:daysElapsed-previousDay,change,recurring,other:change-recurring};
};
tick=simulatePeriod;
const preAuditCabinet=renderCabinet;
renderCabinet=function(force=false){
 preAuditCabinet(force);
 const c=gameMode==='player'&&humanId!==null?countries[humanId]:null;
 const body=document.getElementById('cabinetBody');
 if(!c||!body)return;
 // Obsolete wrappers may still be generated by earlier cabinet renderers.
 // Their controls are retired, so remove the now-empty headings entirely.
 for(const title of body.querySelectorAll('.cabinet-section')){
  if(/NATIONAL GOVERNMENT|NATIONAL PRIORITY/i.test(title.textContent))title.remove();
 }
 const old=body.querySelector('.treasury-audit');if(old)old.remove();
 const report=c.lastTreasuryAudit;if(!report)return;
 const box=document.createElement('div');box.className='treasury-audit';
 const signed=n=>(n>=0?'+':'')+n.toFixed(2);
 box.innerHTML='<strong>LAST '+report.days+' DAYS · TREASURY CHANGES</strong><span>Recurring government balance: '+signed(report.recurring)+'</span><span>Separate transactions and events: '+signed(report.other)+'</span><b>Actual treasury change: '+signed(report.change)+'</b>';
 const summary=body.querySelector('.cabinet-summary');summary?.after(box);
};
