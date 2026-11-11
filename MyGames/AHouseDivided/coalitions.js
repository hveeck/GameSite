/* Defense treaties are military commitments, not passive percentage bonuses. */
let coalitionSerial=0;
const coalitionWars=new Map();
function coalitionKey(a,b){return pactKey(a,b)}
function coalitionOf(a,b){return [...coalitionWars.values()].find(c=>c.sides.some(s=>s.includes(a))&&c.sides.some(s=>s.includes(b))&&!c.sides.some(s=>s.includes(a)&&s.includes(b)))}
function coalitionFor(id){return [...coalitionWars.values()].filter(c=>c.sides.some(s=>s.includes(id)))}
function coalitionSide(c,id){return c.sides.findIndex(s=>s.includes(id))}
function validPartner(id){return countries[id]&&countryStats(countries[id]).holdings.length>0}
function partnerIds(id){return pacts.filter(p=>p.includes(id)).map(p=>p[0]===id?p[1]:p[0]).filter(validPartner)}
function militaryCommitmentOdds(ally,leader,enemy,defensive){
 const a=countries[ally],l=countries[leader],e=countries[enemy];
 if(!a||!l||!e)return 0;
 const fit=ideologyAffinity(a,l),opposition=1-ideologyAffinity(a,e),relation=relationRating(a,l)/100;
 const fatigue=(a.warExhaustion||0)/100,overload=Math.min(1,enemies(ally).length/3);
 return clamp((defensive?.91:.17)+(relation-.5)*.22+(fit-.5)*.25+(opposition-.5)*.24+(a.stability-55)/280-fatigue*.38-overload*.24,.04,defensive?.98:.92);
}
function attachCoalition(c,id,side,voluntary=false){
 if(!validPartner(id)||coalitionSide(c,id)!==-1)return false;
 const opponents=c.sides[1-side];
 // A nation with no history of conquest should face its original opponent,
 // not an instant pile-on by that opponent's military partners. Treaties remain
 // intact and may be honored in later, expansionist wars.
 if(gameMode==='player'&&opponents.includes(humanId)&&
    typeof humanContainmentAlarm==='function'&&!humanContainmentAlarm())return false;
 if(gameMode==='player'&&opponents.includes(humanId)&&
    typeof containmentFear==='function'&&!containmentFear(countries[id],countries[humanId]))return false;
 if(opponents.some(enemy=>alliance(id,enemy)||hasNonAggression(id,enemy)))return false;
 c.sides[side].push(id);
 for(const enemy of opponents){
  if(id===enemy||atWar(id,enemy))continue;
  wars.push([id,enemy]);c.ownedPairs.add(coalitionKey(id,enemy));
 }
 const joined=countries[id];
 joined.readiness=clamp(joined.readiness-1,5,100);
 log(joined.name+' joins the '+(side===0?'offensive':'defensive')+' coalition in the '+countries[c.leaders[0]].name+'–'+countries[c.leaders[1]].name+' war.','warlog');
 if(id===humanId&&gameMode==='player'){
  queueNotice('ALLIANCE HONORED','Your ally is under attack',joined.name+' enters the war as a treaty obligation. Your divisions can now defend your ally.');
 }
 return true;
}
function requestWarSupport(c,ally,side,automatic=false){
 if(coalitionSide(c,ally)!==-1)return false;
 const leader=c.leaders[side],enemy=c.leaders[1-side];
 if(!partnerIds(leader).includes(ally))return false;
 if(gameMode==='player'&&c.sides[1-side].includes(humanId)&&
    typeof humanContainmentAlarm==='function'&&!humanContainmentAlarm())return false;
 const odds=militaryCommitmentOdds(ally,leader,enemy,side===1);
 if(rand()<odds)return attachCoalition(c,ally,side,!automatic);
 const a=countries[ally],l=countries[leader];
 if(side===1){
  pacts=pacts.filter(p=>coalitionKey(p[0],p[1])!==coalitionKey(ally,leader));
  initAgency(a);initAgency(l);
  a.relations[leader]=clamp((a.relations[leader]||0)-30,-100,100);
  a.stability=clamp(a.stability-3,5,99);
  log(a.name+' breaks its defense treaty with '+l.name+' and refuses to join the war.','warlog');
 }else log(a.name+' declines '+l.name+'’s call to arms.','peace');
 return false;
}
function startCoalition(a,b){
 const c={id:++coalitionSerial,leaders:[a,b],sides:[[a],[b]],ownedPairs:new Set(),contributions:{},startOwners:new Map(territories.map(t=>[t.i,t.owner])),started:daysElapsed};
 coalitionWars.set(c.id,c);
 // Only the defender's direct treaty partners are obliged; they do not call
 // their own allies, avoiding an unlimited network-wide chain reaction.
 for(const ally of partnerIds(b))requestWarSupport(c,ally,1,true);
 if(a!==humanId&&gameMode==='player'){
  for(const ally of partnerIds(a))if(rand()<.62)requestWarSupport(c,ally,0,true);
 }else if(gameMode!=='player'){
  for(const ally of partnerIds(a))if(rand()<.62)requestWarSupport(c,ally,0,true);
 }
 log('Coalition war: '+countries[a].name+' versus '+countries[b].name+'.','warlog');
 return c;
}
const priorCoalitionWar=war;
war=function(a,b){
 const existed=atWar(a,b);
 const result=priorCoalitionWar(a,b);
 if(!existed&&atWar(a,b)&&!coalitionOf(a,b))startCoalition(a,b);
 return result;
};
function endCoalition(c,reason='peace'){
 for(const key of c.ownedPairs){
  const [a,b]=key.split(':').map(Number);
  wars=wars.filter(w=>coalitionKey(w[0],w[1])!==key);
 }
 coalitionWars.delete(c.id);
 if(reason==='peace')log('The '+countries[c.leaders[0]].name+'–'+countries[c.leaders[1]].name+' coalition war ends.','peace');
}
function reconcileCoalitions(){
 for(const c of [...coalitionWars.values()]){
  // Remove capitulated members, but do not end a coalition merely because
  // one original leader has fallen. Surviving allies are still belligerents.
  c.sides=c.sides.map(side=>side.filter(validPartner));
  for(const key of [...c.ownedPairs]){
   const [a,b]=key.split(':').map(Number);
   if(!validPartner(a)||!validPartner(b)){
    wars=wars.filter(w=>coalitionKey(w[0],w[1])!==key);
    c.ownedPairs.delete(key);
   }
  }
  if(c.sides.some(side=>side.length===0)){endCoalition(c,'victory');continue}
  c.leaders=c.sides.map((side,i)=>side.includes(c.leaders[i])?c.leaders[i]:side[0]);
  for(const a of c.sides[0])for(const b of c.sides[1]){
   if(alliance(a,b))continue;
   if(!atWar(a,b)){wars.push([a,b]);c.ownedPairs.add(coalitionKey(a,b))}
  }
 }
}
const priorCoalitionTick=simulatePeriod;
simulatePeriod=function(){priorCoalitionTick();reconcileCoalitions()};
tick=simulatePeriod;
const priorCoalitionGenerate=generate;
generate=function(reuse=false){coalitionWars.clear();coalitionSerial=0;priorCoalitionGenerate(reuse)};

function coalitionStrength(ids){return ids.reduce((sum,id)=>sum+(validPartner(id)?countryStats(countries[id]).power:0),0)}
function coalitionDivisionCount(ids){return ids.reduce((sum,id)=>sum+ownedArmies(id).length,0)}
function coalitionSupportPower(owner,opponent){
 const c=coalitionFor(owner).find(w=>coalitionSide(w,owner)!==-1&&coalitionSide(w,opponent)!==-1&&coalitionSide(w,owner)!==coalitionSide(w,opponent));
 if(!c)return 0;
 const members=c.sides[coalitionSide(c,owner)].filter(id=>id!==owner&&validPartner(id));
 return Math.min(countryStats(countries[owner]).power*.75,coalitionStrength(members)*.24);
}
function coalitionArmySupport(owner,target){
 const coalition=coalitionFor(owner).find(c=>coalitionSide(c,owner)!==-1);
 if(!coalition)return 0;
 const side=coalitionSide(coalition,owner),allies=coalition.sides[side].filter(id=>id!==owner);
 const nearby=new Set([target,...(countyGraph[target]||[])]);
 return Math.min(16,armies.filter(a=>allies.includes(a.owner)&&nearby.has(a.county)).reduce((sum,a)=>sum+a.strength,0)*.22);
}
const priorCoalitionLocalPower=localArmyPower;
localArmyPower=function(owner,target,attacking){
 const base=priorCoalitionLocalPower(owner,target,attacking);
 return Math.min(2.5,base+coalitionArmySupport(owner,target)/50);
};
const priorCoalitionFront=renderNationalFront;
renderNationalFront=function(){
 priorCoalitionFront();
 const own=countries[humanId];if(!own||gameMode!=='player'||frontSection.hidden)return;
 // A one-on-one war is already shown in WAR FRONTS. Only show this separate
 // coalition command when allied belligerents or callable partners exist.
 const joined=coalitionFor(humanId).filter(w=>{
  const side=coalitionSide(w,humanId);
  return w.sides[side].length>1||w.sides[1-side].length>1||(side===0&&partnerIds(w.leaders[0]).some(id=>coalitionSide(w,id)===-1));
 });if(!joined.length)return;
 const wrap=document.createElement('section');wrap.className='coalition-card';
 wrap.innerHTML='<div class="quick-section-title">COALITION WARFARE</div>'+joined.map(c=>{
  const side=coalitionSide(c,humanId),friendly=c.sides[side],enemy=c.sides[1-side];
  const friendDiv=coalitionDivisionCount(friendly),enemyDiv=coalitionDivisionCount(enemy);
  const friendlyPower=coalitionStrength(friendly),enemyPower=coalitionStrength(enemy);
  const percent=Math.round(100*friendlyPower/Math.max(1,friendlyPower+enemyPower));
  const eligible=side===0?partnerIds(c.leaders[0]).filter(id=>coalitionSide(c,id)===-1):[];
  const contributions=friendly.reduce((sum,id)=>sum+(c.contributions?.[id]||0),0);
  const ownShare=contributions?Math.round(100*(c.contributions?.[humanId]||0)/contributions):0;
  return '<div class="coalition-front"><b>'+friendly.map(id=>countries[id].name).join(' + ')+'</b><small>VS '+enemy.map(id=>countries[id].name).join(' + ')+'</small><div class="coalition-track"><i style="width:'+percent+'%"></i></div><small>'+percent+' / '+(100-percent)+' strength · '+friendDiv+' allied divisions vs '+enemyDiv+' enemy divisions · your contribution '+ownShare+'%</small>'+(eligible.length?'<div class="coalition-call">'+eligible.map(id=>'<button data-call-war="'+c.id+':'+id+'">Call '+countries[id].name+'</button>').join('')+'</div>':'')+'</div>';
 }).join('');
 frontSection.prepend(wrap);
 wrap.querySelectorAll('[data-call-war]').forEach(button=>button.onclick=()=>{
  const [warId,allyId]=button.dataset.callWar.split(':').map(Number),c=coalitionWars.get(warId);
  if(!c)return;
  const ok=requestWarSupport(c,allyId,0);
  actionNotice=ok?countries[allyId].name+' joins your coalition.':countries[allyId].name+' refuses the call to arms.';
  update();renderNationalFront();
 });
};
const priorCoalitionUpdate=update;
update=function(){priorCoalitionUpdate();};
document.querySelector('.play-guide')?.insertAdjacentHTML('beforeend','<p><b>Alliances:</b> Defense allies usually enter wars automatically. When you attack, use Military → Coalition warfare to call allies to arms. Allies fight with their own divisions. Coalition wars finish together when the original war ends.</p>');
