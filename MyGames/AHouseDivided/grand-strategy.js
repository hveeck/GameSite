/* Diplomacy remains compact on screen; depth lives in strategic decisions. */
const allianceCooldown=new Map();
function strategicCountry(c){
 if(c.reputation===undefined)c.reputation=55;
 if(c.threat===undefined)c.threat=0;
 if(c.offensiveWars===undefined)c.offensiveWars=0;
 if(c.offensiveCaptures===undefined)c.offensiveCaptures=0;
 if(c.personality===undefined){
  const styles=['expansionist','defensive','diplomatic','opportunist'];
  c.personality=styles[Math.abs((c.id*13+Math.round(c.aggression*17)+Math.round(c.diplomacy*11))%styles.length)];
 }
 return c;
}
// Defenders form an anti-player military bloc only after repeated, successful
// expansion. Declarations alone are not enough to trigger the early coalition.
function humanContainmentAlarm(){
 if(gameMode!=='player'||humanId===undefined||!countries[humanId])return true;
 const c=strategicCountry(countries[humanId]);
 return (c.offensiveWars>=2&&c.offensiveCaptures>=8) ||
        (c.offensiveWars>=3&&c.offensiveCaptures>=5);
}
// AI defensive blocs in Play mode require a credible, stronger human threat.
// Each participant must be weaker on its own; shared suspicion is earned by conquest.
function containmentFear(candidate,aggressor){
 if(!candidate||!aggressor||candidate.id===aggressor.id)return false;
 if(gameMode==='player'&&aggressor.id===humanId&&!humanContainmentAlarm())return false;
 const own=countryStats(candidate),enemy=countryStats(aggressor);
 if(!own.holdings.length||!enemy.holdings.length||own.power>=enemy.power*.88)return false;
 if(alliance(candidate.id,aggressor.id)||hasNonAggression(candidate.id,aggressor.id))return false;
 const proximity=bordering(candidate.id,aggressor.id)||enemies(candidate.id).includes(aggressor.id);
 const suspicion=(aggressor.threat||0)>=36&&(aggressor.reputation||55)<=48;
 return proximity&&suspicion;
}
function containmentPair(a,b,aggressor){
 return a&&b&&a.id!==b.id&&containmentFear(a,aggressor)&&containmentFear(b,aggressor)&&
  !atWar(a.id,b.id)&&!alliance(a.id,b.id)&&partnerIds(a.id).length<2&&partnerIds(b.id).length<2;
}
function leaderPersonality(c){
 strategicCountry(c);
 return ({expansionist:{attack:1.3,ally:.9},defensive:{attack:.68,ally:1.13},diplomatic:{attack:.55,ally:1.35},opportunist:{attack:1.05,ally:1}})[c.personality];
}
function commonThreat(a,b){
 const common=validCountries().filter(c=>c.id!==a.id&&c.id!==b.id&&
  (bordering(a.id,c.id)||bordering(b.id,c.id))&&
  (c.threat||0)>25 && (countryStats(c).power>countryStats(a).power*.6||countryStats(c).power>countryStats(b).power*.6));
 return Math.max(0,...common.map(c=>c.threat||0));
}
function allianceAcceptance(a,b){
 strategicCountry(a);strategicCountry(b);
 if(a.id===b.id||alliance(a.id,b.id)||atWar(a.id,b.id)||hasNonAggression(a.id,b.id))return 0;
 const key=pactKey(a.id,b.id),fit=ideologyAffinity(a,b),relations=relationRating(a,b);
 const danger=commonThreat(a,b),possible=relations>=65||danger>=65;
 if(gameMode==='player'&&a.id!==humanId&&b.id!==humanId){
  const player=countries[humanId];
  if(!player||!containmentPair(a,b,player))return 0;
 }
 if(!possible||partnerIds(a.id).length>=3||partnerIds(b.id).length>=3||(allianceCooldown.get(key)||0)>daysElapsed)return 0;
 const otherAllies=partnerIds(a.id).length+partnerIds(b.id).length;
 const result=.07+(relations-65)*.012+(fit-.5)*.30+(danger/100)*.36+
  (Math.min(a.reputation,b.reputation)-50)*.003-otherAllies*.12+
  (bordering(a.id,b.id)?.06:0)+(leaderPersonality(a).ally+leaderPersonality(b).ally-2)*.08;
 return clamp(result,.025,.82);
}
function signStrategicAlliance(a,b){
 pacts.push([a.id,b.id]);treatyTerms.set(pactKey(a.id,b.id),{expires:daysElapsed+365*5});
 log(a.name+' and '+b.name+' sign a five-year defense alliance.','peace');
}
function damageReputation(c,amount){strategicCountry(c);c.reputation=clamp(c.reputation-amount,0,100)}
const priorStrategicWar=war;
war=function(a,b){
 const existed=atWar(a,b),out=priorStrategicWar(a,b);
 if(!existed&&atWar(a,b)){
  const aggressor=strategicCountry(countries[a]);aggressor.threat=clamp(aggressor.threat+13,0,100);
  damageReputation(aggressor,7);
  if(gameMode==='player'&&a===humanId&&b!==humanId)aggressor.offensiveWars++;
 }
 return out;
};
const priorStrategicBreak=cancelPact;
cancelPact=function(other){
 const c=countries[humanId],key=pactKey(humanId,other.id),term=treatyTerms.get(key);
 priorStrategicBreak(other);allianceCooldown.set(key,daysElapsed+365*2);
 if(term&&term.expires>daysElapsed){damageReputation(c,19);c.stability=clamp(c.stability-3,5,99);actionNotice='Alliance broken. Reputation −19; stability −3.'}
};
// Track land taken by each participant. This influences settlements and coalition credit.
function recordWarCapture(atk,def,t){
 t.recentlyCapturedFrom=def;
 t.captureDay=daysElapsed;
 const coalition=coalitionFor(atk).find(c=>coalitionSide(c,atk)!==-1&&coalitionSide(c,def)!==-1&&coalitionSide(c,atk)!==coalitionSide(c,def));
 if(coalition)coalition.contributions[atk]=(coalition.contributions[atk]||0)+Math.max(.25,t.p*1.4+t.e*.35);
 const c=strategicCountry(countries[atk]);
 c.threat=clamp(c.threat+Math.min(1.1,.18+t.p*.32),0,100);
 if(gameMode==='player'&&atk===humanId)c.offensiveCaptures++;
}
function shouldSettleWar(a,b,annual,days){
 const A=countries[a],B=countries[b],ca=coalitionOf(a,b);
 // A war can run its course, but heavy fatigue makes a negotiated end likely.
 const fatigue=Math.max(A.warExhaustion||0,B.warExhaustion||0);
 const elapsed=ca?daysElapsed-ca.started:365;
 const adjusted=annual*(elapsed<150?.15:1)+Math.max(0,fatigue-45)*.018;
 return chance(clamp(adjusted,0,.85),days);
}
function settleWar(a,b){
 const A=countries[a],B=countries[b],c=coalitionOf(a,b);
 const participants=c?[...new Set(c.sides.flat())]:[a,b];
 const fatigue=(A.warExhaustion||0)+(B.warExhaustion||0);
 let recovered=0;
 if(c){
  // Even legacy/automatic settlements cannot silently annex occupied land.
  for(const [id,owner] of c.startOwners){
   const t=territories[id];
   if(t&&t.owner!==owner&&coalitionSide(c,owner)!==-1&&coalitionSide(c,t.owner)!==-1&&coalitionSide(c,owner)!==coalitionSide(c,t.owner)&&countries[owner]&&!countries[owner].surrendered){t.owner=owner;recovered++}
  }
 }
 const white=recovered>0;
 if(c&&!white){
  const strength0=c.sides[0].reduce((n,id)=>n+(c.contributions[id]||0),0);
  const strength1=c.sides[1].reduce((n,id)=>n+(c.contributions[id]||0),0);
  const winnerSide=strength0===strength1?-1:strength0>strength1?0:1;
  if(winnerSide!==-1){
   const winners=c.sides[winnerSide],losers=c.sides[1-winnerSide];
   const pool=Math.min(24,losers.reduce((n,id)=>n+Math.max(0,countries[id].treasury||0),0)*.045);
   const weight=winners.reduce((n,id)=>n+(c.contributions[id]||0),0)||1;
   for(const id of losers){const loss=pool*Math.max(0,countries[id].treasury||0)/Math.max(.01,losers.reduce((n,x)=>n+Math.max(0,countries[x].treasury||0),0));countries[id].treasury=Math.max(0,countries[id].treasury-loss)}
   for(const id of winners)countries[id].treasury=(countries[id].treasury||0)+pool*(c.contributions[id]||0)/weight;
  }
 }
 if(c)endCoalition(c,'settlement');
 const key=pactKey(a,b);
 wars=wars.filter(w=>pactKey(w[0],w[1])!==key);
 for(const id of participants)if(countries[id])countries[id].warExhaustion=Math.max(0,(countries[id].warExhaustion||0)-12);
 invalidate();
 log(A.name+' and '+B.name+' sign peace; '+recovered+' occupied counties are restored to their prewar owners.','peace');
 if(gameMode==='player'&&participants.includes(humanId))queueNotice('PEACE AGREEMENT',A.name+' – '+B.name,'Wartime occupations end and prewar borders are restored.');
}
// Threat can bring together otherwise unlikely partners against a common conqueror.
let lastContainmentAttempt=0;
function strategicDiplomacyTick(days){
 if(!days)return;
 for(const c of validCountries()){
  strategicCountry(c);
  c.threat=Math.max(0,c.threat-days/365*2.7);
  c.reputation=clamp(c.reputation+(50-c.reputation)*days/365*.035,0,100);
 }
 if(daysElapsed-lastContainmentAttempt<91)return;
 lastContainmentAttempt=daysElapsed;
 if(!$('alliances').checked)return;
 const threats=validCountries().filter(c=>(c.threat||0)>42&&
  !(gameMode==='player'&&c.id===humanId&&!humanContainmentAlarm())).sort((a,b)=>b.threat-a.threat);
 for(const aggressor of threats.slice(0,2)){
  // A containment bloc is an alliance of *smaller* worried countries,
  // not a superpower recruiting allies to dogpile the human player.
  const worried=validCountries().filter(c=>containmentFear(c,aggressor));
  if(worried.length<2)continue;
  const threatenedWar=coalitionFor(aggressor.id).find(c=>coalitionSide(c,aggressor.id)!==-1);
  if(threatenedWar){
   const opposite=1-coalitionSide(threatenedWar,aggressor.id);
   const lead=threatenedWar.leaders[opposite];
   const eligible=worried.filter(c=>coalitionSide(threatenedWar,c.id)===-1&&c.id!==lead&&
     !enemies(c.id).some(id=>id!==aggressor.id));
   // Reinforcement only after a *group* of minor powers is truly alarmed.
   for(const candidate of eligible.slice(0,2)){
    if(!worried.some(other=>other.id!==candidate.id&&
        (alliance(candidate.id,other.id)||other.id===lead)))continue;
    const odds=clamp((aggressor.threat-40)/260+.06,0,.24);
    if(rand()<odds&&attachCoalition(threatenedWar,candidate.id,opposite,true)){
     log(candidate.name+' joins a containment coalition against '+aggressor.name+'.','warlog');
     break;
    }
   }
  }else{
   // Form an actual defensive bloc among smaller threatened neighbors first;
   // never conjure a bilateral pact just for liking another country.
   const pairs=[];
   for(let i=0;i<worried.length;i++)for(let j=i+1;j<worried.length;j++){
    const a=worried[i],b=worried[j];
    if(containmentPair(a,b,aggressor))pairs.push({a,b,score:relationRating(a,b)+
      (bordering(a.id,b.id)?18:0)});
   }
   pairs.sort((a,b)=>b.score-a.score);
   if(pairs.length&&rand()<.32){
    const {a,b}=pairs[0];
    signStrategicAlliance(a,b);
    log(a.name+' and '+b.name+' form a defensive bloc, fearing '+aggressor.name+'’s expansion.','peace');
   }
  }
 }
}
const beforeStrategicTick=simulatePeriod;
simulatePeriod=function(){
 const day=daysElapsed;beforeStrategicTick();strategicDiplomacyTick(daysElapsed-day);
};
tick=simulatePeriod;
const beforeStrategicGenerate=generate;
generate=function(reuse=false){allianceCooldown.clear();lastContainmentAttempt=0;beforeStrategicGenerate(reuse);for(const c of countries)strategicCountry(c)};
// No extra dashboard: only a short note when the player actually inspects relations.
const beforeStrategicRender=renderBilateral;
renderBilateral=function(){
 beforeStrategicRender();
 const a=countries[humanId],b=diplomacyTarget();
 if(!a||!b||a.id===b.id||relations.hidden)return;
 const action=relations.querySelector('[data-diplomacy="ally"]');
 if(action){const odds=allianceAcceptance(a,b);action.title=odds?'Estimated alliance acceptance: '+Math.round(odds*100)+'%. Five-year defense commitment.':'Requires 65 relations (or shared existential threat); max three allies.';}
};
