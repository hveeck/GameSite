/* Live atlas colors, start-of-campaign choice, and bilateral diplomacy. */
document.querySelector('.maphead')?.remove();
document.querySelector('.map-watermark')?.remove();
const atlasPalette=['#e76f70','#58a9dc','#e5bc58','#9e82dd','#62ba85','#df80b5','#de9258','#6e84d9','#afbc61','#4bb9b8','#b87d67','#c6a3e8','#79bbd6','#dc668f','#b4d27b','#edaa86'];
let previousBorderSignature='',treatyTerms=new Map(),lastTreatyDay=0,initialChoiceDone=false;
const pactKey=(a,b)=>[a,b].sort((x,y)=>x-y).join(':');
function liveAdjacency(){
 const adj=new Map(validCountries().map(c=>[c.id,new Set()]));
 for(let i=0;i<territories.length;i++)for(const j of countyGraph[i]||[]){
  const a=territories[i].owner,b=territories[j].owner;
  if(a!==b&&adj.has(a)&&adj.has(b)){adj.get(a).add(b);adj.get(b).add(a)}
 }
 return adj;
}
function recolorBorders(force=false){
 if(!geomReady||!territories.length)return;
 const adjacent=liveAdjacency();
 const signature=[...adjacent].map(([a,neighbors])=>a+':'+[...neighbors].sort((x,y)=>x-y).join(',')).join('|');
 if(!force&&signature===previousBorderSignature)return;
 previousBorderSignature=signature;
 const labs=atlasPalette.map(c=>d3.lab(c));
 const colorDistance=(a,b)=>Math.hypot(a.l-b.l,a.a-b.a,a.b-b.b);
 const index=new Map();
 for(const c of countries){const i=atlasPalette.indexOf(c.color);if(i>=0)index.set(c.id,i)}
 const usage=Array(atlasPalette.length).fill(0);
 const order=[...adjacent.keys()].sort((a,b)=>adjacent.get(b).size-adjacent.get(a).size);
 const assigned=new Map();
 // Prefer the current color if still distinct from *every current neighbor*;
 // only recolor countries made incompatible by border changes.
 for(const id of order){
  const neighbors=adjacent.get(id),old=index.get(id);
  let choice=0,best=-Infinity;
  for(let i=0;i<atlasPalette.length;i++){
   let minimum=200;
   for(const n of neighbors){const other=assigned.get(n);if(other!==undefined)minimum=Math.min(minimum,colorDistance(labs[i],labs[other]))}
   const safe=minimum>=37;
   const score=(safe?1000:minimum*8)+Math.min(100,minimum)*.15-usage[i]*8+(i===old?85:0);
   if(score>best){best=score;choice=i}
  }
  assigned.set(id,choice);usage[choice]++;
 }
 for(const [id,i] of assigned)countries[id].color=atlasPalette[i];
}

function trackTreaties(days){
 if(!days)return;
 const existing=new Set(pacts.map(p=>pactKey(p[0],p[1])));
 for(const key of [...treatyTerms.keys()])if(!existing.has(key))treatyTerms.delete(key);
 for(const p of [...pacts]){
  const key=pactKey(p[0],p[1]),a=countries[p[0]],b=countries[p[1]];
  if(!a||!b)continue;
  if(!treatyTerms.has(key))treatyTerms.set(key,{expires:daysElapsed+540+Math.floor(rand()*1095)});
  const term=treatyTerms.get(key);
  const fit=typeof ideologyAffinity==='function'?ideologyAffinity(a,b):.5;
  const strain=atWar(a.id,b.id)||a.stability<25||b.stability<25||fit<.25;
  if(daysElapsed>=term.expires || (strain&&chance(.32,days)) || chance(.012+(1-fit)*.035,days)){
   pacts=pacts.filter(q=>pactKey(q[0],q[1])!==key);treatyTerms.delete(key);
   log(a.name+' and '+b.name+' '+(daysElapsed>=term.expires?'allow their defense treaty to expire.':'withdraw from their defense pact.'),'peace');
  }
 }
}

const preDiplomacyUpdate=update;
update=function(){recolorBorders();preDiplomacyUpdate();renderBilateral();};
const preDiplomacyGenerate=generate;
generate=function(reuse=false){
 previousBorderSignature='';treatyTerms.clear();lastTreatyDay=0;
 preDiplomacyGenerate(reuse);recolorBorders(true);update();
 if(initialChoiceDone)showCampaignChoice();
};
const preDiplomacyTick=simulatePeriod;
simulatePeriod=function(){
 const before=daysElapsed;preDiplomacyTick();
 const days=daysElapsed-before;
 if(days>0){trackTreaties(days);recolorBorders();update()}
};
tick=simulatePeriod;

// Inspector becomes a diplomatic contact screen when playing as a faction.
const intelCard=document.querySelector('.inspector.card');
const relations=document.createElement('div');relations.id='bilateral';relations.className='bilateral';
intelCard.append(relations);
function diplomacyTarget(){return selectedCounty===null?null:countries[territories[selectedCounty]?.owner]}
function invokeDiplomaticControl(id,target){
 $('targetCountry').value=String(target);$('targetCountry').dispatchEvent(new Event('change'));
 $(id).click();renderBilateral();
}
function tradeProposal(other){
 const own=countries[humanId];if(!own||!other)return;
 if(atWar(own.id,other.id)){actionNotice='Trade is suspended during hostilities.';return}
 if(!costs(own,12))return;
 const goodwill=(own.relations?.[other.id]||0)/150;
 const fit=typeof ideologyAffinity==='function'?ideologyAffinity(own,other):.5;
 const accepted=rand()<clamp(.20+fit*.4+.14*(own.diplomacy+other.diplomacy)+(alliance(own.id,other.id)?.18:0)+goodwill,.04,.93);
 if(accepted){own.treasury+=26;other.treasury=(other.treasury??90)+15;own.stability=clamp(own.stability+1,10,99);actionNotice='Trade agreement signed with '+other.name+'. Treasury +14 net; stability +1.';log(own.name+' and '+other.name+' conclude a commercial agreement.','peace')}
 else{actionNotice=other.name+' declines the proposed trade agreement.';log(other.name+' declines a trade proposal from '+own.name+'.')}
}
function cancelPact(other){
 const key=pactKey(humanId,other.id);
 pacts=pacts.filter(p=>pactKey(p[0],p[1])!==key);treatyTerms.delete(key);
 actionNotice='Defense pact terminated with '+other.name+'.';
 log(countries[humanId].name+' withdraws from its defense pact with '+other.name+'.','peace');
}
function renderBilateral(){
 if(!relations)return;
 const other=diplomacyTarget(),own=countries[humanId];
 if(gameMode!=='player'||!own||!other||other.id===humanId||!countryStats(other).holdings.length){relations.hidden=true;return}
 relations.hidden=false;
 const w=atWar(humanId,other.id),p=alliance(humanId,other.id);
 const label=w?'At war':p?'Defense pact':'No formal treaty';
 relations.innerHTML='<div class="bilateral-head">DIPLOMATIC ACTIONS <small>'+label+'</small></div><div class="bilateral-actions">'+
 '<button data-diplomacy="trade">◇ Trade offer</button>'+
 '<button data-diplomacy="ally" '+(w||p?'disabled':'')+'>♢ Seek alliance</button>'+
 '<button data-diplomacy="war" class="danger" '+(w||p||!bordering(humanId,other.id)?'disabled':'')+'>⚑ Declare war</button>'+
 '<button data-diplomacy="peace" '+(!w?'disabled':'')+'>☮ Offer peace</button>'+
 '<button data-diplomacy="cancel" '+(!p?'disabled':'')+'>✕ End pact</button></div>'+
 (actionNotice?'<div class="diplomacy-notice">'+actionNotice+'</div>':'');
 relations.querySelectorAll('[data-diplomacy]').forEach(btn=>btn.onclick=()=>{
  const target=other.id,act=btn.dataset.diplomacy;
  if(act==='trade')applyDecision(()=>tradeProposal(other));
  else if(act==='cancel')applyDecision(()=>cancelPact(other));
  else invokeDiplomaticControl({ally:'allianceBtn',war:'warBtn',peace:'peaceBtn'}[act],target);
  invalidate();update();
 });
}

// An explicit opening choice, shown over the map until the player enters.
const choiceOverlay=document.createElement('div');choiceOverlay.className='campaign-choice';
choiceOverlay.innerHTML='<div class="choice-dialog"><div class="choice-kicker">FRACTURED UNION / NEW CAMPAIGN</div><h2>How will you enter this world?</h2><p>Observe the competing successor states, or take command of one country and direct its armies, diplomacy, and economy.</p><div class="choice-buttons"><button data-mode="watch" class="chosen">◉ Watch the simulation</button><button data-mode="player">♛ Play as a country</button></div><label id="choiceNationLabel" hidden>Choose your faction<select id="choiceNation"></select></label><button id="enterWorld" class="choice-enter">ENTER THE WORLD →</button></div>';
document.body.append(choiceOverlay);
let choiceMode='watch';
const chooser=choiceOverlay.querySelector('#choiceNation'),chooserLabel=choiceOverlay.querySelector('#choiceNationLabel');
function fillChoiceNations(){
 const active=validCountries().sort((a,b)=>a.name.localeCompare(b.name));
 const current=chooser.value;
 chooser.innerHTML=active.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('');
 if(active.some(c=>String(c.id)===current))chooser.value=current;
}
function showCampaignChoice(){
 stop();choiceOverlay.classList.add('visible');fillChoiceNations();
}
choiceOverlay.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
 choiceMode=b.dataset.mode;chooserLabel.hidden=choiceMode!=='player';
 choiceOverlay.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('chosen',x===b));
});
choiceOverlay.querySelector('#enterWorld').onclick=()=>{
 if(!geomReady){return}
 $('gameMode').value=choiceMode;$('gameMode').dispatchEvent(new Event('change'));
 if(choiceMode==='player'){
  const id=+chooser.value;if(Number.isInteger(id)&&countries[id]){$('playerCountry').value=String(id);$('playerCountry').dispatchEvent(new Event('change'))}
  setPanel('command');
 }else setPanel(null);
 initialChoiceDone=true;choiceOverlay.classList.remove('visible');update();
};
const setupButton=$('generate');
// New scenarios return to an opening campaign selection.
const originalGenerateClick=setupButton.onclick;
setupButton.onclick=()=>{originalGenerateClick();showCampaignChoice()};
const originalResetClick=$('reset').onclick;
$('reset').onclick=()=>{originalResetClick();showCampaignChoice()};
// The initial county geometry loads asynchronously.
choiceOverlay.classList.add('visible');
const initialRefresh=setInterval(()=>{if(!geomReady)return;clearInterval(initialRefresh);recolorBorders(true);update();fillChoiceNations()},350);
