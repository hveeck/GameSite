// Layout controller only. Existing simulation, map and country actions are reused.
const field=document.querySelector('main'),maincol=document.querySelector('.maincol'),aside=document.querySelector('aside');
field.classList.add('war-room');
document.querySelector('.map-scale')?.remove();
const oldFactionField=$('factions')?.closest('label');
if(oldFactionField)oldFactionField.innerHTML='Successor countries <div class="temporal-note" style="margin-top:8px">Generated automatically from regional identity, geography and demographic resemblance. Each world may contain roughly 10–100 countries.</div>';
document.querySelector('#help .modal p:first-of-type').textContent='Each generation divides the contiguous United States into fictional successor countries along county boundaries. County population and race/Hispanic-origin distributions come from official 2024 Census county estimates. Ten obsolete county identifiers use historical population approximations. Opening populations are proportionally scaled to an estimated 340.6 million residents across the lower 48 in 2026. Rural counties may have only a few thousand residents, while major metropolitan counties have millions. Energy, agriculture and industrial resources are modeled game proxies.';
document.querySelector('#help .modal p:nth-of-type(3)').innerHTML='<b>Important:</b> Demographic resemblance contributes modestly to fictional community affiliation, but no racial group is assigned a conflict tendency. Stability depends on political representation, regional integration, economics and random events. Borders, political behavior and wars remain alternate-history fiction rather than forecasts.';
const cards={
  world:document.querySelector('.bottom-grid .card:first-child'),
  events:document.querySelector('.eventcard'),
  scenario:document.querySelector('.control.card'),
  command:document.querySelector('.command.card'),
  intel:document.querySelector('.inspector.card'),
  powers:document.querySelector('.leaderboard.card')
};
const sides={world:'left',scenario:'left',events:'left',intel:'right',powers:'right',command:'right'};
let openPanel=null;
for(const [id,card] of Object.entries(cards)){
 card.classList.add('war-panel',sides[id]);
 card.dataset.panel=id;
 const closer=document.createElement('button');closer.className='panel-close';closer.textContent='×';closer.setAttribute('aria-label','Close '+id+' panel');
 closer.onclick=()=>setPanel(null);card.prepend(closer);
 field.append(card);
}
function setPanel(id){
 openPanel=id;
 for(const [key,card] of Object.entries(cards))card.classList.toggle('open',key===id);
 document.querySelectorAll('[data-open]').forEach(b=>b.classList.toggle('active',b.dataset.open===id));
}
function makeRail(side,items){
 const rail=document.createElement('nav');rail.className='war-rail '+side;rail.setAttribute('aria-label',side+' strategy controls');
 for(const [id,icon,label] of items){const b=document.createElement('button');b.dataset.open=id;b.innerHTML='<span>'+icon+'</span>'+label;b.title=label;b.onclick=()=>setPanel(openPanel===id?null:id);rail.append(b)}
 field.append(rail);
}
makeRail('left',[['scenario','⚙','Setup'],['world','◈','World'],['events','≡','History']]);
makeRail('right',[['command','♛','Command'],['intel','⌖','Intel'],['powers','▥','Powers']]);
const bottom=document.createElement('div');bottom.className='war-bottom';
const clock=document.createElement('div');clock.className='clock';
const brief=document.createElement('div');brief.className='world-brief';
const modeShortcut=document.createElement('button');modeShortcut.className='mode-shortcut';
modeShortcut.onclick=()=>{
 const s=$('gameMode');s.value=s.value==='watch'?'player':'watch';s.dispatchEvent(new Event('change'));setPanel(s.value==='player'?'command':null);
};
bottom.append(clock,document.querySelector('.temporal-controls'),document.querySelector('.runrow'),modeShortcut,brief);
field.append(bottom);
function refreshHUD(){
 clock.textContent=dateLabel();
 modeShortcut.textContent=gameMode==='watch'?'◉ WATCH MODE':'♛ PLAYING FACTION';
 const alive=validCountries().length;
 brief.innerHTML='<span><b>'+alive+'</b> COUNTRIES</span><span><b>'+wars.length+'</b> WARS</span><span><b>'+pacts.length+'</b> PACTS</span>';
}
const priorUpdate=update;update=function(){priorUpdate();refreshHUD()};
const priorGenerate=generate;generate=function(reuse=false){priorGenerate(reuse);refreshHUD()};
const priorSelect=$('gameMode').onchange;$('gameMode').onchange=function(){priorSelect();refreshHUD()};
const originalCountryClick=document.querySelector('#map');
originalCountryClick.addEventListener('click',ev=>{if(ev.target.closest('path[data-i]'))setPanel('intel')});
// The Setup window opens on the first visit so the random world can be adjusted.
setPanel('scenario');refreshHUD();
