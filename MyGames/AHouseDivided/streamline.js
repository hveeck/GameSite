/* Nationwide investment queue: strategic decisions without county micromanagement. */
const nationalPrograms={
 infrastructure:{name:'National infrastructure',cost:90,days:135,description:'Permanent: productivity +7.5%; infrastructure +0.065 in every county.',finish:c=>{c.baseEconomyFactor=clamp(c.baseEconomyFactor+.075,.45,1.8);for(const t of countryStats(c).holdings)t.infra=Math.min(1.7,t.infra+.065)}},
 housing:{name:'Housing & public health',cost:75,days:110,description:'Stability +7; population +0.6%.',finish:c=>{c.stability=clamp(c.stability+7,5,99);for(const t of countryStats(c).holdings)t.p*=1.006}},
 defense:{name:'Defense modernization',cost:80,days:110,description:'Strength +12; permanent fortification +0.12.',finish:c=>{c.readiness=clamp(c.readiness+12,5,100);c.fort=(c.fort||0)+.12}},
 industry:{name:'Energy & industrial expansion',cost:100,days:160,description:'Permanent: productivity +6%; resources +0.055 in every county.',finish:c=>{c.baseEconomyFactor=clamp(c.baseEconomyFactor+.06,.45,1.8);for(const t of countryStats(c).holdings)t.res=Math.min(1.8,t.res+.055)}},
 unity:{name:'National reconciliation',cost:65,days:95,description:'Stability +10; morale +6; war exhaustion −5.',finish:c=>{c.stability=clamp(c.stability+10,5,99);c.morale=clamp(c.morale+6,0,100);c.warExhaustion=clamp(c.warExhaustion-5,0,100)}}
};
function nationalQueue(c){return c.nationalProjects||(c.nationalProjects=[])}
function launchNationalProgram(c,id){
 const p=nationalPrograms[id],q=nationalQueue(c);
 if(!p||q.length>=2||c.treasury<p.cost||q.some(x=>x.id===id))return false;
 c.treasury-=p.cost;q.push({id,remaining:p.days,total:p.days});
 log(c.name+' launches '+p.name.toLowerCase()+'.');return true;
}
const baseNationwideCabinet=renderCabinet;
renderCabinet=function(force=false){
 baseNationwideCabinet(force);
 const c=countries[humanId],body=$('cabinetBody');
 if(!body||!c||gameMode!=='player'||!countryStats(c).holdings.length)return;
 const q=nationalQueue(c),section=document.createElement('div');section.className='national-programs';
 section.innerHTML='<div class="cabinet-section">NATIONAL INITIATIVES <small>Up to two at once</small></div><p class="cabinet-muted">Fund a single program for the whole country. Implementation proceeds automatically, including while the simulation runs.</p><div class="national-row"><select id="nationalProgramChoice">'+Object.entries(nationalPrograms).map(([id,p])=>'<option value="'+id+'">'+p.name+' · '+p.cost+' treasury</option>').join('')+'</select><button id="launchNationalProgram">Launch</button></div><div class="national-queue">'+(q.length?q.map((item,i)=>{const p=nationalPrograms[item.id];return '<div class="national-progress"><strong>'+p.name+'</strong><span>'+Math.ceil(item.remaining)+' days left</span><div class="national-track"><i style="width:'+(100*(1-item.remaining/item.total)).toFixed(1)+'%"></i></div><button data-cancel-national="'+i+'">Cancel</button></div>'}).join(''):'<p class="cabinet-muted">No projects underway.</p>')+'</div><p id="nationalDescription" class="cabinet-muted"></p>';
 body.querySelector('.auto-cabinet')?.after(section);
 const choice=section.querySelector('#nationalProgramChoice'),description=section.querySelector('#nationalDescription');
 const describe=()=>{const p=nationalPrograms[choice.value];description.textContent=p.description+' · '+p.days+' days.';section.querySelector('#launchNationalProgram').disabled=q.length>=2||c.treasury<p.cost||q.some(x=>x.id===choice.value)};
 choice.onchange=describe;describe();
 section.querySelector('#launchNationalProgram').onclick=()=>{if(launchNationalProgram(c,choice.value)){agencyNotice='National initiative funded.';renderCabinet(true);update()}};
 section.querySelectorAll('[data-cancel-national]').forEach(btn=>btn.onclick=()=>{const index=+btn.dataset.cancelNational,project=q[index];if(!project)return;const refund=Math.floor(nationalPrograms[project.id].cost*(project.remaining/project.total)*.35);c.treasury+=refund;q.splice(index,1);agencyNotice='Initiative canceled. Recovered '+refund+' treasury.';renderCabinet(true);update()});
};
const baseNationwideAdvance=advanceCabinet;
advanceCabinet=function(days){
 baseNationwideAdvance(days);
 if(!days)return;
 for(const c of countries){if(!c||!countryStats(c).holdings.length)continue;
  const q=nationalQueue(c);
  for(let i=q.length-1;i>=0;i--){const task=q[i];task.remaining-=days;if(task.remaining<=0){nationalPrograms[task.id]?.finish(c);q.splice(i,1);log(c.name+' completes '+nationalPrograms[task.id].name.toLowerCase()+'.')}}
  if(gameMode!=='player'||c.id!==humanId||!c.autoCabinet||q.length>=2||c.treasury<165)continue;
  c.programCooldown=c.programCooldown||0;
  if(daysElapsed-c.programCooldown<120)continue;
  const preferences={balanced:['infrastructure','housing','unity'],growth:['industry','infrastructure','housing'],fortress:['defense','infrastructure','unity'],rebuild:['housing','unity','integration']}[c.autoPreset]||['infrastructure'];
  const id=preferences.find(x=>nationalPrograms[x]&&!q.some(p=>p.id===x)&&c.treasury-nationalPrograms[x].cost>=85);
  if(id&&launchNationalProgram(c,id))c.programCooldown=daysElapsed;
 }
};
