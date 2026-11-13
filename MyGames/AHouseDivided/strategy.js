/* Campaign mode and granular simulation clock. All military/political events are fictional. */
let campaignDate=new Date(Date.UTC(2032,0,1)),humanId=null,gameMode='watch',actionNotice='',daysElapsed=0;
const oldGenerate=generate, oldGeoUpdate=update;
const dateLabel=()=>campaignDate.toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric',timeZone:'UTC'});
log=function(msg,type=''){events.unshift({year:dateLabel(),msg,type});events=events.slice(0,65)};
const chance=(annual,days)=>rand() < 1-Math.pow(1-clamp(annual,0,.999),days/365);
function costs(c,amount){if(c.treasury<amount){actionNotice='Insufficient treasury for this decision.';return false}c.treasury-=amount;return true}
function setupCountry(c){if(c.treasury===undefined)c.treasury=90+Math.min(80,countryStats(c).economy*.15);if(c.readiness===undefined)c.readiness=50+Math.round(rand()*20);if(c.fort===undefined)c.fort=0;if(c.industryBonus===undefined)c.industryBonus=0}

// Insert calendar settings into the original control panel.
const controls=document.createElement('div');
controls.className='temporal-controls';
controls.innerHTML='<div class="section-head"><span>TIME & PACING</span><span>GRANULAR CLOCK</span></div><div class="twocol"><label>Time per advance<select id="timeUnit"><option value="day">1 day</option><option value="week" selected>1 week</option><option value="month">1 month</option></select></label><label>Auto advance every<select id="interval"><option value="500">0.5 sec</option><option value="1000">1 sec</option><option value="2000" selected>2 sec</option><option value="4000">4 sec</option></select></label></div><div class="temporal-note">When paused, Advance moves one selected interval. When running, the same increment occurs every selected number of seconds.</div>';
document.querySelector('.control .runrow').before(controls);
const timeUnit=$('timeUnit'),interval=$('interval');
const rapid=document.createElement('option');rapid.value='100';rapid.textContent='0.1 sec';interval.prepend(rapid);
function syncStep(){const labels={day:'day',week:'week',month:'month'};$('step').textContent='Advance 1 '+labels[timeUnit.value]+' →'}
syncStep();timeUnit.onchange=syncStep;
function setClock(){
 $('yearLabel').textContent=dateLabel();
 $('yearLabel').classList.add('clock-date');
}
function refreshCountryPicker(){
 const active=validCountries().sort((a,b)=>countryStats(b).pop-countryStats(a).pop);
 const current=$('playerCountry').value;
 $('playerCountry').innerHTML=active.map(c=>'<option value="'+c.id+'">'+c.name+' ('+fmt(countryStats(c).pop)+'M)</option>').join('');
 if(active.some(c=>String(c.id)===current))$('playerCountry').value=current;
 else if(humanId!==null&&active.some(c=>c.id===humanId))$('playerCountry').value=String(humanId);
 else if(active.length)$('playerCountry').value=String(active[0].id);
 if(gameMode==='player'&&humanId===null&&active.length)humanId=+$('playerCountry').value;
}
function refreshTargets(){
 const target=$('targetCountry').value;
 if(humanId===null)return;
 const options=validCountries().filter(c=>c.id!==humanId).sort((a,b)=>a.name.localeCompare(b.name));
 $('targetCountry').innerHTML=options.map(c=>'<option value="'+c.id+'">'+(atWar(c.id,humanId)?'⚔ ':alliance(c.id,humanId)?'◇ ':'')+c.name+'</option>').join('');
 if(options.some(c=>String(c.id)===target))$('targetCountry').value=target;
}
function renderCommand(){
 $('modeStatus').textContent=gameMode==='player'?'PLAYER COMMAND':'OBSERVER';
 $('playerSetup').hidden=gameMode!=='player';
 if(gameMode!=='player')return;
 const c=countries[humanId];if(!c)return;
 const st=countryStats(c);setupCountry(c);
 if($('playerCountry').value!==String(humanId))$('playerCountry').value=String(humanId);
 const alive=st.holdings.length>0;
 $('playerBanner').textContent=alive?'You command '+c.name+'. Other countries are AI-controlled. Select another country below to change factions.':'Your country has been conquered. Choose another surviving faction to continue.';
 $('actionStatus').textContent=alive?'DECISIONS AVAILABLE':'FACTION ELIMINATED';
 $('commandStats').innerHTML='<div class="command-metrics"><div><strong>'+Math.floor(c.treasury)+'</strong><span>Treasury</span></div><div><strong>'+Math.round(c.readiness)+'</strong><span>Strength</span></div><div><strong>'+Math.round(c.fort*100)+'%</strong><span>Fortification</span></div></div>'+(actionNotice?'<div class="temporal-note" style="margin-bottom:12px;color:#e6c18d">'+actionNotice+'</div>':'');
 for(let id of ['mobilizeBtn','investBtn','fortifyBtn','allianceBtn','warBtn','peaceBtn'])$(id).disabled=!alive;
}
function redrawCampaign(){oldGeoUpdate();setClock();if(gameMode==='player'){renderCommand();refreshTargets()}}
update=redrawCampaign;
const unmodifiedGenerate=generate;
generate=function(reuse=false){
 campaignDate=new Date(Date.UTC(2032,0,1));daysElapsed=0;actionNotice='';
 unmodifiedGenerate(reuse);
 if(!geomReady)return;
 invalidate();for(const c of countries)setupCountry(c);
 if(gameMode==='player'){humanId=null;refreshCountryPicker();humanId=+$('playerCountry').value}
 update();
};
function progressDate(){
 let before=campaignDate.getTime();
 if(timeUnit.value==='day')campaignDate.setUTCDate(campaignDate.getUTCDate()+1);
 if(timeUnit.value==='week')campaignDate.setUTCDate(campaignDate.getUTCDate()+7);
 if(timeUnit.value==='month')campaignDate.setUTCMonth(campaignDate.getUTCMonth()+1);
 year=campaignDate.getUTCFullYear();
 const days=Math.round((campaignDate.getTime()-before)/86400000);daysElapsed+=days;
 return days;
}
function regionalUprising(parent){
 const holdings=countryStats(parent).holdings;
 if(holdings.length<4||parent.stability>=40)return false;
 const avgE=nums(holdings.map(t=>t.e))/holdings.length;
 const avgR=nums(holdings.map(t=>t.res))/holdings.length;
 const ideologyRegions=typeof ideologyByRegion==='undefined'?{}:ideologyByRegion;
 const grievances=holdings.map(t=>{
  const regional=t.region!==parent.origin?1:0;
  const occupation=typeof countyIntegration==='function'?1-countyIntegration(t):0;
  const economic=Math.min(1,Math.abs(t.e-avgE)/Math.max(1,avgE));
  const resources=Math.min(1,Math.abs(t.res-avgR)/Math.max(1,avgR));
  const outlook=(ideologyRegions[t.region]||[]).includes(parent.ideology)?0:1;
  // Differences in regional culture, economic interests, and political outlook
  // influence secession; race alone never causes an uprising.
  return {t,score:regional*3+occupation*4+economic*1.3+resources*.8+outlook*1.7+rand()*1.2};
 }).sort((a,b)=>b.score-a.score);
 const seed=choice(grievances.slice(0,Math.min(10,grievances.length))).t;
 const count=Math.min(45,Math.max(4,Math.round(holdings.length*(.06+rand()*.13))));
 const claim=new Set([seed.i]),queue=[seed.i];
 while(queue.length&&claim.size<count){
  const i=queue.shift();
  const adjacent=countyGraph[i].filter(j=>territories[j].owner===parent.id&&!claim.has(j))
    .sort((a,b)=>(territories[b].region===seed.region?2:0)-(territories[a].region===seed.region?2:0));
  for(const j of adjacent){if(claim.size>=count)break;claim.add(j);queue.push(j)}
 }
 if(claim.size<4)return false;
 const id=countries.length;
 const types=['Free Republic','Provisional Council','Independence League','Regional Assembly','Self-Governing Union'];
 const roots=[seed.name+' '+choice(types),names[seed.state]+' '+choice(types),seed.name+' '+names[seed.state]+' Council'];
 let name=roots.find(n=>!countries.some(c=>c.name.toLowerCase()===n.toLowerCase()));
 if(!name)name=seed.name+' '+names[seed.state]+' Assembly';
 const rebels={id,name,anchor:seed.name,color:'#d6a06a',capital:seed.state,origin:seed.region,
  stability:Math.round(40+rand()*18),morale:Math.round(45+rand()*22),aggression:.35+rand()*.3,
  diplomacy:rand(),inclusion:.6+rand()*.3};
 const alternate=(ideologyRegions[seed.region]||ideologyKeys).filter(x=>x!==parent.ideology);
 rebels.ideology=alternate.length?choice(alternate):'republicanism';
 countries.push(rebels);
 for(const i of claim){territories[i].owner=id;territories[i].coreOwner=id;territories[i].integrationForOwner=id;territories[i].integrationProgress=1;}
 armies=armies.filter(a=>a.owner!==parent.id||!claim.has(a.county));
 createArmy(id,seed.i,Math.max(7,Math.round(Math.sqrt(claim.size)*2.8)));
 createArmy(id,[...claim][claim.size-1],Math.max(5,Math.round(Math.sqrt(claim.size)*1.5)));
 rebels.initialCount=claim.size;rebels.initialPower=0;rebels.surrendered=false;
 parent.stability=clamp(parent.stability-4,5,99);
 invalidate();setupCountry(rebels);war(id,parent.id);
 log('Civil war erupts: '+rebels.name+' breaks from '+parent.name+' across '+claim.size+' connected counties, citing regional identity and political disputes.','warlog');
 return true;
}
function simulatePeriod(){
 if(!geomReady)return;
 const days=progressDate(),vol=+$('volatility').value;
 let live=validCountries();
 for(const c of live){
  setupCountry(c);const s=countryStats(c);
  // Cabinet advances are the single source of monthly revenue and spending.
  // Do not apply the obsolete second, often-negative treasury calculation.
  c.stability=clamp(c.stability+(rand()-.515)*3*vol*days/30,10,99);
  c.stability=clamp(c.stability+(c.cohesionPressure||0)*days/365,10,99);
  c.readiness=clamp(c.readiness-.17*days/30,5,100);
  c.morale=clamp(c.morale+(rand()-.5)*2*days/30,10,99);
 }
 invalidate();
 // AI countries make occasional alliances and declarations, evaluated in calendar time.
 for(const a of live){
  if(gameMode==='player'&&a.id===humanId)continue;
  let adjacent=live.filter(b=>b.id!==a.id&&bordering(a.id,b.id));
  const likelyPartners=live.filter(b=>b.id!==a.id&&!atWar(a.id,b.id)&&!alliance(a.id,b.id)&&
   (bordering(a.id,b.id)||(typeof ideologyAffinity==='function'&&ideologyAffinity(a,b)>.78)));
  if(gameMode!=='player'&&$('alliances').checked&&likelyPartners.length&&chance(.075*vol,days)&&partnerIds(a.id).length<3){
   const rated=likelyPartners.map(b=>({b,score:(typeof relationRating==='function'?relationRating(a,b)/100:ideologyAffinity(a,b))+.1*Math.min(2,countryStats(b).power/Math.max(1,countryStats(a).power))})).sort((x,y)=>y.score-x.score);
   const partnerPool=rated.slice(0,Math.min(5,rated.length));
   const b=choice(partnerPool).b,fit=typeof ideologyAffinity==='function'?ideologyAffinity(a,b):.5;
   const greedy=Math.max(a.aggression,b.aggression);
   if(b&&!(gameMode==='player'&&b.id===humanId)&&typeof allianceAcceptance==='function'&&rand()<allianceAcceptance(a,b)){
    signStrategicAlliance(a,b)
   }
  }
  if(enemies(a.id).length<2&&chance((.22+a.aggression*.27)*vol*(typeof leaderPersonality==='function'?leaderPersonality(a).attack:1),days)){
   let rivals=adjacent.filter(b=>!alliance(a.id,b.id)&&!atWar(a.id,b.id)&&!(typeof hasNonAggression==='function'&&hasNonAggression(a.id,b.id)));
   if(rivals.length){
    const allies=id=>pacts.filter(p=>p.includes(id)).map(p=>countries[p[0]===id?p[1]:p[0]]).filter(x=>x&&countryStats(x).holdings.length);
    const ownPower=countryStats(a).power*(.65+a.readiness/110)*(1+Math.min(.45,a.treasury/500));
    const ranked=rivals.map(b=>{
      const fit=ideologyAffinity(a,b),enemyPower=countryStats(b).power*(.65+b.readiness/110);
      const support=allies(a.id).filter(x=>!alliance(x.id,b.id)&&ideologyAffinity(x,b)<.62).reduce((n,x)=>n+countryStats(x).power*.45,0);
      const defense=allies(b.id).reduce((n,x)=>n+countryStats(x).power*.6,0);
      const odds=(ownPower+support)/Math.max(.1,enemyPower+defense);
      const opportunity=enemies(b.id).length*.20;
      const affinity=typeof relationRating==='function'?relationRating(a,b)/100:fit;
      return {b,fit,odds,score:odds*.6+(1-affinity)*.8+opportunity+a.aggression*.35+rand()*.18};
    }).filter(r=>r.odds>=(typeof aiChallenge!=='undefined'&&aiChallenge==='hard'?1.24:typeof aiChallenge!=='undefined'&&aiChallenge==='easy'?.87:1.08)&&r.fit<.82);
    ranked.sort((x,y)=>y.score-x.score);
    const target=ranked[0];
    if(target&&rand()<clamp(.10+(1-target.fit)*.5+(a.aggression||0)*.20,.05,.7))war(a.id,target.b.id);
   }
  }
 }
 // A war may feature several local battles over time rather than one state-sized annual result.
 for(const w of [...wars]){
  const[a,b]=w;if(!countryStats(countries[a]).holdings.length||!countryStats(countries[b]).holdings.length||!bordering(a,b)){
   wars=wars.filter(x=>x!==w);continue;
  }
  const atPlayer=gameMode==='player'&&(a===humanId||b===humanId);
  // Wars end only by capitulation or an accepted peace proposal.
  // Simulated fronts should shift on a scale of weeks or months instead of
  // being mostly static for years at moderate playback settings.
  if(!chance(.9999,days))continue;
  const aPower=countryStats(countries[a]).power,bPower=countryStats(countries[b]).power;
  const tacticalA=clamp(.5+(aPower-bPower)/Math.max(1,aPower+bPower)*.38,.26,.74);
  const atk=rand()<tacticalA?a:b,def=atk===a?b:a;
  // The player's side attacks through explicit army orders, not random AI offensives.
  if(gameMode==='player'&&atk===humanId)continue;
  let front=territories.filter((t,i)=>t.owner===def&&countyGraph[i].some(j=>territories[j].owner===atk));
  if(!front.length)continue;
  const difficulty=typeof aiChallenge==='undefined'?'medium':aiChallenge;
  front.sort((x,y)=>{
   const score=t=>t.p*1.7+t.e*1.5-(typeof ownedArmies==='function'?ownedArmies(def).filter(z=>z.county===t.i).reduce((s,z)=>s+z.strength,0):0)*1.2;
   return score(y)-score(x);
  });
  let target=difficulty==='easy'?choice(front):choice(front.slice(0,Math.max(1,Math.ceil(front.length*(difficulty==='hard'?.15:.45))))),A=countries[atk],D=countries[def],sA=countryStats(A),sD=countryStats(D);
  const support=(id,opponent)=>pacts.filter(x=>x.includes(id)).reduce((sum,x)=>sum+countryStats(countries[x[0]===id?x[1]:x[0]]).power*.1,0)+
    (typeof coalitionSupportPower==='function'?coalitionSupportPower(id,opponent):0);
  let attack=(sA.power+support(atk,def))*(.55+A.readiness/110)*(.7+rand()*.65);
  let defense=(sD.power+support(def,atk))*(.60+D.readiness/115)*(1+D.fort)*(.7+rand()*.65);
  if(typeof localArmyPower==='function'){
   attack*=localArmyPower(atk,target.i,true);
   defense*=localArmyPower(def,target.i,false);
  }
  // Governments need troops on the actual front; national rank alone cannot
  // overwhelm a well-held county. Civic health and fatigue matter in the field.
  const frontline=countyGraph[target.i].filter(j=>territories[j].owner===atk);
  const committed=typeof ownedArmies==='function'?ownedArmies(atk).filter(x=>frontline.includes(x.county)).reduce((n,x)=>n+x.strength,0):0;
  const defending=typeof ownedArmies==='function'?ownedArmies(def).filter(x=>x.county===target.i||countyGraph[target.i].includes(x.county)).reduce((n,x)=>n+x.strength*(x.county===target.i?1:.45),0):0;
  attack*=clamp(.25+committed/26,.23,1.2)*(.48+.52*clamp(A.stability/75,.2,1.2));
  defense*=clamp(.72+defending/34,.72,1.7)*(.48+.52*clamp(D.stability/75,.2,1.2));
  displaced+=target.p*.012*vol;
  A.stability=clamp(A.stability-.15,10,99);D.stability=clamp(D.stability-.2,10,99);
  A.readiness=clamp(A.readiness-.25,5,100);D.readiness=clamp(D.readiness-.2,5,100);
  if(committed>=5&&attack>defense*.95&&rand()<.55*vol){
   const captured=[target];
   if(attack>defense*1.75&&rand()<.25)captured.push(...countyGraph[target.i].map(j=>territories[j]).filter(t=>t.owner===def&&!ownedArmies(def).some(x=>x.county===t.i)).slice(0,1));
   for(const t of captured){if(typeof recordWarCapture==='function')recordWarCapture(atk,def,t);t.owner=atk}invalidate();
   const territorialShock=captured.length*clamp(45/Math.max(5,D.initialCount||countryStats(D).holdings.length),.3,3);
   D.warExhaustion=clamp((D.warExhaustion||0)+Math.min(2,territorialShock*.25)*clamp((95-(D.stability||65))/85,.15,1.2),0,100);
   A.warExhaustion=clamp((A.warExhaustion||0)+.08,0,100);
   log(A.name+' advances into '+target.name+' County, '+target.state+' ('+captured.length+' county territories).','warlog');
   if(!countryStats(D).holdings.length){
    if(typeof completeTotalConquest==='function')completeTotalConquest(atk,def);
    else{wars=wars.filter(x=>!x.includes(def));pacts=pacts.filter(x=>!x.includes(def));}
   }
  }else if(rand()<.3)log('Offensives stall around '+target.name+' County, '+target.state+'.','warlog');
 }
 if($('interventions').checked){
  const candidates=validCountries().filter(c=>(countryStats(c).holdings.length>=70||gameMode==='player'&&c.id===humanId&&countryStats(c).holdings.length>=3)&&c.stability<40);
  for(const c of candidates){
   const instability=clamp((32-c.stability)/32,0,1);
   const authorities=['fascism','communism','military_junta','theocracy','monarchy'];
   const forceReady=typeof militaryPosture==='function'&&militaryPosture(c).ratio>=.6;
   const economicallyReady=countryStats(c).economy>=2&&c.treasury>=60&&typeof recurringLedger==='function'&&recurringLedger(c).net>=0;
   const strongInstitutions=c.stability>=58&&c.readiness>=65&&forceReady&&economicallyReady;
   const authorityMultiplier=c.authorityPolicy==='decentralized'?.72:c.authorityPolicy==='centralized'?(strongInstitutions?.62:1.65):1;
   const authoritarian=(authorities.includes(c.ideology)? .24:1)*authorityMultiplier;
   const institutional=clamp(1-(c.inclusion||.6)*.42, .5,1);
   const posture=typeof militaryPosture==='function'?militaryPosture(c):null;
   const military=clamp((1-(c.readiness||50)/140)*(posture?.rebelRisk??1),.08,1.25);
   const governed=clamp(1-(c.treasury||0)/600,.35,1);
   const difficulty=typeof aiChallenge==='undefined'?'medium':aiChallenge;
   const isPlayer=gameMode==='player'&&c.id===humanId;
   const civicShock=clamp((40-c.stability)/30,0,1);
   const severeRisk=isPlayer?({easy:.08,medium:.25,hard:.48})[difficulty]*civicShock:0;
   const integrationRisk=typeof integrationPressure==='function'?integrationPressure(c).ratio*({easy:.03,medium:.18,hard:.44})[difficulty]:0;
   const annualRisk=clamp((.015+instability*.10)*authoritarian*institutional*military*governed*vol+severeRisk+integrationRisk,0,.85);
   if(chance(annualRisk,days))regionalUprising(c);
  }
  if(!candidates.length&&chance(.09*vol,days)){
   const c=choice(validCountries());if(c&&c.stability<65){c.stability=clamp(c.stability-1,5,99);log('Regional political unrest unsettles '+c.name+'.')}
  }
 }
 invalidate();update();
}
tick=simulatePeriod;
function campaignStop(){if(timer){clearInterval(timer);timer=null}$('play').textContent='▶ Run'}
stop=campaignStop;
function campaignStart(){
 if(timer){campaignStop();return}
 timer=setInterval(simulatePeriod,+interval.value);
 $('play').textContent='❚❚ Pause';
}
start=campaignStart;
$('play').onclick=campaignStart;
$('step').onclick=()=>{campaignStop();simulatePeriod()};
interval.onchange=()=>{if(timer){campaignStop();campaignStart()}};
$('generate').onclick=()=>generate();
$('reset').onclick=()=>generate(true);
$('gameMode').onchange=()=>{
 gameMode=$('gameMode').value;actionNotice='';if(gameMode==='player'){refreshCountryPicker();humanId=+$('playerCountry').value}else humanId=null;update()
};
$('playerCountry').onchange=()=>{humanId=+$('playerCountry').value;actionNotice='';update()};
function applyDecision(fn){
 if(gameMode!=='player'||humanId===null)return;
 const c=countries[humanId];if(!countryStats(c).holdings.length)return;
 fn(c);invalidate();update();
}
$('mobilizeBtn').onclick=()=>applyDecision(c=>{if(!costs(c,30))return;c.readiness=clamp(c.readiness+19,5,100);c.stability=clamp(c.stability-2,10,99);actionNotice='Military mobilization approved. Strength +19, stability −2.';log(c.name+' begins large-scale mobilization.')});
$('investBtn').onclick=()=>applyDecision(c=>{if(!costs(c,35))return;c.industryBonus+=.10;c.stability=clamp(c.stability+3,10,99);actionNotice='Industry investment completed. Future revenue +10%, stability +3.';log(c.name+' announces an industrial recovery program.','peace')});
$('fortifyBtn').onclick=()=>applyDecision(c=>{if(!costs(c,28))return;c.fort=clamp(c.fort+.12,0,.6);actionNotice='Frontier defenses reinforced. Defensive strength +12%.';log(c.name+' fortifies its frontiers.')});
$('allianceBtn').onclick=()=>applyDecision(c=>{
 const d=countries[+$('targetCountry').value];if(!d||!countryStats(d).holdings.length)return;
 if(atWar(c.id,d.id)){actionNotice='You cannot ally with a country while at war.';return}
 if(alliance(c.id,d.id)){actionNotice='You already have a defense pact.';return}
 if(typeof allianceAcceptance==='function'&&allianceAcceptance(c,d)===0){actionNotice='Relations must be 65+, with room for another ally and no treaty cooldown.';return}
 if(!costs(c,12))return;
 if(rand()<allianceAcceptance(c,d)){signStrategicAlliance(c,d);actionNotice=d.name+' accepts your five-year defense alliance.'}
 else{actionNotice=d.name+' declines your alliance proposal.';log(d.name+' rejects a diplomatic overture from '+c.name+'.')}
});
$('warBtn').onclick=()=>applyDecision(c=>{
 const d=countries[+$('targetCountry').value];if(!d)return;
 if(!bordering(c.id,d.id)){actionNotice='You need a common land frontier to declare war.';return}
 if(alliance(c.id,d.id)){actionNotice='End your defense pact before considering hostilities.';return}
 if(atWar(c.id,d.id)){actionNotice='You are already at war with this country.';return}
 if(!costs(c,10))return;
 c.readiness=clamp(c.readiness-5,5,100);war(c.id,d.id);actionNotice='War declared on '+d.name+'. Your troops can now fight along the frontier.';
});
$('peaceBtn').onclick=()=>applyDecision(c=>{
 const d=countries[+$('targetCountry').value];if(!d)return;
 if(!atWar(c.id,d.id)){actionNotice='No active war with '+d.name+'.';return}
 const ratio=countryStats(c).power/Math.max(1,countryStats(d).power);
 const exhaustion=(c.warExhaustion||0)+(d.warExhaustion||0);
 if(rand()<clamp(.19+.15/Math.max(.25,ratio)+exhaustion/260,.12,.88)){
  if(typeof settleWar==='function')settleWar(c.id,d.id);
  else{wars=wars.filter(w=>!(w.includes(c.id)&&w.includes(d.id)));log(c.name+' and '+d.name+' agree to peace.','peace')}
  actionNotice=d.name+' accepts peace terms.';
 }else{actionNotice=d.name+' rejects your peace proposal.';log(d.name+' refuses a ceasefire proposal from '+c.name+'.')}
});
setClock();
document.querySelector('#help .modal p:last-of-type').textContent='Tip: select day, week, or month increments and choose how many seconds each automatic step takes. Pause at any time for a manual advance. In Play as a Faction mode, choose your government and issue economic, military and diplomatic orders while the other countries remain AI-controlled.';
