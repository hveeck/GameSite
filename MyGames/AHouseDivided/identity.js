/* National integration, geopolitical naming, and ideology-based relations. */
const ideologyCoordinates={
 republicanism:[-.6,-1,0],liberal_democracy:[-1.2,-1.8,-.6],libertarianism:[-2,-1.4,.1],
 social_democracy:[.3,-1.6,-1],democratic_socialism:[1.4,-1.4,-1.2],communism:[2,1.55,-1.6],
 fascism:[.8,2,1.9],monarchy:[.4,1.3,1.8],constitutional_monarchy:[-.5,-1,1.2],
 technocracy:[-.5,.3,-.3],military_junta:[.2,1.85,.75],theocracy:[.4,1.5,2],
 federalism:[-.6,-1.45,.35],corporatism:[.2,.55,.8]
};
function ideologyAffinity(a,b){
 if(!a||!b)return .5;
 const x=ideologyCoordinates[a.ideology]||ideologyCoordinates.republicanism;
 const y=ideologyCoordinates[b.ideology]||ideologyCoordinates.republicanism;
 const distance=Math.hypot((x[0]-y[0])*1.1,(x[1]-y[1])*1.45,(x[2]-y[2])*.7);
 return clamp(1-distance/7.25,.03,1);
}
const unionRegionNames={
 pacific:'Pacific',mountain:'Rocky Mountain',plains:'Great Plains',southwest:'Southwestern',
 sunbelt:'Sunbelt',south:'Southern',texas:'Texan',greatlakes:'Great Lakes',midwest:'Heartland',
 gulf:'Gulf',appalachia:'Appalachian',atlantic:'Atlantic',northeast:'New England',frontier:'Northern'
};
function initializeIdentity(c){
 if(c.integration===undefined)c.integration=0;
 if(c.lastIdentityDay===undefined)c.lastIdentityDay=-99999;
 if(c.rebrands===undefined)c.rebrands=0;
}
function expandedIdentityEligible(c){
 initializeIdentity(c);const now=countryStats(c).holdings.length,initial=c.initialCount||now;
 return now>=initial*1.4&&now-initial>=8&&c.rebrands<3&&daysElapsed-c.lastIdentityDay>=1095;
}
function nationalNameChoices(c){
 const holdings=countryStats(c).holdings,counts=new Map();
 for(const t of holdings)counts.set(t.region,(counts.get(t.region)||0)+t.p);
 const top=[...counts].sort((a,b)=>b[1]-a[1]).map(([region])=>unionRegionNames[region]||region);
 const first=top[0]||'American',second=top[1]||'Interior';
 const parts=top.length>=4?['Continental','United American']:top.length>=2?[first+'–'+second,'United '+first]:['Greater '+first];
 const candidate=[
  parts[0]+' Federation',
  'United '+first+' Commonwealth',
  parts[0]+' Republic',
  first+' and '+second+' Union',
  'Federation of the '+first+' Provinces',
  'United Provinces of '+first,
  'Greater '+first+' Compact',
  'American Regional Union'
 ];
 const used=new Set(countries.filter(other=>other.id!==c.id&&countryStats(other).holdings.length).map(other=>other.name.toLowerCase()));
 return [...new Set(candidate)].filter(name=>!used.has(name.toLowerCase())).slice(0,5);
}
function integrateAndRename(c,name){
 if(!expandedIdentityEligible(c)||c.treasury<24)return false;
 const choices=nationalNameChoices(c);
 if(!choices.includes(name))return false;
 const oldName=c.name;
 c.name=name;c.treasury-=24;c.integration=clamp(c.integration+.14,0,.58);
 c.inclusion=clamp((c.inclusion||.7)+.05,.1,1);
 c.stability=clamp(c.stability+5,5,99);c.morale=clamp(c.morale+3,5,99);
 c.lastIdentityDay=daysElapsed;c.rebrands++;
 log(oldName+' proclaims itself '+c.name+', adopting a broader national identity and integration program.','peace');
 invalidate();recolorBorders(true);update();
 return true;
}
const previousIdentityTick=simulatePeriod;
simulatePeriod=function(){
 const before=daysElapsed;previousIdentityTick();if(daysElapsed<=before)return;
 const days=daysElapsed-before,months=days/30.44;
 for(const c of validCountries()){
  initializeIdentity(c);const holdings=countryStats(c).holdings;
  const population=Math.max(.01,nums(holdings.map(t=>t.p)));
  const mismatch=nums(holdings.filter(t=>t.region!==c.origin).map(t=>t.p))/population;
  // Expanding states must build inclusive institutions to integrate their
  // different regions; assimilation is a political mechanic, not a race trait.
  const strain=Math.max(0,mismatch-.22)*(1-(c.inclusion||.7))*(1-c.integration);
  c.stability=clamp(c.stability-strain*.32*months,5,99);
  if(c.id===humanId&&gameMode==='player')continue;
  if(expandedIdentityEligible(c)&&c.treasury>=24&&c.stability>32&&chance(.34,days)){
   const name=nationalNameChoices(c)[0];if(name)integrateAndRename(c,name);
  }
 }
 invalidate();update();
};
tick=simulatePeriod;
const previousIdentityGenerate=generate;
generate=function(reuse=false){previousIdentityGenerate(reuse);if(geomReady)for(const c of countries)initializeIdentity(c)};

const formerCabinetRender=renderCabinet;
renderCabinet=function(force=false){
 formerCabinetRender(force);
 const c=countries[humanId],body=$('cabinetBody');
 if(gameMode!=='player'||!c||!body||!countryStats(c).holdings.length)return;
 const available=expandedIdentityEligible(c),names=available?nationalNameChoices(c):[];
 const wrap=document.createElement('div');wrap.className='national-identity-control';
 wrap.innerHTML='<div class="cabinet-section">NATIONAL IDENTITY <small>Growth & integration</small></div>'+
 '<p class="cabinet-muted">A larger state may adopt an inclusive name reflecting its expanded territory. Reorganization costs 24 treasury, improves stability and representation, and reduces long-term regional friction.</p>'+
 (available&&names.length?'<label>New national name<select id="identityName">'+names.map(n=>'<option>'+n+'</option>').join('')+'</select></label><button id="adoptIdentity" '+(c.treasury<24?'disabled':'')+'>Proclaim united national identity</button>':
 '<div class="identity-hint">'+(c.rebrands>=3?'National identity already consolidated.':'Available after substantial territorial growth (at least 40% and 8 new counties), once every 3 years.')+'</div>');
 body.append(wrap);
 if($('adoptIdentity'))$('adoptIdentity').onclick=()=>{if(integrateAndRename(c,$('identityName').value)){agencyNotice='National integration reforms enacted.';renderCabinet(true)}};
};

const formerIdentityIntel=renderBilateral;
renderBilateral=function(){
 formerIdentityIntel();
 const own=countries[humanId],other=diplomacyTarget();
 if(gameMode!=='player'||!own||!other||other.id===humanId||relations.hidden)return;
 const match=ideologyAffinity(own,other);
 const label=match>.73?'Ideologically aligned':match<.37?'Ideological rivals':'Mixed political outlook';
 const note=document.createElement('div');note.className='ideology-compatibility';
 note.innerHTML='<b>Ideological compatibility:</b> '+Math.round(match*100)+'% · '+label;
 relations.prepend(note);
};
