/* A House Divided: readable campaign essentials and compact clock controls. */
document.title='A House Divided';
document.querySelector('.brand h1').innerHTML='A HOUSE <em>DIVIDED</em>';
document.querySelector('.brand small').textContent='Balkanized America c. 2030';
document.querySelector('.fiction')?.remove();

// Keep play/pause and one-step advancement directly available. Detailed clock
// choices live behind one settings toggle; their original event handlers remain.
const dock=document.querySelector('.war-bottom');
const timing=document.querySelector('.temporal-controls');
const clockOptions=document.createElement('div');
clockOptions.className='clock-options';clockOptions.hidden=true;
clockOptions.id='clockOptions';
const clockToggle=document.createElement('button');
clockToggle.type='button';clockToggle.id='clockOptionsToggle';
clockToggle.className='clock-options-toggle';clockToggle.textContent='⚙ Time';
clockToggle.setAttribute('aria-expanded','false');
clockToggle.setAttribute('aria-controls','clockOptions');
clockToggle.onclick=()=>{
 clockOptions.hidden=!clockOptions.hidden;
 clockToggle.setAttribute('aria-expanded',String(!clockOptions.hidden));
};
clockOptions.append(timing);
dock.querySelector('.runrow').after(clockToggle,clockOptions);
document.addEventListener('keydown',ev=>{
 if(ev.key==='Escape'&&!clockOptions.hidden){clockOptions.hidden=true;clockToggle.setAttribute('aria-expanded','false')}
});

const financialHUD=document.createElement('div');
financialHUD.className='finance-hud';financialHUD.hidden=true;
financialHUD.setAttribute('aria-label','Your country at a glance');
financialHUD.innerHTML='<div><span>TREASURY</span><strong id="hudTreasury">—</strong></div><div><span>MONTHLY BALANCE</span><strong id="hudBalance">—</strong></div><div><span>STABILITY</span><strong id="hudStability">—</strong></div><div><span>STRENGTH</span><strong id="hudStrength">—</strong></div>';
document.querySelector('header .topright').prepend(financialHUD);
function refreshFinances(){
 const c=typeof humanId==='number'?countries[humanId]:null;
 const visible=gameMode==='player'&&c&&countryStats(c).holdings.length>0;
 financialHUD.hidden=!visible;
 if(!visible)return;
 const balance=typeof recurringLedger==='function'?recurringLedger(c).net:0;
 const balanced=(balance>=0?'+':'')+balance.toFixed(1);
 document.getElementById('hudTreasury').textContent=Math.floor(c.treasury).toLocaleString();
 document.getElementById('hudBalance').textContent=balanced;
 document.getElementById('hudBalance').classList.toggle('negative',balance<0);
 document.getElementById('hudStability').textContent=Math.round(c.stability)+'/100';
 document.getElementById('hudStrength').textContent=Math.round(c.readiness)+'/100';
}
const priorClarityUpdate=update;
update=function(){priorClarityUpdate();refreshFinances()};
const priorClarityGenerate=generate;
generate=function(reuse=false){priorClarityGenerate(reuse);refreshFinances()};
refreshFinances();

// Teach the actual control loop, not just the fictional setting.
const helpModal=document.querySelector('#help .modal');
const helpTitle=helpModal.querySelector('h2');
helpTitle.textContent='How to play A House Divided';
const oldIntro=helpModal.querySelector('.eyebrow');oldIntro.textContent='QUICK START & STRATEGY GUIDE';
const guidance=document.createElement('div');guidance.className='play-guide';
guidance.innerHTML=`
 <h3>Get started in one minute</h3>
 <ol>
 <li>Choose <b>Play / Command</b> to generate a new political map, then pick a country. Choose <b>Spectate / Simulate</b> if you want the AI to run everything.</li>
 <li>Press <b>▶ Run</b> to start history, or <b>Advance</b> to move one step. <b>⚙ Time</b> changes how many days pass and how often. You can pause whenever you want.</li>
 <li>Watch your territory grow on the map. Use <b>Command</b>, <b>Cabinet</b>, <b>Armies</b>, and <b>Intel</b> for national priorities, spending, war plans, and diplomacy.</li>
 </ol>
 <h3>What to watch</h3>
 <ul>
 <li><b>Treasury:</b> money available for national programs, military commitments, and diplomacy. Save a reserve before starting a war.</li>
 <li><b>Monthly balance:</b> an estimate of income minus recurring expenses. Positive means the treasury tends to recover; negative means spending is outpacing revenue.</li>
 <li><b>Stability:</b> the government’s political support and internal cohesion. Low stability makes setbacks more dangerous and can invite uprisings.</li>
 <li><b>Strength:</b> how well your armed forces can fight. More strength helps in war, but military spending can weigh on your budget.</li>
 <li><b>Country health:</b> the bar at the bottom combines stability, surviving territory, economy, and military strength. It is an early warning, not a literal surrender countdown.</li>
 </ul>
 <h3>A simple strategy that works</h3>
 <ol>
 <li><b>Stabilize first:</b> pick a national strategy in Command, keep the budget sustainable in Cabinet, and fund useful national initiatives.</li>
 <li><b>Choose your neighbors:</b> inspect nearby countries. Similar ideologies are often better diplomatic partners; allies help discourage attacks.</li>
 <li><b>Expand with a plan:</b> select a neighboring target in Armies and launch a national war plan. Your generals handle county-by-county fighting; you can change or cancel the plan.</li>
 <li><b>Consolidate gains:</b> absorbed territory can strain unity. Let your country recover, invest in integration, and avoid fighting everyone at once.</li>
 </ol>
 <p><b>No final victory screen:</b> the goal is simply to survive and claim as much territory as you can. Good decisions compound over time.</p>`;
helpTitle.after(guidance);
// Preserve the short model disclaimer below the practical help, but remove
// duplicated old mechanics instructions and the obsolete tip paragraph.
helpModal.querySelectorAll(':scope > p').forEach((p,i)=>{if(i===1||i===3)p.remove()});

// Panel hierarchy: one sentence describing each job, then an immediate status
// overview. Existing actions, detailed controls, and advanced options stay put.
function panelIntro(card,heading,message){
 const intro=document.createElement('div');intro.className='clarity-intro';
 intro.innerHTML='<b>'+heading+'</b><span>'+message+'</span>';
 card.querySelector('.section-head')?.after(intro);
}
const governmentCard=document.querySelector('.command.card');
panelIntro(governmentCard,'RUN YOUR COUNTRY','Set an overall strategy, manage spending, and invest in your country. The routine decisions can run automatically.');
const armyCard=document.querySelector('.army-panel');
panelIntro(armyCard,'DIRECT THE WAR','Assign divisions to each front, choose their stance, and let the General Staff find routes. Defending units hold the line.');
const diplomacyCard=document.querySelector('.inspector.card');
panelIntro(diplomacyCard,'DEAL WITH OTHER COUNTRIES','Click a country on the map to inspect its ideology, relationships and strength. If you are playing, use the actions below to negotiate or fight.');

document.querySelector('[data-open="command"]')?.setAttribute('title','Government · national strategy');
document.querySelector('[data-open="armies"]')?.setAttribute('title','Military · war plans');
document.querySelector('[data-open="intel"]')?.setAttribute('title','Diplomacy · country relations');
const existingMilitaryIntro=armyCard.querySelector(':scope > p');
if(existingMilitaryIntro)existingMilitaryIntro.hidden=true;

const warReport=document.createElement('section');warReport.className='war-report';
warReport.innerHTML='<h3>ACTIVE WARS <small>Estimated balance of forces</small></h3><div class="war-report-list"></div>';
armyCard.querySelector('.national-front')?.before(warReport);
const worldWarReport=document.createElement('section');worldWarReport.className='war-report world-wars';
worldWarReport.innerHTML='<h3>WHO IS WINNING? <small>All active wars</small></h3><div class="war-report-list"></div>';
document.querySelector('[data-panel="world"] .stats')?.after(worldWarReport);

function warSideStrength(c){
 const s=countryStats(c);
 const troops=typeof ownedArmies==='function'?ownedArmies(c.id).reduce((sum,a)=>sum+a.strength,0):0;
 return Math.max(.1,s.power*.35+troops*(.65+c.readiness/130)+s.economy*.05);
}
function warLines(playerOnly){
 const active=wars.filter(([a,b])=>countries[a]?.alive!==false&&countries[b]?.alive!==false&&countryStats(countries[a]).holdings.length&&countryStats(countries[b]).holdings.length)
  .filter(([a,b])=>!playerOnly||a===humanId||b===humanId);
 if(!active.length)return '<p class="war-empty">'+(playerOnly?'You are not at war.':'There are no active wars.')+'</p>';
 return active.slice(0,playerOnly?8:14).map(([a,b])=>{
  const A=countries[a],B=countries[b];
  const strengthA=warSideStrength(A),strengthB=warSideStrength(B);
  const percentA=Math.round(Math.max(10,Math.min(90,100*strengthA/(strengthA+strengthB))));
  const player=a===humanId||b===humanId;
  const lead=percentA>=55?A.name:percentA<=45?B.name:'Evenly matched';
  return '<div class="war-match '+(player?'your-war':'')+'"><div class="war-match-head"><b>'+A.name+'</b><strong>'+percentA+' / '+(100-percentA)+'</strong><b>'+B.name+'</b></div><div class="war-match-track"><i style="width:'+percentA+'%;background:'+A.color+'"></i><i style="width:'+(100-percentA)+'%;background:'+B.color+'"></i></div><small>'+(lead==='Evenly matched'?'Evenly matched':lead+' has the advantage')+'</small></div>';
 }).join('')+(active.length>(playerOnly?8:14)?'<p class="war-empty">+'+(active.length-(playerOnly?8:14))+' more wars</p>':'');
}
let lastWarReport=0;
function refreshWarReport(force=false){
 if(!force&&Date.now()-lastWarReport<550)return;
 lastWarReport=Date.now();
 const player=gameMode==='player'&&humanId!==null;
 warReport.hidden=!player;
 if(player)warReport.querySelector('.war-report-list').innerHTML=warLines(true);
 worldWarReport.querySelector('.war-report-list').innerHTML=warLines(false);
}
const priorWarUpdate=update;
update=function(){priorWarUpdate();refreshWarReport()};
refreshWarReport(true);

// Make balancing a budget a deliberate, understandable central decision.
const priorFiscalCabinet=renderCabinet;
renderCabinet=function(force=false){
 priorFiscalCabinet(force);
 const body=document.getElementById('cabinetBody');
 const c=typeof humanId==='number'?countries[humanId]:null;
 if(!body||gameMode!=='player'||!c)return;
 const net=revenueEstimate(c)-budgetExpense(c)-(c.nationalAgenda==='recovery'?1.25:0);
 const box=document.createElement('section');box.className='fiscal-action';
 box.innerHTML='<div><strong>MONTHLY BUDGET</strong><span class="'+(net<0?'negative':'')+'">'+(net>=0?'+':'')+net.toFixed(1)+' treasury / month</span></div><p>Adjust your four departmental spending levels from 0–5. This is the recurring net, before one-time purchases, peace payments, and events.</p>';
 body.prepend(box);
};
