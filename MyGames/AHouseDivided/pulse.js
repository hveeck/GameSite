/* Readable campaign pacing: rare cabinet interruptions, meaningful alerts,
   a stable national health bar, and a mix of setbacks and opportunities. */
nationalEvents.push(
 {name:'Unexpected investment boom',condition:c=>!enemies(c.id).length,description:'Regional businesses report a surge in investment. Your government must decide how to use this opportunity.',options:[
  ['Build an industrial corridor','Treasury −20, economy +6%',c=>{c.treasury-=20;c.baseEconomyFactor+=.06}],
  ['Let private investment flourish','Economy +4%, stability +2',c=>{c.baseEconomyFactor+=.04;c.stability+=2}],
  ['Use the windfall for public works','Treasury +20, stability +4',c=>{c.treasury+=20;c.stability+=4}]],tone:'positive'},
 {name:'Exceptional harvest',condition:c=>countryStats(c).resources>1,description:'Agricultural regions enjoy a productive season and food prices are falling.',options:[
  ['Export the surplus','Treasury +35, stability +1',c=>{c.treasury+=35;c.stability+=1}],
  ['Support low-cost food at home','Stability +8, treasury +8',c=>{c.stability+=8;c.treasury+=8}],
  ['Stockpile for emergencies','Strength +6, stability +4',c=>{c.readiness+=6;c.stability+=4}]],tone:'positive'},
 {name:'Diplomatic opening',condition:c=>!enemies(c.id).length,description:'Neighboring governments signal an opportunity for regional cooperation and commerce.',options:[
  ['Open commercial negotiations','Treasury +25, economy +3%',c=>{c.treasury+=25;c.baseEconomyFactor+=.03}],
  ['Host a regional summit','Stability +6, diplomacy improves',c=>{c.stability+=6;c.diplomacy=clamp(c.diplomacy+.05,0,1)}],
  ['Concentrate on domestic growth','Economy +4%, strength +2',c=>{c.baseEconomyFactor+=.04;c.readiness+=2}]],tone:'positive'},
 {name:'National technological breakthrough',condition:c=>c.baseEconomyFactor>.7,description:'Engineers have developed a promising new production process with civilian and military applications.',options:[
  ['Commercialize the discovery','Economy +7%, treasury +10',c=>{c.baseEconomyFactor+=.07;c.treasury+=10}],
  ['Prioritize military logistics','Strength +10, economy +2%',c=>{c.readiness+=10;c.baseEconomyFactor+=.02}],
  ['Expand research institutes','Economy +5%, stability +3',c=>{c.baseEconomyFactor+=.05;c.stability+=3}]],tone:'positive'},
 {name:'Cross-regional unity movement',condition:c=>countryStats(c).holdings.length>=15,description:'Civic organizations in different regions have begun cooperating across old political divides.',options:[
  ['Sponsor a unity convention','Stability +10, treasury −12',c=>{c.stability+=10;c.treasury-=12}],
  ['Provide federal grants','Stability +7, treasury −5',c=>{c.stability+=7;c.treasury-=5}],
  ['Keep government at arm’s length','Stability +4, treasury +10',c=>{c.stability+=4;c.treasury+=10}]],tone:'positive'},
 {name:'Returning families and skilled workers',condition:c=>!enemies(c.id).length,description:'People displaced by earlier fighting are returning home, bringing skills and new businesses.',options:[
  ['Invest in resettlement','Treasury −15, population +0.5%, stability +4',c=>{c.treasury-=15;for(const t of countryStats(c).holdings)t.p*=1.005;c.stability+=4}],
  ['Prioritize business permits','Economy +5%, population +0.2%',c=>{c.baseEconomyFactor+=.05;for(const t of countryStats(c).holdings)t.p*=1.002}],
  ['Expand local services','Stability +8, economy +1%',c=>{c.stability+=8;c.baseEconomyFactor+=.01}]],tone:'positive'},
 {name:'Foreign capital inflow',condition:c=>c.stability>45,description:'Outside investors consider your country one of the more promising economies on the continent.',options:[
  ['Welcome outside financing','Treasury +40, economy +2%',c=>{c.treasury+=40;c.baseEconomyFactor+=.02}],
  ['Create domestic investment funds','Treasury +20, economy +4%',c=>{c.treasury+=20;c.baseEconomyFactor+=.04}],
  ['Target defense industries','Treasury +15, strength +6',c=>{c.treasury+=15;c.readiness+=6}]],tone:'positive'},
 {name:'Volunteer mobilization',condition:c=>enemies(c.id).length>0,description:'A wave of volunteers offers to support the war effort and aid displaced families.',options:[
  ['Train additional volunteers','Strength +10, stability +2',c=>{c.readiness+=10;c.stability+=2}],
  ['Direct volunteers toward relief','Stability +9, exhaustion −5',c=>{c.stability+=9;c.warExhaustion-=5}],
  ['Create civilian reconstruction teams','Economy +3%, stability +5',c=>{c.baseEconomyFactor+=.03;c.stability+=5}]],tone:'positive'}
);

const nationalHealth=document.createElement('div');nationalHealth.className='national-health';nationalHealth.hidden=true;
nationalHealth.innerHTML='<div class="national-health-label"><span>COUNTRY HEALTH</span><strong id="healthValue">—</strong></div><div class="health-track"><i id="healthFill"></i></div><div id="healthNote" class="health-note">Government resilience</div>';
document.querySelector('.war-bottom')?.append(nationalHealth);
function healthScore(c){
 const s=countryStats(c),territory=s.holdings.length/Math.max(1,c.initialCount||s.holdings.length);
 const armyStrength=ownedArmies(c.id).reduce((sum,a)=>sum+a.strength,0);
 const economy=Math.min(1,s.economy/Math.max(.5,(c.initialPower||s.power)*.35));
 const military=Math.min(1,armyStrength/Math.max(12,s.pop*.8+10));
 let health=100*(.42*clamp(c.stability/90,0,1)+.26*clamp(territory,0,1)+.17*economy+.15*military);
 if(territory<=.05||c.surrendered)health=Math.min(health,7);
 if(c.stability<=8)health=Math.min(health,15);
 if(s.economy<.15)health=Math.min(health,12);
 if(!armyStrength&&c.readiness<=10&&c.treasury<25)health=Math.min(health,12);
 return Math.round(clamp(health,0,100));
}
function renderNationalHealth(){
 const c=countries[humanId];nationalHealth.hidden=gameMode!=='player'||!c;
 if(nationalHealth.hidden)return;
 const v=healthScore(c),status=v>=75?'Resilient':v>=50?'Stable':v>=30?'Under strain':v>=15?'Severe crisis':'Near collapse';
 $('healthValue').textContent=v+'/100 · '+status;$('healthFill').style.width=v+'%';
 $('healthFill').style.background=v>=70?'#8dbb8f':v>=40?'#dfbb6e':'#df7771';
 $('healthNote').textContent='Stability, territory, economy and fighting strength';
 nationalHealth.title='A resilience indicator, not an exact surrender percentage. Collapse depends on extreme territorial loss, economic failure, or sustained instability.';
}

const importantNotices=[];let noticeOpen=false;
const importantOverlay=document.createElement('div');importantOverlay.className='important-overlay';importantOverlay.hidden=true;
importantOverlay.innerHTML='<div class="important-dialog"><small id="noticeType">IMPORTANT DEVELOPMENT</small><h2 id="noticeTitle"></h2><p id="noticeBody"></p><div><button id="noticePause">Stay paused</button><button id="noticeContinue">Continue simulation ▶</button></div></div>';
document.body.append(importantOverlay);
function deliverNotice(){
 if(noticeOpen||agencyPending||!importantNotices.length)return;
 const notice=importantNotices.shift();noticeOpen=true;stop();importantOverlay.hidden=false;
 $('noticeType').textContent=notice.type;$('noticeTitle').textContent=notice.title;$('noticeBody').textContent=notice.body;
}
function queueNotice(type,title,body){
 if(gameMode!=='player'||humanId===null)return;
 if(importantNotices.some(n=>n.title===title))return;
 importantNotices.push({type,title,body});if(importantNotices.length>4)importantNotices.shift();
 deliverNotice();
}
function closeNotice(resume){importantOverlay.hidden=true;noticeOpen=false;
 if(importantNotices.length){deliverNotice();return}
 if(resume&&!agencyPending)start();
}
$('noticePause').onclick=()=>closeNotice(false);
$('noticeContinue').onclick=()=>closeNotice(true);
const underlyingPulseLog=log;
log=function(message,type=''){
 underlyingPulseLog(message,type);
 if(gameMode!=='player'||humanId===null)return;
 const own=countries[humanId];if(!own)return;
 const marker=' declares war on '+own.name+'.';
 if(message.includes(marker)&&!message.startsWith(own.name+' declares war')){
  const invader=message.split(' declares war on ')[0];
  queueNotice('INVASION ALERT','Your country is under attack',invader+' has declared war on '+own.name+'. Your generals are responding. Consider mobilizing, seeking allies, or negotiating peace.');
 }
};
const underlyingCapitulation=capitulate;
capitulate=function(c){const foe=gameMode==='player'&&humanId!==null&&c.id!==humanId&&atWar(c.id,humanId);const wasOurs=c.id===humanId;
 const result=underlyingCapitulation(c);
 if(result&&foe)queueNotice('WAR CONCLUDED',c.name+' has capitulated','The government of '+c.name+' has collapsed. Its remaining territory is being transferred to neighboring and conquering factions.');
 if(result&&wasOurs)queueNotice('GOVERNMENT COLLAPSE','Your country has capitulated','Your government no longer controls a viable state. You can continue observing the continental struggle.');
 return result;
};

let historyExpanded=false;
const underlyingPulseStory=renderCampaignStory;
renderCampaignStory=function(){underlyingPulseStory();const story=commandBrief.querySelector('.campaign-story');if(!story)return;
 const label=story.previousElementSibling;if(label?.classList.contains('quick-section-title'))label.hidden=true;
 const details=document.createElement('details');details.className='campaign-history-details';details.open=historyExpanded;
 const summary=document.createElement('summary');summary.textContent='Campaign history & consequences';
 story.before(details);details.append(summary,story);details.ontoggle=()=>{historyExpanded=details.open};
};
const underlyingPulseUpdate=update;
update=function(){underlyingPulseUpdate();renderNationalHealth();if(!noticeOpen)deliverNotice()};
const underlyingPulseGenerate=generate;
generate=function(reuse=false){importantNotices.length=0;noticeOpen=false;importantOverlay.hidden=true;historyExpanded=false;underlyingPulseGenerate(reuse)};
renderNationalHealth();
