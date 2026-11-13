/* Compact command interface, persistent controls, and readable war information. */
let aiChallenge='medium';
let selectedRecruitQuality='militia';
const challengePicker=document.createElement('label');
challengePicker.className='challenge-picker';
challengePicker.innerHTML='CAMPAIGN DIFFICULTY <select id="aiChallenge"><option value="easy">Easy · affordable armies, forgiving government</option><option value="medium" selected>Medium · balanced challenge</option><option value="hard">Hard · costly armies, tougher economy and AI</option></select>';
choiceOverlay.querySelector('.choice-buttons')?.after(challengePicker);
challengePicker.querySelector('select').onchange=e=>{aiChallenge=e.target.value};
choiceOverlay.querySelector('#enterWorld').addEventListener('click',()=>{
 if(gameMode!=='player'||humanId===null)return;
 const c=countries[humanId];if(!c||!countryStats(c).holdings.length)return;
 const adjustment=aiChallenge==='easy'?{cash:75,stability:18,readiness:17}:aiChallenge==='hard'?{cash:-35,stability:-12,readiness:-12}:{cash:0,stability:0,readiness:0};
 c.treasury=Math.max(0,(c.treasury||0)+adjustment.cash);
 c.stability=clamp(c.stability+adjustment.stability,5,99);
 c.readiness=clamp(c.readiness+adjustment.readiness,5,100);
 update();
});

function relationRating(a,b){
 if(!a||!b)return 50;
 const ideological=(ideologyAffinity(a,b)-.5)*50;
 const goodwill=((a.relations||{})[b.id]||0)*.35+((b.relations||{})[a.id]||0)*.18;
 const diplomatic=(a.diplomacy||.5)*4+(b.diplomacy||.5)*4-4;
 return Math.round(clamp(50+ideological+goodwill+diplomatic+(alliance(a.id,b.id)?25:0)-(atWar(a.id,b.id)?65:0),0,100));
}

const originalDiplomaticRender=renderBilateral;
renderBilateral=function(){
 originalDiplomaticRender();
 const a=countries[humanId],b=diplomacyTarget();
 if(!a||!b||a.id===b.id||gameMode!=='player')return;
 const v=relationRating(a,b),card=document.createElement('div');card.className='relationship-meter';
 card.innerHTML='<div><strong>RELATIONS</strong><b>'+v+'/100</b></div><div class="relationship-track"><i style="width:'+v+'%;background:'+(v<35?'#cb8172':v<65?'#d7b76b':'#79bc91')+'"></i></div>';
 relations.prepend(card);
};

const oldNationalFrontRender=renderNationalFront;
renderNationalFront=function(){
 const c=countries[humanId];if(gameMode!=='player'||!c){frontSection.hidden=true;return}
 frontSection.hidden=false;
 const all=ownedArmies(c.id).filter(a=>a.strength>0),fronts=activeFronts(c);
 const foeIds=[...new Set(enemies(c.id))].filter(id=>countries[id]&&countryStats(countries[id]).holdings.length);
 // The compact HUD must offer the same 'open front' workflow as the original
 // command panel. Merely listing existing wars leaves new wars without controls.
 const targets=validCountries().filter(other=>other.id!==c.id&&
  !alliance(c.id,other.id)&&(atWar(c.id,other.id)||bordering(c.id,other.id))&&
  !fronts.some(f=>f.target===other.id));

 const assigned=new Set(fronts.flatMap(f=>f.armyIds||[]));
 const reserve=all.filter(a=>!assigned.has(a.id));
 initManpower(c);
 const availablePeople=Math.round(c.manpowerPool*1e6).toLocaleString('en-US');
 const totalPeople=Math.round(manpowerCapacity(c)*1e6).toLocaleString('en-US');
 frontSection.innerHTML='<div class="quick-section-title">WAR FRONTS <small>'+all.length+' divisions · '+reserve.length+' reserve</small></div>'+
 '<div class="military-manpower-display"><strong>RECRUITABLE POPULATION</strong><span>'+availablePeople+' <small>/ '+totalPeople+' available capacity</small></span><small>Militia and veterans use recruits · mercenaries do not</small></div>'+ 
 '<div class="front-open-controls"><div class="front-mix-title">OPEN / ASSIGN A FRONT</div>'+ 
 (targets.length?'<label>Target country<select id="newFrontTarget">'+targets.map(other=>'<option value="'+other.id+'">'+other.name+(atWar(c.id,other.id)?' · at war':' · declare war')+'</option>').join('')+'</select></label>'+ 
 '<label>Divisions to assign<select id="newFrontCount">'+Array.from({length:Math.max(0,reserve.length)},(_,i)=>'<option value="'+(i+1)+'" '+(i===Math.min(reserve.length,3)-1?'selected':'')+'>'+(i+1)+' division'+(i?'s':'')+'</option>').join('')+'</select></label>'+ 
 '<button type="button" id="openNationalFront" '+(!reserve.length?'disabled':'')+'>Open front and assign divisions</button>':
 '<small>No new neighboring enemies to open a front against.</small>')+
 (!reserve.length&&fronts.length?'<small>All divisions are committed. Use − on one front to free a division before assigning it elsewhere.</small>':'')+'</div>'+
 (foeIds.length?foeIds.map(id=>{
  const f=fronts.find(x=>x.target===id),n=f?.armyIds?.length||0;
  const mix=f?.mix||(f?{breakthrough:f.strategy==='breakthrough'?100:0,balanced:f.strategy==='balanced'?100:0,cautious:f.strategy==='cautious'?100:0,defend:0}:{breakthrough:0,balanced:0,cautious:0,defend:0});
  const attached=all.filter(a=>f?.armyIds?.includes(a.id)),composition=['militia','elite'].map(q=>attached.filter(a=>a.quality===q).length).join(' / ');
  return '<div class="division-front" data-front="'+id+'"><div><b>'+countries[id].name+'</b><small>'+n+' divisions · M/V '+composition+'</small></div><div class="division-controls"><button data-less="'+id+'" '+(!n?'disabled':'')+'>−</button><strong>'+n+'</strong><button data-more="'+id+'" '+(!reserve.length?'disabled':'')+'>＋</button></div>'+
  '<div class="front-mix-title">Orders for this front</div><div class="front-mix-grid">'+[['breakthrough','Aggressive'],['balanced','Balanced'],['cautious','Cautious'],['defend','Defending']].map(([k,label])=>'<label>'+label+'<select data-front-mix="'+id+'" data-stance="'+k+'">'+[0,25,50,75,100].map(v=>'<option value="'+v+'" '+(v===mix[k]?'selected':'')+'>'+v+'%</option>').join('')+'</select></label>').join('')+'</div><div class="division-controls"><small data-mix-message="'+id+'">'+(Object.values(mix).reduce((n,v)=>n+v,0)===100?'Total: 100%':'Choose a total of 100%')+'</small><button class="apply-front-mix" data-apply-mix="'+id+'" '+(!f||Object.values(mix).reduce((n,v)=>n+v,0)!==100?'disabled':'')+'>Apply orders</button></div></div>';
 }).join(''):'<p class="front-empty">No active wars.</p>')+
 '<div class="front-mix-title">RECRUIT DIVISION</div><label>Type<select id="nationalQuality"><option value="militia" '+(selectedRecruitQuality==='militia'?'selected':'')+'>Militia · '+divisionRecruitPrice('militia')+'</option><option value="elite" '+(selectedRecruitQuality==='elite'?'selected':'')+'>Veterans · '+divisionRecruitPrice('elite')+'</option><option value="mercenary" '+(selectedRecruitQuality==='mercenary'?'selected':'')+'>Mercenaries · '+divisionRecruitPrice('mercenary')+' treasury</option></select></label><small id="recruitTraits"></small>'+
 '<button class="raise-national" id="raiseNationalForce">＋ Recruit selected division</button>';
 const qualityPicker=frontSection.querySelector('#nationalQuality'),recruitButton=frontSection.querySelector('#raiseNationalForce');
 function refreshRecruit(){const quality=qualityPicker.value,affordable=c.treasury>=divisionRecruitPrice(quality),manpower=canSupplyManpower(c,quality,divisionStartStrength(quality));recruitButton.disabled=!affordable||!manpower||!coreRecruitCounties(c.id).length;recruitButton.textContent='＋ Recruit '+divisionName(quality)+' · '+divisionRecruitPrice(quality)+' treasury';frontSection.querySelector('#recruitTraits').textContent={militia:'9 strength · fast, low upkeep · uses recruitable population',elite:'15 strength · durable frontline force · uses recruitable population',mercenary:'20 strength · 220% combat · highly durable · NO population required · extremely expensive upkeep'}[quality]+(!manpower?' · NOT ENOUGH RECRUITABLE POPULATION':'')}
 qualityPicker.onchange=()=>{selectedRecruitQuality=qualityPicker.value;refreshRecruit()};refreshRecruit();
 const openButton=frontSection.querySelector('#openNationalFront');
 if(openButton)openButton.onclick=()=>{
  const target=Number(frontSection.querySelector('#newFrontTarget')?.value),foe=countries[target];
  const count=Number(frontSection.querySelector('#newFrontCount')?.value)||0;
  if(!foe||count<1||activeFronts(c).some(f=>f.target===target))return;
  const available=ownedArmies(c.id).filter(a=>a.strength>0&&!activeFronts(c).some(f=>f.armyIds?.includes(a.id)));
  if(available.length<count)return;
  if(!atWar(c.id,target)){
   if(!confirm('Declare war on '+foe.name+' and open a front?'))return;
   war(c.id,target);c.stability=clamp(c.stability-3,5,99);
   c.warExhaustion=clamp((c.warExhaustion||0)+4,0,100);
  }
  c.frontOrders.push({target,strategy:'mixed',
   mix:{breakthrough:0,balanced:100,cautious:0,defend:0},
   divisions:count,commit:count/Math.max(1,all.length),armyIds:[],message:'Preparing the front'});
  assignFrontRoutes(c);
  if(typeof addCampaignStory==='function')addCampaignStory('Front opened',count+' divisions assigned against '+foe.name+'.');
  invalidate();renderNationalFront();update();
 };
 function adjust(id,delta){
  let f=activeFronts(c).find(x=>x.target===id);
  if(!f&&delta>0){f={target:id,strategy:'mixed',mix:{breakthrough:0,balanced:100,cautious:0,defend:0},divisions:0,armyIds:[],message:''};c.frontOrders.push(f)}
  if(!f)return;
  const currently=f.armyIds?.length||0;
  f.divisions=Math.max(0,Math.min(all.length,currently+delta));
  if(!f.divisions){releaseFront(c,'',id)}
  assignFrontRoutes(c);renderNationalFront();
 }
 frontSection.querySelectorAll('[data-more]').forEach(b=>b.onclick=()=>adjust(+b.dataset.more,1));
 frontSection.querySelectorAll('[data-less]').forEach(b=>b.onclick=()=>adjust(+b.dataset.less,-1));
 frontSection.querySelectorAll('[data-front-mix]').forEach(input=>input.onchange=()=>{
  const id=+input.dataset.frontMix,group=[...frontSection.querySelectorAll('[data-front-mix="'+id+'"]')];
  const total=group.reduce((sum,x)=>sum+Math.max(0,+x.value||0),0);
  frontSection.querySelector('[data-mix-message="'+id+'"]').textContent='Total: '+total+'%'+(total===100?'':' — must equal 100%');
  const apply=frontSection.querySelector('[data-apply-mix="'+id+'"]');apply.disabled=total!==100;
 });
 frontSection.querySelectorAll('[data-apply-mix]').forEach(button=>button.onclick=()=>{
  const id=+button.dataset.applyMix,f=activeFronts(c).find(x=>x.target===id);if(!f)return;
  const inputs=[...frontSection.querySelectorAll('[data-front-mix="'+id+'"]')];
  const mix=Object.fromEntries(inputs.map(input=>[input.dataset.stance,Math.max(0,Math.min(100,+input.value||0))]));
  if(Object.values(mix).reduce((sum,n)=>sum+n,0)!==100)return;
  f.mix=mix;f.strategy='mixed';
  for(const a of ownedArmies(c.id).filter(a=>f.armyIds?.includes(a.id))){a.route=[];a.plan=null}
  assignFrontRoutes(c);renderNationalFront();
 });
 frontSection.querySelector('#raiseNationalForce').onclick=()=>{
  const quality=qualityPicker.value,price=divisionRecruitPrice(quality);
  selectedRecruitQuality=quality;
  const initialStrength=divisionStartStrength(quality);
  if(c.treasury<price||!canSupplyManpower(c,quality,initialStrength))return;
  const holdings=coreRecruitCounties(c.id),frontier=holdings.filter(t=>(countyGraph[t.i]||[]).some(j=>territories[j].owner!==c.id));
  const best=(frontier.length?frontier:holdings).slice().sort((a,b)=>b.infra-a.infra)[0];
  if(!best){armyMessage='Recruitment requires home or fully integrated territory.';return;}
  c.treasury-=price;
  const division=createArmy(c.id,best.i,initialStrength,quality,true);
  if(!division){c.treasury+=price;return;}
  armyMessage='Division '+division.id+' ('+divisionName(quality)+') recruited for '+price+' treasury with '+initialStrength+' starting strength.';
  renderNationalFront();update();
 };
};

function compactPanels(){
 const cabinet=document.querySelector('#cabinetBody');
 document.querySelectorAll('#governanceControls .gov-section-title').forEach(x=>{if(x.textContent.includes('DOMESTIC DECISIONS'))x.remove()});
 cabinet?.querySelectorAll('.policy-advice,.fiscal-action').forEach(x=>x.remove());
 cabinet?.querySelectorAll('.gov-section-title').forEach(x=>{if(x.textContent.includes('DOMESTIC DECISIONS'))x.remove()});
 const policy=cabinet?.querySelector('.simple-government');
 if(policy){const paras=policy.querySelectorAll(':scope > p');paras.forEach(p=>p.remove());}
 const national=cabinet?.querySelector('.national-programs');
 national?.querySelector(':scope > p.cabinet-muted')?.remove();
 const inspector=document.querySelector('#inspect .diplomacy');
 if(inspector){
  inspector.innerHTML=inspector.innerHTML.replace(/<br><b>Counties by state:<\/b>.*?(?=<br><b>Representation:)/,'');
 }
 const world=document.querySelector('.embedded-rankings'),warsPanel=document.querySelector('.world-wars');
 if(world){
  const parent=world.parentElement;
  if(warsPanel&&parent===warsPanel.parentElement)parent.insertBefore(world,warsPanel);
  const list=world.querySelector('#rankings')||document.querySelector('#rankings');
  if(list)list.innerHTML=validCountries().sort((a,b)=>power(b)-power(a)).slice(0,15).map((c,i)=>'<div class="rankrow"><span class="num">'+(i+1)+'</span><span class="swatch" style="background:'+c.color+'"></span><span>'+c.name+'</span><strong>'+Math.round(power(c))+'</strong></div>').join('');
 }
 document.querySelectorAll('.clarity-intro').forEach(x=>x.remove());
}

const significant=/declares war|capitulat|conquer|collaps|ceasefire|treaty|alliance|civil war|breaks from|proclaims itself|independence|surrender|annex|rebellion|revolt|peace agreement/i;
let majorHistory=[];
const priorMinimalLog=log;
log=function(message,type=''){
 priorMinimalLog(message,type);
 if(significant.test(message)&&!majorHistory.some(x=>x.msg===message&&x.year===dateLabel()))majorHistory.unshift({msg:message,year:dateLabel(),type});
};
function renderMajorHistory(){
 const container=document.querySelector('#events');if(!container)return;
 container.replaceChildren();
 for(const e of majorHistory){const row=document.createElement('div');row.className='event '+e.type;
  const when=document.createElement('time'),msg=document.createElement('span');when.textContent=e.year;msg.textContent=e.msg;row.append(when,msg);container.append(row)}
}
const toastHolder=document.createElement('div');toastHolder.className='army-toast-holder';document.body.append(toastHolder);
function armyToast(text){const n=document.createElement('div');n.className='army-toast';n.textContent='⚔ '+text;toastHolder.append(n);setTimeout(()=>n.remove(),5000)}

const priorMinimalTick=simulatePeriod;
simulatePeriod=function(){
 const human=gameMode==='player'?countries[humanId]:null;
 const before=new Map(human?ownedArmies(human.id).map(a=>[a.id,a.county]):[]);
 const opponents=human?enemies(human.id).map(id=>({id,name:countries[id].name,count:countryStats(countries[id]).holdings.length})):[];
 priorMinimalTick();
 if(!geomReady)return;
 const survivors=new Set(human?ownedArmies(human.id).map(a=>a.id):[]);
 for(const [id,county] of before){if(!survivors.has(id))armyToast('Division '+id+' lost near '+(territories[county]?.name||'the front')+'.')}
 for(const foe of opponents){
  const c=countries[foe.id];if(foe.count>0&&c&&countryStats(c).holdings.length===0&&!c.surrendered){
   log(foe.name+' is fully conquered.','warlog');
   queueNotice('WAR CONCLUDED',foe.name+' has been conquered','The last territory of '+foe.name+' has fallen.');
  }
 }
};

const previousMinimalUpdate=update;
update=function(){
 const active=document.activeElement;
 const editing=timer&&['cabinet','armies','intel'].includes(openPanel)||active&&active.matches('select,input,button')&&active.closest('.card,.inspector,.army-panel');
 if(editing){
  // Leave live control trees alone while the player is using them. Data and map still update.
  const oldRenderCabinet=renderCabinet,oldRenderFront=renderNationalFront,oldRenderBilateral=renderBilateral;
  renderCabinet=()=>{};renderNationalFront=()=>{};renderBilateral=()=>{};
  try{previousMinimalUpdate()}finally{renderCabinet=oldRenderCabinet;renderNationalFront=oldRenderFront;renderBilateral=oldRenderBilateral}
 }else previousMinimalUpdate();
 compactPanels();renderMajorHistory();
};

const priorMinimalGenerate=generate;
generate=function(reuse=false){majorHistory=[];selectedRecruitQuality='militia';priorMinimalGenerate(reuse);compactPanels()};
compactPanels();renderMajorHistory();
