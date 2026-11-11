/* Geographic simulation layer. County outlines from Plotly's public US county GeoJSON;
   Census 2024 county estimates adjusted to an estimated lower-48 2026 total. Fictional politics. */
let territories=[], countyGraph=[], svg=null, geoGroup=null, geoPath=null, countyEls=[], labelGroup=null, geomReady=false, selectedCounty=null, statsCache=null,borderCache=null,mapLabelSignature='',mapZoomLevel=1;
function refreshLabelVisibility(){
 if(!labelGroup)return;
 labelGroup.selectAll('text').style('display',function(){return mapZoomLevel>=+this.dataset.minzoom?'':'none'});
}
const fipsState={
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','12':'FL',
  '13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA',
  '23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE',
  '32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK',
  '41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT',
  '51':'VA','53':'WA','54':'WV','55':'WI','56':'WY'
};
const stateIndex=Object.fromEntries(states.map(s=>[s.a,s]));
// Older map boundaries have ten FIPS identifiers that no longer line up with
// Vintage 2024 county files. Historical county counts are approximate here,
// rather than assigning those populous counties a fraction based on land area.
const legacyCountyPopulation={
 '09001':957000,'09003':899000,'09005':185000,'09007':164000,
 '09009':863000,'09011':266000,'09013':149000,'09015':116000,
 '46113':13500
};
const lower48Population2026=340.6; // Millions; approx. 2026 U.S. less AK and HI.
const terrainRegions={pacific:['Pacific Coast','Cascadian','Sierra','Coastal'],mountain:['Rocky Mountain','Intermountain','High Desert'],plains:['Prairie','Northern Plains','Frontier'],southwest:['Rio Grande','Desert','Southwestern'],sunbelt:['Southern','Desert','Sunbelt'],south:['Southern','Piedmont','Deep South'],texas:['Texan','Lone Star','Hill Country'],greatlakes:['Lakes','Industrial','Upper Midwest'],midwest:['Heartland','Central','Midwestern'],gulf:['Gulf','Delta','Coastal'],appalachia:['Appalachian','Highland','Blue Ridge'],atlantic:['Atlantic','Chesapeake','Mid-Atlantic'],northeast:['New England','Northeastern','Hudson'],frontier:['Alaskan','Northern']};
function makeName(t,i){const stem=choice(terrainRegions[t.region]||[names[t.state]]),tail=choice(['Republic','Federation','Commonwealth','Union','Compact','Free State','Confederation']);return stem+' '+tail}
function mapNeighbors(){
 const points=territories.map(t=>[t.cx,t.cy]);const mesh=d3.Delaunay.from(points);countyGraph=territories.map((t,i)=>Array.from(mesh.neighbors(i)).filter(j=>{
  const b=territories[j];if(t.state==='AK'||t.state==='HI'||b.state==='AK'||b.state==='HI')return t.state===b.state;
  return Math.hypot(t.cx-b.cx,t.cy-b.cy)<52;
 }));
}
function initGeometry(geo,demographics={}){
 const projection=d3.geoAlbersUsa().scale(1540).translate([520,330]),path=d3.geoPath(projection);
 geoPath=path;
 // The playable theater is the contiguous lower 48 (including DC where data
 // permits), with no Alaska/Hawaii inset, claims, or successor countries.
 // Bedford independent city (51515) was reabsorbed by Bedford County in 2013.
 // The older county geometry still contains it; the modern county data already
 // includes its residents, so exclude that obsolete county equivalent.
 let features=geo.features.filter(f=>f.id!=='51515'&&fipsState[f.properties.STATE]&&!['AK','HI'].includes(fipsState[f.properties.STATE]));
 const stateAreas={};for(const f of features){const a=fipsState[f.properties.STATE];stateAreas[a]=(stateAreas[a]||0)+Math.sqrt(Math.max(.5,+f.properties.CENSUSAREA||1))}
 territories=features.map((f,i)=>{
   let state=fipsState[f.properties.STATE],s=stateIndex[state],center=path.centroid(f);
   if(!Number.isFinite(center[0]))center=[-100,-100];
   // County weights preserve each state's total population, while geographic distribution is approximate.
   let weight=Math.sqrt(Math.max(.5,+f.properties.CENSUSAREA||1))/stateAreas[state];
   const datum=demographics[f.id],area=Math.max(.5,+f.properties.CENSUSAREA||1);
   return {i,feature:f,id:f.id,state,region:s.r,name:f.properties.NAME,owner:-1,cx:center[0],cy:center[1],area,
     p:datum?datum.p/1e6:legacyCountyPopulation[f.id]?legacyCountyPopulation[f.id]/1e6:s.p*weight,d:datum?.d||null,e:s.e,res:s.res,infra:s.infra};
 });
 // Keep Census-derived county proportions, scaled to a clearly labeled 2026
 // national estimate. The lower-48 sum must equal the initial world counter.
 const originalTotal=nums(territories.map(t=>t.p));
 const factor=lower48Population2026/originalTotal;
 for(const t of territories){t.p*=factor;t.baseline2026=t.p}
 // Resource capacity is distributed independently of population: land-intensive
 // agriculture/energy versus population- and density-intensive industry.
 const stateGroups=d3.group(territories,t=>t.state);
 // Major producing basins deserve more than a generic area-only allocation.
 // These county weights redistribute each state's simulated resource base;
 // they do not manufacture additional statewide resources.
 const productionCenters={TX:['Midland','Reeves','Loving','Martin','Upton','Howard','Pecos'],ND:['McKenzie','Williams','Mountrail','Dunn'],NM:['Lea','Eddy','San Juan'],WY:['Campbell','Converse','Sublette','Sweetwater'],CA:['Kern'],PA:['Washington','Greene','Susquehanna','Bradford'],WV:['McDowell','Boone','Logan','Marshall'],CO:['Weld','Garfield'],OK:['Canadian','Grady','Kingfisher'],AK:[]};
 for(const [code,group] of stateGroups){
   const s=stateIndex[code],countyPop=nums(group.map(t=>t.p));
   const potential=group.map(t=>(Math.pow(t.area,.72)*(s.r==='plains'||s.r==='texas'||s.r==='gulf'?1.25:1)+Math.sqrt(t.p)*35)*(productionCenters[code]?.includes(t.name)?5:1));
   const totalPotential=nums(potential);
   const industryPotential=group.map(t=>t.p*(.7+.3*Math.min(3,Math.sqrt(t.p*1000/t.area))));
   const totalIndustry=nums(industryPotential);
   group.forEach((t,i)=>{
     t.resourceOutput=countyPop*s.res*potential[i]/Math.max(.01,totalPotential);
     t.industryOutput=countyPop*s.infra*industryPotential[i]/Math.max(.01,totalIndustry);
   });
 }
 const root=d3.select('#map');root.selectAll('*').remove();root.attr('class','geo-map');
 svg=root.append('svg').attr('viewBox','0 0 1040 665').attr('role','img').attr('aria-label','Contiguous United States county-level political map').attr('preserveAspectRatio','xMidYMid meet');
 svg.append('defs').html('<filter id="mapShadow"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity=".3"/></filter>');
 geoGroup=svg.append('g').attr('class','geo-viewport');const countyLayer=geoGroup.append('g').attr('class','county-layer');
 const selection=countyLayer.selectAll('path').data(territories).enter().append('path').attr('d',d=>path(d.feature)).attr('class','county').attr('data-i',d=>d.i);
 countyEls=selection.nodes();
 labelGroup=geoGroup.append('g').attr('class','country-labels').attr('pointer-events','none');
 const zoom=d3.zoom().scaleExtent([1,6]).on('zoom',ev=>{geoGroup.attr('transform',ev.transform);mapZoomLevel=ev.transform.k;refreshLabelVisibility()});
 svg.call(zoom).on('dblclick.zoom',null);
 document.getElementById('zoomIn').onclick=()=>svg.transition().duration(300).call(zoom.scaleBy,1.45);
 document.getElementById('zoomOut').onclick=()=>svg.transition().duration(300).call(zoom.scaleBy,1/1.45);
 document.getElementById('zoomReset').onclick=()=>svg.transition().duration(300).call(zoom.transform,d3.zoomIdentity);
 countyLayer.on('click',ev=>{const el=ev.target.closest('[data-i]');if(!el)return;selectedCounty=+el.dataset.i;selected=territories[selectedCounty].state;update()});
 countyLayer.on('pointerover',ev=>{const el=ev.target.closest('[data-i]');if(!el)return;const t=territories[+el.dataset.i];document.getElementById('mapFooter').textContent=t.name+' County, '+names[t.state]+' · '+countries[t.owner].name+' · click to inspect'});
 countyLayer.on('pointerout',()=>{if(selectedCounty===null)document.getElementById('mapFooter').textContent='Hover or click a county to inspect the new political geography.'});
 mapNeighbors();geomReady=true;generate();
}
function geographicStats(c){
 if(!statsCache)statsCache=new Map();if(statsCache.has(c.id))return statsCache.get(c.id);
 const holdings=territories.filter(t=>t.owner===c.id),pop=nums(holdings.map(t=>t.p));
 const economy=nums(holdings.map(t=>t.p*t.e)),resources=nums(holdings.map(t=>t.resourceOutput)),industry=nums(holdings.map(t=>t.industryOutput));
 const obj={holdings,pop,economy,resources,industry,power:(pop*.3+economy*.35+resources*.25+industry*.1)*(.5+c.stability/180)*(1+c.morale/250)};
 statsCache.set(c.id,obj);return obj;
}
countryStats=geographicStats;
function invalidate(){statsCache=null;borderCache=null}
function countryBorder(a,b){
 if(!borderCache){
  borderCache=new Map();
  for(let i=0;i<territories.length;i++){
   const first=territories[i].owner;
   for(const j of countyGraph[i]){
    const second=territories[j].owner;
    if(first===second)continue;
    if(!borderCache.has(first))borderCache.set(first,new Set());
    borderCache.get(first).add(second);
   }
  }
 }
 return borderCache.get(a)?.has(b)||false;
}
bordering=countryBorder;
function distinguishCountries(){
 const adjoining=countries.map(()=>new Set());
 for(let i=0;i<territories.length;i++){
  const a=territories[i].owner;
  for(const j of countyGraph[i]){
   const b=territories[j].owner;
   if(a!==b){adjoining[a].add(b);adjoining[b].add(a)}
  }
 }
 // Distinct political-atlas colors: deliberately balance usage across many
 // color families, while forbidding visually similar neighbors. Maximizing
 // contrast alone caused a two-color alternating pattern on most maps.
 const colors=[
  '#e76f70','#58a9dc','#e5bc58','#9e82dd',
  '#62ba85','#df80b5','#de9258','#6e84d9',
  '#afbc61','#4bb9b8','#b87d67','#c6a3e8',
  '#79bbd6','#dc668f','#b4d27b','#edaa86'
 ];
 const lab=colors.map(color=>d3.lab(color)),usage=Array(colors.length).fill(0);
 const order=countries.map(c=>c.id).sort((a,b)=>adjoining[b].size-adjoining[a].size);
 const assigned=new Map();
 for(const id of order){
  let best=-Infinity,bestIndex=0,foundSafe=false;
  for(let i=0;i<colors.length;i++){
   let closest=Infinity;
   for(const neighbor of adjoining[id]){
    if(!assigned.has(neighbor))continue;
    const a=lab[i],b=lab[assigned.get(neighbor)];
    const distance=Math.hypot(a.l-b.l,a.a-b.a,a.b-b.b);
    closest=Math.min(closest,distance);
   }
   const safe=closest>=37;
   // If any safe color exists, don't sacrifice border legibility for balance.
   if(safe&&!foundSafe){foundSafe=true;best=-Infinity}
   if(!safe&&foundSafe)continue;
   const score=safe?(-usage[i]*20 + Math.min(closest,80)*.08 + rand()*3)
                   :(closest*3 - usage[i]*.5);
   if(score>best){best=score;bestIndex=i}
  }
  assigned.set(id,bestIndex);usage[bestIndex]++;countries[id].color=colors[bestIndex];
 }
 // Avoid neighbors named, for example, "Coastal Republic" and "Coastal Union".
 const usedNames=new Set(),usedRoots=new Map();
 const roots=n=>n.replace(/\b(Republic|Federation|Commonwealth|Union|Compact|Confederation|Free State|Provisional Government)\b.*$/i,'').trim().toLowerCase();
 for(const id of order){
  const c=countries[id],base=c.name,anchor=c.anchor||names[c.capital];
  const endings=['Republic','Commonwealth','Federation','Compact','Union','Free State'];
  const choices=[base,...endings.map(e=>anchor+' '+e),...endings.map(e=>names[c.capital]+' '+e),anchor+'-'+c.capital+' League'];
  let candidate=choices.find(n=>!usedNames.has(n.toLowerCase())&&![...adjoining[id]].some(other=>usedRoots.get(other)===roots(n)));
  if(!candidate)candidate=anchor+' '+names[c.capital]+' League';
  c.name=candidate;usedNames.add(candidate.toLowerCase());usedRoots.set(id,roots(candidate));
 }
}
function createGeoWorld(reuse=false){
 if(!geomReady)return;stop();seed=reuse?initSeed:Math.floor(Math.random()*899999)+100000;initSeed=seed;rng=seeded(seed);year=2032;displaced=0;wars=[];pacts=[];events=[];selected=null;selectedCounty=null;
 const mode=$('scenario').value;
 // No fixed count: local cohesion and the selected crisis shape a new, seeded
 // partition on every generation. Ten to one hundred countries are possible.
 let count=Math.round(10+90*Math.pow(rand(),1.55));
 if(mode==='regional')count=Math.round(10+30*rand());
 if(mode==='fragmented')count=Math.round(45+55*rand());
 // Spatially separated founding regions within the contiguous United States.
 const available=territories.filter(t=>t.cx>0&&t.cy>0),seeds=[];
 let first=choice(available);seeds.push(first);
 while(seeds.length<count){
  let pool=[];for(let k=0;k<110;k++){const t=choice(available);if(seeds.includes(t))continue;
   let nearest=Math.min(...seeds.map(s=>Math.hypot((s.cx-t.cx)*1.2,s.cy-t.cy)));
   pool.push({t,score:nearest*(.7+rand()*.45)});
  }
  pool.sort((a,b)=>b.score-a.score);seeds.push(pool[0].t);
 }
 countries=seeds.map((t,i)=>({id:i,name:makeName(t,i),anchor:t.name,color:`hsl(${Math.round(i*137.508)%360} 48% ${43+i%3*5}%)`,origin:t.region,capital:t.state,stability:Math.round(55+rand()*34),morale:Math.round(42+rand()*45),aggression:rand(),diplomacy:rand(),inclusion:.48+rand()*.5}));
 // Regional identities produce crooked corridors and protrusions, not merely
 // compact Voronoi blobs around capitals. All distortions are seed-deterministic.
 let perturb=seeds.map(()=>({x:rand()*6.28,y:rand()*6.28,phase:rand()*6.28,
  cultural:rand()*6.28,scale:.6+rand()*.9}));
 for(const t of territories){
  let best=-Infinity,chosen=0;
  for(let k=0;k<seeds.length;k++){
   const s=seeds[k],p=perturb[k];
   const shiftedX=t.cx+Math.sin(t.cy*.025+p.x)*15*p.scale+Math.sin(t.cy*.075+p.phase)*5;
   const shiftedY=t.cy+Math.cos(t.cx*.029+p.y)*13*p.scale+Math.cos(t.cx*.08+p.phase)*5;
   const d=Math.hypot((shiftedX-s.cx)*1.05,(shiftedY-s.cy)*1.12);
   let affinity=t.region===s.region?13:0;
   if(mode==='regional')affinity*=1.9;
   if(mode==='polarized')affinity=9+(12-Math.abs(t.e-s.e)*2.6);
   if(mode==='resource')affinity=16-Math.abs(t.res-s.res)*3.5;
   if(mode==='fragmented')affinity*=.65;
   // Demographic resemblance is a modest cultural-affinity input, not a prediction
   // of loyalty or conflict. Geography, institutions and randomness remain dominant.
   if(t.d&&s.d)affinity+=13*(1-t.d.reduce((sum,v,j)=>sum+Math.abs(v-s.d[j]),0)/2);
   // Multiscale contiguous waves yield narrow arms and irregular borders;
   // affinity favors cultural/demographic continuity over geometric symmetry.
   const wiggle=Math.sin(t.cx*.034+p.x)*10+Math.cos(t.cy*.044+p.y)*10+
    Math.sin(t.cx*.011+t.cy*.025+p.phase)*12+
    Math.cos(t.cx*.084-t.cy*.055+p.cultural)*4;
   let score=-d*.92+affinity+wiggle*(mode==='fragmented'?1.25:1);
   if(score>best){best=score;chosen=k}
  }
  t.owner=chosen;
 }
 seeds.forEach((t,k)=>t.owner=k);invalidate();
 distinguishCountries();
 // Stability reflects institutional representation and region mixing. A
 // demographically varied population is not inherently unstable: inclusive
 // institutions can turn heterogeneous communities into a stabilizing asset.
 for(const c of countries){
  const held=territories.filter(t=>t.owner===c.id),pop=Math.max(.001,nums(held.map(t=>t.p)));
  const mix=Array(7).fill(0);
  let regionalMismatch=0;
  for(const t of held){if(t.d)t.d.forEach((v,j)=>mix[j]+=v*t.p);if(t.region!==c.origin)regionalMismatch+=t.p}
  const total=nums(mix)||1,diversity=1-nums(mix.map(v=>(v/total)**2));
  c.diversity=diversity;c.regionalFriction=regionalMismatch/pop;
  c.cohesionPressure=(c.inclusion-.67)*diversity*14-c.regionalFriction*7;
  c.stability=clamp(c.stability+c.cohesionPressure,25,97);
 }
 const label=scenarioMeta[mode];$('scenarioTitle').textContent=label[0];$('scenarioDesc').textContent=label[1];$('seedLabel').textContent=seed;
 log('The old union fractures into '+countries.length+' governments, with boundaries crossing county and state lines.','peace');update();
}
generate=createGeoWorld;
function geoTick(){
 if(!geomReady)return;year++;const vol=+$('volatility').value;
 let alive=validCountries(),ids=alive.map(c=>c.id);
 for(let c of alive){c.stability=clamp(c.stability+(rand()-.53)*9*vol,14,99);c.morale=clamp(c.morale+(rand()-.52)*8,10,99)}
 invalidate();
 if(gameMode!=='player'&&$('alliances').checked)for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++){
  let a=alive[i],b=alive[j];if(!bordering(a.id,b.id)||atWar(a.id,b.id)||alliance(a.id,b.id))continue;
  if(rand()<.012*(a.diplomacy+b.diplomacy+1)/2){pacts.push([a.id,b.id]);log(a.name+' and '+b.name+' establish a defense pact.','peace')}
 }
 for(const w of [...wars]){
  let[a,b]=w;if(!ids.includes(a)||!ids.includes(b)||!bordering(a,b)||rand()<.12){
   wars=wars.filter(x=>x!==w);log(countries[a].name+' and '+countries[b].name+' suspend hostilities.','peace');continue;
  }
  let atk=rand()<.5?a:b,def=atk===a?b:a;
  let front=territories.filter((t,i)=>t.owner===def&&countyGraph[i].some(j=>territories[j].owner===atk));
  if(!front.length)continue;let target=choice(front),A=countryStats(countries[atk]),D=countryStats(countries[def]);
  let alliedA=pacts.filter(x=>x.includes(atk)).reduce((n,x)=>n+countryStats(countries[x[0]===atk?x[1]:x[0]]).power*.12,0);
  let alliedD=pacts.filter(x=>x.includes(def)).reduce((n,x)=>n+countryStats(countries[x[0]===def?x[1]:x[0]]).power*.12,0);
  let sA=(A.power+alliedA)*(.65+rand()*.9),sD=(D.power+alliedD)*(.6+rand()*.85);
  displaced+=Math.min(.15,target.p*.025*vol);
  countries[atk].stability=clamp(countries[atk].stability-.4,12,99);countries[def].stability=clamp(countries[def].stability-.7,12,99);
  if(sA>sD*.64&&rand()<.72*vol){
   const captured=[target];let frontier=countyGraph[target.i].map(j=>territories[j]).filter(t=>t.owner===def);
   if(sA>sD*1.25&&rand()<.55)captured.push(...frontier.slice(0,Math.ceil(rand()*3)));
   for(let t of captured)t.owner=atk;invalidate();
   log(countries[atk].name+' seizes '+captured.length+' '+(captured.length>1?'counties':'county')+' around '+target.name+', '+target.state+'.','warlog');
   if(!countryStats(countries[def]).holdings.length){wars=wars.filter(x=>!x.includes(def));pacts=pacts.filter(x=>!x.includes(def));log(countries[def].name+' ceases to exist.','warlog')}
  }else if(rand()<.29)log('Battle lines hold near '+target.name+', '+target.state+'.','warlog');
 }
 for(let a of validCountries()){
  if(enemies(a.id).length>=2)continue;
  let options=validCountries().filter(b=>b.id!==a.id&&bordering(a.id,b.id)&&!alliance(a.id,b.id)&&!atWar(a.id,b.id));
  if(!options.length)continue;const b=choice(options),score=(a.aggression+.3)*(1-a.stability/170)*vol;
  if(rand()<.019*score)war(a.id,b.id);
 }
 if($('interventions').checked&&rand()<.1*vol){
  let candidates=validCountries().filter(c=>countryStats(c).holdings.length>8);
  if(candidates.length){let c=choice(candidates);
   if(c.stability<60){let h=countryStats(c).holdings,reb=choice(h),newId=countries.length;
    const n={id:newId,name:reb.name+' Provisional Government',color:palettes[newId%palettes.length],capital:reb.state,origin:reb.region,stability:50,morale:50,aggression:rand(),diplomacy:rand()};
    countries.push(n);reb.owner=newId;
    for(let j of countyGraph[reb.i])if(territories[j].owner===c.id&&rand()<.6)territories[j].owner=newId;
    invalidate();log('A separatist government emerges around '+reb.name+', '+reb.state+'.','warlog');
   }else{c.stability=clamp(c.stability-8,12,99);log('Economic unrest weakens '+c.name+'.')}
  }
 }
 if(!events.length||events[0].year!==year)log('An uneasy balance persists across the successor states.');
 invalidate();update();
}
tick=geoTick;
function geoUpdate(){
 if(!geomReady)return;const active=validCountries(),currentWar=new Set(wars.flat());
 $('yearLabel').textContent=year;$('nationCount').textContent=active.length;$('warCount').textContent=wars.length;$('allianceCount').textContent=pacts.length;$('casualtyCount').textContent=fmt(displaced,2);
 for(let i=0;i<territories.length;i++){
  const t=territories[i],c=countries[t.owner],el=countyEls[i];if(!c)continue;
  let fill=c.color;if(layer==='population'){const q=Math.log1p(t.p)/Math.log(5);fill=`hsl(38 72% ${20+clamp(q,0,1)*46}%)`}
  if(layer==='resources'){const v=clamp(Math.log1p(t.resourceOutput)/Math.log(1.6),0,1);fill=`hsl(${135-v*95} 52% ${22+v*35}%)`}
  if(layer==='stability')fill=`hsl(${c.stability*1.2} 54% 37%)`;
  el.setAttribute('fill',fill);el.classList.toggle('selected',selectedCounty===i);el.classList.toggle('inwar',currentWar.has(t.owner));
  el.setAttribute('stroke-width',countyGraph[i].some(j=>territories[j].owner!==t.owner)?'.85':'.2');
  el.setAttribute('stroke',countyGraph[i].some(j=>territories[j].owner!==t.owner)?'#071219':'#233944');
 }
 // Every country has a label. Zoom reveals small or overlapping names.
 const labelSignature=layer+'|'+active.map(c=>{const h=countryStats(c).holdings;return c.id+':'+h.length+':'+h.reduce((n,t)=>n+t.i,0)}).join('|');
 if(mapLabelSignature!==labelSignature){
  mapLabelSignature=labelSignature;labelGroup.selectAll('*').remove();
  if(layer==='political'){
   const labels=active.map(c=>{
    const hold=countryStats(c).holdings;let sx=0,sy=0,sw=0;
    for(const t of hold){const w=Math.sqrt(t.p+.005);sx+=t.cx*w;sy+=t.cy*w;sw+=w}
    const cx=sx/sw,cy=sy/sw;
    const point=hold.reduce((best,t)=>!best||Math.hypot(t.cx-cx,t.cy-cy)<best.dist?{x:t.cx,y:t.cy,dist:Math.hypot(t.cx-cx,t.cy-cy)}:best,null);
    return {name:c.name,x:point.x,y:point.y,n:hold.length};
   }).sort((a,b)=>b.n-a.n);
   const positioned=[];
   for(const x of labels){
    const overlapping=positioned.some(p=>Math.abs(p.x-x.x)<Math.max(40,Math.min(90,x.name.length*4))&&Math.abs(p.y-x.y)<15);
    const minZoom=overlapping?3.2:x.n<3?2.6:x.n<8?2.1:x.n<18?1.5:1;
    labelGroup.append('text').attr('class','nation-label').attr('x',x.x).attr('y',x.y).attr('data-minzoom',minZoom).text(x.name.toUpperCase());
    if(minZoom<=1.5)positioned.push(x);
   }
  }
  refreshLabelVisibility();
 }
 if(selectedCounty!==null){
  const t=territories[selectedCounty],c=countries[t.owner];$('mapFooter').textContent=t.name+' County, '+names[t.state]+' · '+Math.round(t.p*1e6).toLocaleString('en-US')+' residents (simulated) · '+c.name;
  renderGeoInspector(c,t);
 }else{$('mapFooter').textContent='Hover or click any county to inspect its successor country.';$('countryRank').textContent='SELECT A COUNTY';$('inspect').innerHTML='<div class="empty"><div>⌖</div><p>Choose a county to inspect its country and strategic position.</p></div>'}
 $('events').innerHTML=events.slice(0,28).map(e=>`<div class="event ${e.type}"><time>${e.year}</time><span>${e.msg}</span></div>`).join('');
 $('rankings').innerHTML=active.sort((a,b)=>power(b)-power(a)).slice(0,7).map((c,i)=>`<div class="rankrow"><span class="num">${String(i+1).padStart(2,'0')}</span><span class="swatch" style="background:${c.color}"></span><span>${c.name}</span><strong>${Math.round(power(c))}</strong></div>`).join('');
}
update=geoUpdate;
function renderGeoInspector(c,t){
 const st=countryStats(c),rank=validCountries().sort((a,b)=>power(b)-power(a)).findIndex(x=>x.id===c.id)+1;
 $('countryRank').textContent='#'+rank+' POWER';
 const allied=pacts.filter(p=>p.includes(c.id)).map(p=>countries[p[0]===c.id?p[1]:p[0]].name),foes=enemies(c.id).map(i=>countries[i].name);
 const ideologyInfo=typeof ideologies!=='undefined'?(ideologies[c.ideology]||ideologies.republicanism):null;
 $('inspect').innerHTML=`<div class="flagline"><div class="flag" style="background:${c.color}"></div><div><h3>${c.name}</h3><small>Founded near ${names[c.capital]} · ${st.holdings.length} counties</small></div></div>
 <div class="metricrow"><div class="metric"><span>Power</span><strong>${Math.round(st.power)}</strong></div><div class="metric"><span>Stability</span><strong>${Math.round(c.stability)}/100</strong><div class="bar"><i style="width:${c.stability}%"></i></div></div></div>
 <div class="diplomacy"><b>Ideology:</b> ${ideologyInfo?.label||'Unspecified'}<br><b>Allies:</b> ${allied.join(', ')||'None'}<br><b>Wars:</b> ${foes.join(', ')||'None'}</div>`;
}
// Load local, checked-in geographic data. The rest of the UI waits for it.
document.getElementById('map').innerHTML='<div class="map-loading">LOADING COUNTY GEOGRAPHY…</div>';
Promise.all([window.HOUSE_DIVIDED_COUNTIES?Promise.resolve(window.HOUSE_DIVIDED_COUNTIES):fetch('counties.geojson').then(r=>{if(!r.ok)throw Error(r.status);return r.json()}),
             window.HOUSE_DIVIDED_DEMOGRAPHICS?Promise.resolve(window.HOUSE_DIVIDED_DEMOGRAPHICS):fetch('county-demographics.json').then(r=>{if(!r.ok)throw Error(r.status);return r.json()})])
 .then(([data,demographics])=>initGeometry(data,demographics))
 .catch(err=>{document.getElementById('map').innerHTML='<div class="map-loading">Map data could not load. Refresh to retry.</div>';console.error('Geographic data error',err)});
