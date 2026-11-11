/* ClueBugle strategic bot v2.
 * Two independent steps: construct a human-readable association graph; then
 * predict what a guesser can plausibly recover from the public 25-card board.
 * No team colors are ever read by the guessing function.
 */
const CB_CONCEPTS={
  wildlife:'animals birds mammals pets farm fish reptiles insects wilderness',
  creatures:'animals birds mammals pets farm fish reptiles insects',
  outdoors:'nature garden gardening wilderness camping climbing tropical geography',
  landscape:'nature geography geology wilderness gardening mountains',
  voyage:'ocean seafaring travel transport navigation vacation aviation',
  explorer:'travel navigation seafaring geography camping climbing space',
  cosmos:'space astronomy physics mythology',
  laboratory:'chemistry physics biology medicine technology robotics',
  discovery:'science archaeology history astronomy biology chemistry physics',
  science:'astronomy physics chemistry biology medicine geology technology',
  machinery:'tools mechanics electricity robotics construction vehicles',
  workshop:'tools construction mechanics technology electricity',
  engine:'transport aviation vehicles mechanics robotics',
  electronics:'technology electricity internet robotics communication',
  civilization:'history ancient medieval politics law buildings cities',
  empire:'royalty ancient medieval history politics military',
  monarchy:'royalty medieval',
  battlefield:'military ancient medieval history fire',
  justice:'law politics occupations history',
  society:'politics economics business occupations communication law religion',
  culture:'art literature music theater cinema dancing painting language',
  performance:'theater cinema music dancing athletics',
  orchestra:'music instruments theater dancing',
  gallery:'art painting photography cinema',
  literature:'literature language school history',
  classroom:'school language literature biology physics chemistry',
  cuisine:'food cooking kitchen dinner breakfast produce fruits desserts drinks',
  meal:'food dinner breakfast kitchen cooking',
  harvest:'farm gardening garden fruits produce cooking',
  home:'household furniture kitchen garden textiles pets',
  household:'household furniture kitchen construction textiles garden',
  clothing:'clothes fashion textiles jewelry',
  luxury:'jewelry gemstones royalty money fashion',
  treasure:'gemstones metals money jewelry royalty pirate',
  wealth:'money economics business gemstones metals royalty',
  competition:'sport games athletics ballgames',
  athlete:'sport athletics ballgames climbing',
  recreation:'games sport camping vacation climbing',
  holiday:'vacation festivals food music events',
  festival:'festivals events music dancing food',
  fantasy:'fantasy magic mythology horror royalty',
  mystery:'mysteries horror mythology archaeology',
  danger:'fire weather horror military',
  weather:'weather seasons winter tropical',
  winter:'winter weather seasons',
  marine:'ocean fish seafaring animals',
  flight:'aviation birds space',
  river:'ocean geography garden nature fish',
  desert:'geography geology wilderness tropical',
  forest:'nature garden wilderness birds mammals',
  building:'buildings construction cities furniture',
  movement:'travel transport vehicles roads athletics dancing',
  language:'language literature communication school',
  clockwork:'time mechanics electricity',
  romance:'emotions jewelry literature music events',
  childhood:'school games pets toys',
  anatomy:'anatomy biology medicine animals',
  religion:'religion medieval history mythology',
  ancient:'ancient archaeology history mythology',
  navigation:'navigation roads seafaring travel aviation',
  agriculture:'farm gardening garden produce fruits',
  geology:'geology geography metals gemstones',
  color:'colors art painting fashion',
  shape:'shapes geometry',
  level:'construction buildings geography shapes',
  ground:'construction buildings geography nature'
};
const CB_MEMBER=new Map();
for(const [category,words] of Object.entries(CATEGORIES))for(const word of words){
  if(!CB_MEMBER.has(word))CB_MEMBER.set(word,new Set());
  CB_MEMBER.get(word).add(category);
}
for(const [word,extras] of Object.entries(EXTRA_SENSES)){
  if(!CB_MEMBER.has(word))CB_MEMBER.set(word,new Set());
  extras.forEach(x=>CB_MEMBER.get(word).add(x));
}
// Category lists describe where a word was introduced, not every biological
// fact about it. Pets such as ferrets, cats and dogs are mammals too, while
// a goldfish is not. Propagate the actual taxonomic parent separately.
const CB_PET_MAMMALS='DOG CAT PUPPY KITTEN HAMSTER GERBIL FERRET'.split(' ');
for(const word of CB_PET_MAMMALS){
  if(!CB_MEMBER.has(word))CB_MEMBER.set(word,new Set());
  CB_MEMBER.get(word).add('mammals');
}
// Materials and finished objects are often in separate vocabulary buckets.
// A human connects a sapphire to a locket through jewelry, and a piece of
// pottery to a vase or clay without thinking about an academic discipline.
for(const word of 'RUBY EMERALD SAPPHIRE OPAL JADE AMETHYST TOPAZ GARNET ONYX TURQUOISE DIAMOND'.split(' ')){
  if(!CB_MEMBER.has(word))CB_MEMBER.set(word,new Set());
  CB_MEMBER.get(word).add('jewelry');
}
// Gravity is physics as well as astronomy; otherwise a perfectly ordinary
// clue like PHYSICS for FORCE+GRAVITY was scored as only one strong match.
if(!CB_MEMBER.has('GRAVITY'))CB_MEMBER.set('GRAVITY',new Set());
CB_MEMBER.get('GRAVITY').add('physics');
// Muffins are routinely breakfast food, even if a bakery might sell a sweet
// muffin as dessert. Don't present DESSERT as its best defining clue.
CB_MEMBER.get('MUFFIN')?.add('breakfast');
const CB_CANDIDATES=new Map();
const CB_EXPLICIT=new Map();
const CB_ASSOC_WEIGHT=new Map();
const CB_ASSOCIATED=new Map();
// Related products and uses are genuine semantic links, not merely category
// membership: wool/cotton are materials, while clothes are made from them.
// Keep these secondary relationships slightly weaker than direct members so
// the guesser still favors the clearest matches first.
const CB_MADE_FROM={
  FABRIC:'DRESS JACKET COAT SCARF GLOVE SOCK SHIRT SKIRT BLOUSE SWEATER HOODIE JEANS TROUSERS TUXEDO TIE VEST CURTAIN QUILT BLANKET PILLOW',
  WOOD:'CHAIR TABLE DESK SHELF CABINET DOOR BARN CABIN PENCIL',
  PAPER:'BOOK LETTER ENVELOPE POSTCARD NEWSPAPER MAGAZINE NOTEBOOK MAP',
  METAL:'SWORD KNIFE HAMMER NAIL WRENCH SCREW GEAR ENGINE CAR',
  GLASS:'WINDOW MIRROR LENS BOTTLE BEAKER FLASK',
  LEATHER:'BOOT BELT JACKET SHOE GLOVE WALLET',
  COTTON:'CLOTHES SHIRT SOCK TOWEL QUILT PILLOW',
  WOOL:'CLOTHES SWEATER SCARF COAT MITTEN BLANKET',
  FLOUR:'BREAD CAKE COOKIE PIZZA PANCAKE WAFFLE PASTA',
  MILK:'CHEESE BUTTER YOGURT ICECREAM CUSTARD',
  IRON:'SWORD NAIL HAMMER GEAR ENGINE BRIDGE',
  PLASTIC:'BOTTLE TOY BUCKET KEYBOARD CONTAINER'
};
const CB_SECONDARY=new Map(Object.entries(CB_MADE_FROM).map(([clue,line])=>[clue,new Set(line.split(' '))]));
for(const [clue,line] of Object.entries(CB_BRIDGES)){
  // Compounds written as two words or normally hyphenated are not legal
  // classic Codenames clues; do not silently join their components.
  if(['CROSSCOUNTRY','WINTERSPORT','WATERSPORT','ROADTRIP'].includes(clue))continue;
  const listed=line.split(' ').filter(Boolean);
  const words=new Set(listed);
  CB_EXPLICIT.set(clue,words);
  // A list's first associations are the characteristic meaning; later ones
  // are related context. Flat .93 for every item made loose incidental links
  // look indistinguishable from the obvious intended answers.
  listed.forEach((word,i)=>{
    const weight=i<2?.96:i<4?.89:i<7?.81:.72;
    CB_ASSOC_WEIGHT.set(clue+'|'+word,Math.max(weight,CB_ASSOC_WEIGHT.get(clue+'|'+word)||0));
    if(!CB_ASSOCIATED.has(word))CB_ASSOCIATED.set(word,new Set());
    CB_ASSOCIATED.get(word).add(clue);
  });
}
// Direct everyday associations beat generic topic membership. A keyboard
// suggests the alphabet, and a camera suggests focus; neither should be
// treated as an equally good synonym for arbitrary computer equipment.
const CB_HUMAN_LINKS={
  KEYBOARD:'ALPHABET LETTER TYPE TYPING KEY COMPUTER',
  CAMERA:'FOCUS LENS PHOTO PHOTOGRAPH PICTURE FLASH FILM',
  COMPUTER:'SERVER PORT KEYBOARD MOUSE SCREEN SOFTWARE',
  COMPUTING:'SERVER PORT COMPUTER CODE SOFTWARE',
  NETWORK:'SERVER PORT ROUTER WIFI INTERNET',
  SERVER:'COMPUTER PORT NETWORK INTERNET WEBSITE',
  PORT:'HARBOR SHIP DOCK SERVER COMPUTER NETWORK',
  JEWELRY:'LOCKET SAPPHIRE RUBY EMERALD DIAMOND NECKLACE PENDANT RING BRACELET',
  GEMSTONE:'SAPPHIRE RUBY EMERALD OPAL JADE DIAMOND LOCKET RING PENDANT',
  GEM:'SAPPHIRE RUBY EMERALD OPAL JADE DIAMOND LOCKET RING PENDANT',
  POTTERY:'CLAY VASE CERAMIC CERAMICS KILN POT BOWL ARCHAEOLOGY',
  CERAMIC:'POTTERY CLAY VASE KILN POT BOWL',
  CERAMICS:'POTTERY CLAY VASE KILN POT BOWL',
  CLAY:'POTTERY VASE CERAMIC CERAMICS KILN POT BOWL',
  VASE:'POTTERY CLAY FLOWER CERAMIC CERAMICS',
  DISCOVERY:'BINOCULARS TELESCOPE EXPLORER EXPLORATION SCIENCE EXCAVATION ARCHAEOLOGY',
  PHYSICS:'FORCE GRAVITY MASS ENERGY FRICTION INERTIA ATOM PARTICLE',
  GRAVITATION:'GRAVITY FORCE MASS PLANET MOON',
  RODENT:'GERBIL HAMSTER MOUSE SQUIRREL CHIPMUNK BEAVER'
};
for(const [clue,line] of Object.entries(CB_HUMAN_LINKS)){
  if(!CB_EXPLICIT.has(clue))CB_EXPLICIT.set(clue,new Set());
  for(const word of line.split(' ')){
    CB_EXPLICIT.get(clue).add(word);
    CB_ASSOC_WEIGHT.set(clue+'|'+word,Math.max(.93,CB_ASSOC_WEIGHT.get(clue+'|'+word)||0));
    if(!CB_ASSOCIATED.has(word))CB_ASSOCIATED.set(word,new Set());
    CB_ASSOCIATED.get(word).add(clue);
  }
}
// Close-but-not-literal analogies can be reasonable *second* guesses without
// corrupting taxonomy: a skunk is a mammal, not a rodent.
const CB_NEAR_ASSOCIATIONS=new Map([
  ['RODENT',new Map([['SKUNK',.48],['RACCOON',.40],['BADGER',.39]])],
  ['RODENTS',new Map([['SKUNK',.48],['RACCOON',.40],['BADGER',.39]])]
]);
// Do not conflate an edible item with the *process* of preparing it. This was
// causing EDIBLE to rank STEAM above TOAST because both belong to the broad
// food world. Classify foods by what can actually be eaten.
const CB_EDIBLE_ITEMS=new Set(['food','breakfast','dinner','produce','fruits','desserts','drinks'].flatMap(t=>CATEGORIES[t]||[]));
const CB_COOKING_ACTIONS=new Set(CATEGORIES.cooking||[]);
for(const [clue,words] of CB_SECONDARY)for(const word of words){
  if(!CB_ASSOCIATED.has(word))CB_ASSOCIATED.set(word,new Set());
  CB_ASSOCIATED.get(word).add(clue);
}
// Remove the common wording shared by every embedding prompt. Without this,
// unrelated cards inherit artificial cosine similarity from the repeated
// phrase "meaning associated with".
const CB_CENTERED={words:new Map(),clues:new Map()};
if(PRETRAINED?.words&&PRETRAINED?.clues){
  const senses=Object.values(PRETRAINED.words).flat();
  const dim=senses[0]?.vec.length||0;
  const mean=new Float64Array(dim);
  for(const s of senses)for(let i=0;i<dim;i++)mean[i]+=s.vec[i]/senses.length;
  for(const group of ['words','clues'])for(const [word,list] of Object.entries(PRETRAINED[group])){
    CB_CENTERED[group].set(word,list.map(s=>{
      const centered=s.vec.map((x,i)=>x-mean[i]);
      const magnitude=Math.hypot(...centered)||1;
      return{v:centered.map(x=>x/magnitude),weight:s.weight};
    }));
  }
}
function cbDense(clue,word){
  const a=CB_CENTERED.clues.get(clue),b=CB_CENTERED.words.get(word);
  if(!a||!b)return 0;
  let best=0;
  for(const x of a)for(const y of b){
    let dot=0;for(let i=0;i<x.v.length;i++)dot+=x.v[i]*y.v[i];
    best=Math.max(best,dot*x.weight*y.weight);
  }
  return best;
}
function cbAddClue(name,categories,source){
  name=name.toUpperCase();
  if(!/^[A-Z]+$/.test(name))return;
  const tags=[...new Set(categories)].filter(x=>CATEGORIES[x]);
  if(!tags.length)return;
  if(!CB_CANDIDATES.has(name))CB_CANDIDATES.set(name,{name,tags:new Set(),source});
  const entry=CB_CANDIDATES.get(name);
  tags.forEach(x=>entry.tags.add(x));
}
for(const [category,words] of Object.entries(CATEGORIES)){
  cbAddClue(category,[category],'specific');
  for(const alias of CLUE_SYNONYMS[category]||[])cbAddClue(alias,[category],'specific');
}
for(const [name,description] of Object.entries(CB_CONCEPTS)){
  cbAddClue(name,description.split(' '),'concept');
}
// Taxonomic parents must include their children. FOX is a mammal and KITTEN
// is a pet, but both are unambiguously ANIMALS, not separate unrelated ideas.
for(const name of ['animal','animals','fauna','wildlife','creature','creatures'])
  cbAddClue(name,['animals','birds','mammals','pets','farm','fish','reptiles','insects'],'concept');
cbAddClue('mammal',['mammals'],'specific');
cbAddClue('pet',['pets'],'specific');
// Concrete analogies are often better than abstract category labels. We only
// offer them where we actually know a subject area for the clue word.
for(const clue of WORDS){
  const tags=CB_MEMBER.get(clue);
  if(tags?.size)cbAddClue(clue,tags,'analogy');
}
// A concept need not appear on the board to be a legal clue. This allows
// cross-category connections such as TOURING for HIGHWAY and SKI.
for(const [clue,words] of CB_EXPLICIT){
  const tags=new Set();
  for(const word of words)for(const t of CB_MEMBER.get(word)||[])tags.add(t);
  CB_CANDIDATES.set(clue,{name:clue,tags,source:'bridge'});
}
for(const [clue,words] of CB_SECONDARY){
  if(CB_CANDIDATES.has(clue))continue;
  const tags=new Set();
  for(const word of words)for(const t of CB_MEMBER.get(word)||[])tags.add(t);
  CB_CANDIDATES.set(clue,{name:clue,tags,source:'bridge'});
}
const CB_SCORE_CACHE=new Map();
function cbSimilarity(clue,word){
  const key=clue+'|'+word;
  if(CB_SCORE_CACHE.has(key))return CB_SCORE_CACHE.get(key);
  const score=cbSimilarityUncached(clue,word);
  CB_SCORE_CACHE.set(key,score);
  return score;
}
function cbSimilarityUncached(clue,word){
  if((clue==='DESSERT'||clue==='DESSERTS')&&word==='MUFFIN')return .12;
  if(clue==='EDIBLE'||clue==='FOOD'){
    if(CB_EDIBLE_ITEMS.has(word))return .88;
    if(CB_COOKING_ACTIONS.has(word))return .08;
  }
  const item=CB_CANDIDATES.get(clue);
  if(!item)return semanticSimilarity(clue,word);
  if(CB_EXPLICIT.get(clue)?.has(word))return CB_ASSOC_WEIGHT.get(clue+'|'+word)||.93;
  if(CB_SECONDARY.get(clue)?.has(word))return .79;
  const nearby=CB_NEAR_ASSOCIATIONS.get(clue)?.get(word);
  if(nearby!=null)return nearby;
  if(item.source==='bridge')return Math.max(0,cbDense(clue,word))*.42;
  const wordTags=CB_MEMBER.get(word)||new Set();
  let direct=0,related=0;
  for(const tag of item.tags){
    if(wordTags.has(tag)){direct=1;break;}
    if([...wordTags].some(x=>SEMANTIC_SUPER[x]&&SEMANTIC_SUPER[x]===SEMANTIC_SUPER[tag]))related=1;
  }
  // Distinguish a very specific clue from an abstract, wide-ranging one.
  const specificity=item.tags.size===1?1:item.tags.size<=3?.94:item.tags.size<=6?.88:.82;
  // A shared *broad* category is not itself a strong word association.
  // Previously KEYBOARD, CAMERA, PORT and SERVER all got a flat .83 because
  // they share 'technology'. This made misleading clues look perfectly safe.
  // Category labels are broad; concepts that span many categories are even
  // broader. Never award the same near-certain score to every member of a
  // loose topic (CULTURE, NATURE, SCIENCE, TECHNOLOGY, etc.).
  const base=direct?(item.source==='analogy'?.35:item.source==='concept'?.51:.79):related?.20:0;
  // Raw pretrained cosine is supplementary, not proof of an association.
  const embed=cbDense(clue,word);
  const association=Math.max(0,embed)*.95;
  // A concrete analogy may connect two words from different categories:
  // JUICE -> LEMON and APPLE, for example.
  if(item.source==='analogy'&&association>.52)
    return Math.min(.75,Math.max(base*specificity,association+.11));
  if(base){
    const bonus=Math.max(0,embed)*(item.source==='concept'?.16:item.source==='analogy'?.22:.095);
    return Math.min(item.source==='specific'?.92:.77,base*specificity+bonus);
  }
  return Math.min(.30,Math.max(0,embed)*.55);
}
function cbRank(g,clue){
  return g.words.map((word,i)=>({word,i,key:g.keys?.[i],s:cbSimilarity(clue,word)}))
    .filter(x=>!g.revealed[x.i]).sort((a,b)=>b.s-a.s||a.i-b.i);
}
function cbLegalClue(clue,board){
  if(!/^[A-Z]+$/.test(clue)||clue==='SERVO'||board.has(clue))return false;
  // A clue may not be a board word, its simple inflection, or a compound
  // that literally contains a visible word as a component.
  const singular=x=>x.endsWith('IES')?x.slice(0,-3)+'Y':x.endsWith('ES')?x.slice(0,-2):x.endsWith('S')?x.slice(0,-1):x;
  return ![...board].some(w=>singular(w)===singular(clue)||
    (w.length>=4&&(clue.startsWith(w)||clue.endsWith(w))));
}
// Approximate a human guesser's first few choices under small variations in
// interpretation. The guesser never receives team colors: only the spymaster
// uses them here to value the outcomes of possible guesses.
function cbPredict(rank,team,n,urgency,seed){
  const ordered=rank.map((x,i)=>({...x,expected:x.s+
    ((Math.sin((i+1)*17.13+(seed+1)*9.71)+Math.cos((i+1)*3.79+seed*11.23))*.018)}))
    .sort((a,b)=>b.expected-a.expected);
  let got=0,penalty=0;
  for(let i=0;i<Math.min(n,ordered.length);i++){
    const card=ordered[i];
    if(card.key===team){got++;continue}
    penalty=card.key==='assassin'?120:card.key==='neutral'?12:21;
    break;
  }
  const all=got===n;
  return got*(16+urgency*3)+(all&&n>1?9+n*4:0)-penalty;
}
function nonteamInPrefix(rank,n,team){return rank.slice(0,n).some(x=>x.key!==team)}
function cbClue(g,team,level){
  const {urgency,ours,theirs}=aiSituation(g,team);
  const lastChance=theirs===1&&ours>1;
  const banned=new Set(g.log.filter(s=>s.startsWith(team.toUpperCase()+' clue: '))
    .map(s=>s.split(' clue: ')[1]?.split(' ')[0]));
  const pastClueNumbers=g.log.filter(s=>s.startsWith(team.toUpperCase()+' clue: '))
    .map(s=>Number(s.match(/ (\d+)$/)?.[1]));
  let singleStreak=0;
  // Game log is newest-first (unshift), so read the most recent clues first.
  for(let i=0;i<pastClueNumbers.length&&pastClueNumbers[i]===1;i++)singleStreak++;
  let recent=[];
  try{recent=JSON.parse(localStorage.getItem('cb_recent_clues')||'[]')}catch{}
  if(!Array.isArray(recent))recent=[];
  // Strong no-repeat window across matches, with an escape hatch for boards
  // on which every sensible clue has already been used.
  const recency=new Map(recent.map((word,i)=>[word,i]));
  const onBoard=new Set(g.words);
  let best=null,emergency=null,streakPair=null;
  const alternatives=new Map(),comebackAlternatives=new Map();
  // Start from pairs of friendly cards and find shared concepts for each pair.
  // Also retain every general candidate so singletons and unseen bridges
  // remain available on unusually difficult boards.
  const friendly=g.words.filter((w,i)=>g.keys[i]===team&&!g.revealed[i]);
  const groupCandidates=new Set();
  for(let i=0;i<friendly.length;i++)for(let j=i+1;j<friendly.length;j++){
    const a=CB_ASSOCIATED.get(friendly[i]),b=CB_ASSOCIATED.get(friendly[j]);
    if(a&&b)for(const name of a)if(b.has(name))groupCandidates.add(name);
  }
  const orderedCandidates=[...groupCandidates,...[...CB_CANDIDATES.keys()].filter(c=>!groupCandidates.has(c))];
  for(const clue of orderedCandidates){
    const metadata=CB_CANDIDATES.get(clue);
    if(!cbLegalClue(clue,onBoard)||banned.has(clue))continue;
    const rank=cbRank(g,clue);
    if(!rank.length||rank[0].s<.30)continue;
    // If the bot has already wasted two turns on single clues, search a wider
    // set of lower-confidence pairs. This is deliberately more adventurous
    // but never knowingly includes a non-team card in the announced pair.
    if(ours>=3&&rank.length>=2&&rank[0].key===team&&rank[1].key===team&&rank[1].s>=.12){
      const danger=rank.find(x=>x.key!==team);
      const gap=rank[1].s-(danger?.s||0);
      const assassinClose=danger?.key==='assassin'&&gap<.14;
      const safe=gap>=.075&&!assassinClose;
      const score=rank[0].s+rank[1].s+Math.max(-.5,gap)*2;
      if(safe&&(!streakPair||score>streakPair.score))streakPair={word:clue,n:2,score};
    }
    if(lastChance){
      // If the enemy needs only one card, playing a cautious single is often
      // equivalent to conceding. Announce all our remaining cards and choose
      // the best available ranking, even if it involves a real stretch.
      const target=rank.slice(0,ours);
      const hits=target.filter(x=>x.key===team).length;
      const assassin=target.some(x=>x.key==='assassin');
      const wrong=target.filter(x=>x.key!==team).length;
      const score=hits*32-wrong*22-(assassin?170:0)
        +target.filter(x=>x.key===team).reduce((s,x)=>s+x.s*8,0)
        -(recency.has(clue)?200:0);
      comebackAlternatives.set(clue,{word:clue,n:ours,score,hits,risk:wrong});
      if(!emergency||score>emergency.score)emergency={word:clue,n:ours,score};
    }
    const cap=Math.min(6,ours);
    for(let n=1;n<=cap;n++){
      const selected=rank.slice(0,n),last=selected[n-1];
      const hits=selected.filter(x=>x.key===team).length;
      if(hits===0)continue;
      // Never intentionally point a player at an opponent, bystander, or
      // assassin. Emergency do-or-die plays are handled separately above.
      if(nonteamInPrefix(rank,n,team))continue;
      // Normal turns should not promise cards that our own guesser would
      // clearly pass over, but when behind allow plausible risky stretches.
      // A second plausible card is worth pursuing early. The old .43 cutoff
      // rejected many thematic pairings before the spymaster even evaluated
      // the risk from the *rest of the board*.
      if(n>1&&(last.s<(singleStreak>=1?.095:.12)||rank[0].s<.33))continue;
      const next=rank[n];
      let simulated=0;
      for(let seed=0;seed<7;seed++)simulated+=cbPredict(rank,team,n,urgency,seed)/7;
      const nonteam=selected.filter(x=>x.key!==team);
      const nearby=rank.filter(x=>x.key!==team&&x.s>=last.s-.10);
      if(n>1&&nearby.some(x=>x.key==='assassin'&&x.s>=last.s-.035))continue;
      const margin=next?last.s-next.s:.15;
      const certainty=selected.filter(x=>x.key===team).reduce((s,x)=>s+x.s,0);
      const lenPenalty=metadata.source==='concept'?Math.max(0,metadata.tags.size-5)*.5:0;
      const early=ours>=6?1:ours>=4?.60:.20;
      const score=simulated+certainty*6+Math.min(.18,margin)*24
        -nonteam.reduce((s,x)=>s+(x.key==='assassin'?130:18),0)
        -nearby.reduce((s,x)=>s+(x.key==='assassin'?65:x.key===team?0:8),0)
        -(n===1&&ours>=4?44+singleStreak*23:n===1&&ours>=2?15+singleStreak*24:0)
        +(n>=2&&nonteam.length===0?Math.min(150,(n-1)*(43+early*14)+(ours>=5?12:0)+singleStreak*19):0)-lenPenalty
        // For a single remaining target, a category name is clearer than
        // naming another member of that category. DOG is a poor instruction
        // for FERRET even when their category embeddings are close.
        -(ours===1&&metadata.source==='analogy'?18:0)
        +(ours===1&&metadata.source==='specific'?6:0)
        -(recency.has(clue)?200:0)
        +(Math.random()-.5)*(level==='hard'?.3:level==='medium'?1.5:3);
      if(!alternatives.has(clue)||alternatives.get(clue).score<score)
        alternatives.set(clue,{word:clue,n,score,hits,risk:nonteam.length});
      if(!best||score>best.score)best={word:clue,n,score};
    }
  }
  const attachAudit=(choice,pool)=>({word:choice.word,n:choice.n,audit:{utility:choice.score,
    choices:[...pool.values()].sort((a,b)=>b.score-a.score).slice(0,7)}});
  if(lastChance&&emergency)return attachAudit(emergency,comebackAlternatives);
  if(singleStreak>=1&&ours>=3&&best?.n===1&&streakPair){
    return attachAudit(streakPair,alternatives);
  }
  return best?attachAudit(best,alternatives):semanticClue(g,team,level);
}
function cbGuess(g,team,level){
  const ranked=cbRank(g,g.clue.word);
  if(!ranked.length)return null;
  if(g.carryEnabled&&g.guesses>=g.clue.n&&g.clue.n!==0){
    const earlier=(g.priorClues?.[team]||[]).slice(0,4);
    for(const x of ranked){
      const remembered=earlier.reduce((highest,old)=>Math.max(highest,cbSimilarity(old.word,x.word)),0);
      x.s=Math.max(x.s*.90,remembered*.94);
    }
    ranked.sort((a,b)=>b.s-a.s);
  }
  const noise=level==='hard'?.009:level==='medium'?.04:.085;
  ranked.forEach(x=>x.adjusted=x.s+(Math.random()-.5)*noise);
  ranked.sort((a,b)=>b.adjusted-a.adjusted);
  const first=ranked[0],second=ranked[1];
  const margin=first.s-(second?.s||0);
  return{i:first.i,related:first.s>.37,confidence:Math.max(0,Math.min(1,(first.s-.27)*1.55+Math.max(0,margin)*.7)),sim:first.s,margin};
}
aiClue=cbClue;
aiGuess=cbGuess;
aiShouldContinue=function(g,team,level,choice){
  if(!choice)return false;
  const {urgency,theirs}=aiSituation(g,team);
  if(g.guesses>=guessLimit(g))return false;
  if(theirs===1)return true; // There may not be another turn.
  // If the human gave a clue for two or more and the next card is a credible,
  // distinct match, the bot should take the intended next guess. The former
  // confidence cutoff made it pass on obvious second answers too often.
  if(g.guesses<g.clue.n&&choice.sim>=.34&&choice.margin>=.07)return true;
  const bonus=g.clue.n!==0&&g.guesses>=g.clue.n;
  const cutoff=(level==='hard'?.34:level==='medium'?.29:.24)
    +(bonus?.26:0)+Math.max(0,g.guesses-1)*.025-urgency*.025;
  return choice.related&&choice.confidence>=cutoff;
};
