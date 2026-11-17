/* v2.0.2: Sustainable national military development in peace and war.
 * A modest monthly routine complements (rather than replaces) the wartime AI.
 */
(function(){
 'use strict';
 const previousAdvanceCabinet=advanceCabinet;
 const difficultyCaps={easy:9,medium:16,hard:24};
 function developmentTarget(c){
  const posture=militaryPosture(c);
  const difficulty=typeof aiChallenge==='undefined'?'medium':aiChallenge;
  const atRisk=enemies(c.id).length>0;
  // Seek a balanced force, not an oversized military state. Wars permit a
  // modest higher ceiling, but financial viability still controls growth.
  const desiredRatio=atRisk?.98:.83;
  const expectedStrength=atRisk?10:10.5;
  const byPosture=Math.ceil(posture.capacity*desiredRatio*12/expectedStrength);
  const ceiling=difficultyCaps[difficulty]+(atRisk?3:0);
  return Math.max(2,Math.min(ceiling,byPosture));
 }
 function develop(c){
  if(typeof countries==='undefined'||!c||!countryStats(c).holdings.length)return false;
  const forces=ownedArmies(c.id),war=enemies(c.id).length>0;
  const posture=militaryPosture(c),target=developmentTarget(c);
  if(forces.length>=target||posture.ratio>=(war?.99:.79))return false;
  const ledger=recurringLedger(c);
  // Avoid unaffordable buildup; ordinary AI already performs emergency
  // recruitment during invasions if a country needs to risk a deficit.
  if(!war&&ledger.net<-.5)return false;
  const homeland=coreRecruitCounties(c.id);
  if(!homeland.length)return false;
  const difficulty=typeof aiChallenge==='undefined'?'medium':aiChallenge;
  let quality='militia';
  if(posture.ratio>.54&&c.treasury>countryDivisionRecruitPrice(c,'elite')*3&&Math.random()<(difficulty==='hard'?.31:.18))quality='elite';
  let assessment=aiMilitaryRecruitmentCapacity(c,quality,false);
  if(!assessment.affordable&&quality==='elite'){
   quality='militia';assessment=aiMilitaryRecruitmentCapacity(c,quality,false);
  }
  if(!assessment.affordable)return false;
  // Prefer a friendly county near a currently threatened border, or a home
  // recruiting center in peacetime; never spawn in occupied counties.
  let location=homeland[0];
  if(war){
   const borders=homeland.filter(t=>(countyGraph[t.i]||[]).some(j=>atWar(c.id,territories[j]?.owner)));
   if(borders.length)location=borders[Math.floor(Math.random()*borders.length)];
  } else {
   location=homeland[Math.floor(Math.random()*homeland.length)];
  }
  const countBefore=forces.length;
  const army=createArmy(c.id,location.i,divisionStartStrength(quality),quality,true);
  if(!army||ownedArmies(c.id).length!==countBefore+1)return false;
  c.treasury-=assessment.price;
  return true;
 }
 advanceCabinet=function(days){
  previousAdvanceCabinet(days);
  if(!(days>0)||!geomReady||gameMode!=='player')return;
  for(const c of validCountries()){
   if(c.id===humanId)continue;
   if(!Number.isFinite(c.nextForceDevelopmentDay))c.nextForceDevelopmentDay=daysElapsed+30;
   if(daysElapsed<c.nextForceDevelopmentDay)continue;
   // One division per 35–55 game days maximum: sustained buildup rather
   // than an unrealistic emergency army appearing during peacetime.
   const difficulty=typeof aiChallenge==='undefined'?'medium':aiChallenge;
   c.nextForceDevelopmentDay=daysElapsed+(difficulty==='hard'?35:difficulty==='easy'?55:45);
   develop(c);
  }
 };
 window.houseDividedForceDevelopment={develop,developmentTarget};
})();
