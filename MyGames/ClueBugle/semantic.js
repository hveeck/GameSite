/*
 * Offline multi-sense semantic vectors for ClueBugle.
 * These are explicit semantic-feature embeddings, NOT pretrained model weights.
 * Each word may have multiple senses, compared independently by cosine score.
 * Clue candidates are evaluated against all 25 cards, not just friendly words.
 */
const SEMANTIC_SUPER={
  ocean:'water',fish:'water',seafaring:'water',geography:'land',nature:'land',gardening:'land',garden:'land',wilderness:'land',tropical:'land',geology:'land',weather:'climate',winter:'climate',seasons:'climate',
  royalty:'history',history:'history',ancient:'history',medieval:'history',archaeology:'history',politics:'society',law:'society',religion:'society',economics:'society',business:'society',
  animals:'animal',birds:'animal',mammals:'animal',pets:'animal',farm:'animal',reptiles:'animal',insects:'animal',
  music:'culture',instruments:'culture',dancing:'culture',theater:'culture',cinema:'culture',literature:'culture',language:'culture',art:'culture',painting:'culture',photography:'culture',
  sport:'sports',athletics:'sports',ballgames:'sports',games:'sports',
  kitchen:'food',food:'food',breakfast:'food',dinner:'food',produce:'food',fruits:'food',desserts:'food',drinks:'food',cooking:'food',
  technology:'engineering',robotics:'engineering',electricity:'engineering',mechanics:'engineering',internet:'engineering',tools:'engineering',construction:'engineering',
  space:'science',astronomy:'science',physics:'science',chemistry:'science',biology:'science',anatomy:'science',medicine:'science',medicine2:'science',
  travel:'transport',transport:'transport',vehicles:'transport',aviation:'transport',roads:'transport',navigation:'transport',vacation:'transport',
  clothes:'personal',fashion:'personal',jewelry:'personal',textures:'personal',textiles:'personal',furniture:'home',household:'home',buildings:'home',
  fantasy:'imagination',magic:'imagination',horror:'imagination',mythology:'imagination',mysteries:'imagination',
  money:'commerce',communication:'society',occupations:'people',events:'people',festivals:'people',cities:'places',shapes:'abstract',colors:'abstract',time:'abstract',emotions:'abstract'
};
const EXTRA_SENSES={
  BANK:['geography','water'],MOUSE:['technology','engineering'],CURRENT:['electricity','physics'],
  SPRING:['mechanics','engineering','water'],BAT:['animals','mammals','ballgames'],BARK:['animals','nature'],JAM:['music','transport'],
  RING:['jewelry','sport','sound'],MATCH:['sport','fire','games'],LIGHT:['electricity','physics','fire'],CRANE:['birds','construction'],
  SEAL:['animals','mammals','law'],STOCK:['economics','food'],PITCH:['sport','music'],PALM:['anatomy','tropical'],
  WAVE:['ocean','physics','communication'],SHARK:['money','business'],SCALE:['music','physics','animals'],
  BRIDGE:['music','transport','buildings'],COURT:['sport','royalty','law'],STAR:['cinema','music','astronomy'],
  CAP:['clothes','sports'],DATE:['time','fruits','events'],MINT:['food','money'],KEY:['music','mysteries','tools'],
  PLANE:['aviation','geometry','tools'],ROCK:['geology','music'],TRAIN:['transport','education'],
  CHARGE:['electricity','law','economics'],ORGAN:['anatomy','music'],CELL:['biology','prison','electricity'],
  CANVAS:['art','seafaring'],SHOT:['sport','medicine','photography'],SCORE:['music','sport','games'],
  TRACK:['sport','transport','music'],FAN:['sport','electricity'],SCREEN:['technology','cinema'],
  TIE:['fashion','sports'],ARM:['anatomy','military'],FOOT:['anatomy','sport'],ROOT:['garden','language','math'],
  LEAF:['garden','literature'],PEN:['school','farm'],PORT:['seafaring','technology'],CROWN:['royalty','anatomy']
};
const CLUE_SYNONYMS={
  ocean:['marine','seaside','nautical'],pets:['domestic','companion'],royalty:['regal','monarchy'],
  music:['musical','melody'],nature:['outdoors','wilderness'],animals:['fauna','wildlife'],
  insects:['bugs','arthropod'],reptiles:['coldblooded','herpetology'],technology:['digital','computing'],
  medicine:['medical','healthcare'],sport:['athletic','competition'],food:['cuisine','edible'],
  history:['historical','antiquity'],space:['cosmic','celestial'],money:['financial','wealth'],
  travel:['journey','voyage'],garden:['botanical','flora'],weather:['meteorology','climate'],
  fire:['burning','flames'],law:['legal','justice'],art:['artistic','creative'],
  kitchen:['culinary','cookery'],school:['education','academic'],fantasy:['mythical','fictional'],
  clothing:['fashion','apparel'],birds:['avian','feathered'],mammals:['mammalian','furry'],
  chemistry:['chemical','laboratory'],physics:['physical','scientific'],geography:['terrain','landscape']
};
const SEMANTIC_FEATURES=new Map();
function featureId(f){if(!SEMANTIC_FEATURES.has(f))SEMANTIC_FEATURES.set(f,SEMANTIC_FEATURES.size);return SEMANTIC_FEATURES.get(f)}
function senseVector(tags){const v=new Map();for(const tag of tags){
  v.set(featureId('specific:'+tag),(v.get(featureId('specific:'+tag))||0)+2.5);
  const broad=SEMANTIC_SUPER[tag];if(broad)v.set(featureId('broad:'+broad),(v.get(featureId('broad:'+broad))||0)+.75);
}const norm=Math.sqrt([...v.values()].reduce((s,n)=>s+n*n,0))||1;return new Map([...v].map(([k,n])=>[k,n/norm]))}
function cosine(a,b){let sum=0;for(const [k,v] of a)sum+=v*(b.get(k)||0);return sum}
function getWordSenses(word){
  const memberships=Object.entries(CATEGORIES).filter(([,list])=>list.includes(word)).map(([category])=>category);
  const extras=EXTRA_SENSES[word]||[];
  const tags=[...new Set([...memberships,...extras])];
  if(!tags.length)return[{v:senseVector(['unclassified']),weight:1}];
  // Separate senses, not a single average that washes away ambiguity.
  return tags.map(tag=>({v:senseVector([tag]),weight:memberships.includes(tag)?1:.43}));
}
const SEMANTIC_SENSES=Object.fromEntries(WORDS.map(w=>[w,getWordSenses(w)]));
const PRETRAINED=globalThis.CB_EMBEDDINGS;
const CLUE_VECTORS=new Map();
for(const [category,list] of Object.entries(CATEGORIES)){
  if(!/^[a-z]+$/.test(category))continue;
  const names=[category,...(CLUE_SYNONYMS[category]||[])];
  const vec=senseVector([category]);
  for(const name of names)CLUE_VECTORS.set(name.toUpperCase(),[{v:vec,weight:1}]);
}
for(const word of WORDS)if(!CLUE_VECTORS.has(word))CLUE_VECTORS.set(word,SEMANTIC_SENSES[word]);
if(PRETRAINED?.clues)for(const clue of Object.keys(PRETRAINED.clues))CLUE_VECTORS.set(clue,CLUE_VECTORS.get(clue)||[]);
function denseCosine(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s}
function semanticSimilarity(clue,word){
  const key=clue.toLowerCase();
  const category=Object.keys(CATEGORIES).find(k=>key===k||(CLUE_SYNONYMS[k]||[]).includes(key));
  // Human-readable category membership is a much stronger signal than the
  // templated MiniLM sense descriptions, which can create misleading ties.
  if(category){
    const direct=CATEGORIES[category]?.includes(word);
    const shared=CLUE_THEMES?.[category]?.includes(word);
    let dense=0;
    if(PRETRAINED?.words?.[word]&&PRETRAINED?.clues?.[clue]){
      for(const x of PRETRAINED.clues[clue])for(const y of PRETRAINED.words[word])
        dense=Math.max(dense,denseCosine(x.vec,y.vec)*x.weight*y.weight);
    }
    if(direct)return .68+Math.min(.20,dense*.32);
    if(shared)return .48+Math.min(.15,dense*.23);
    return Math.min(.30,dense*.48);
  }
  if(PRETRAINED?.words?.[word]&&PRETRAINED?.clues?.[clue]){
    let best=0;
    for(const x of PRETRAINED.clues[clue])for(const y of PRETRAINED.words[word])
      best=Math.max(best,denseCosine(x.vec,y.vec)*x.weight*y.weight);
    return best;
  }
  const a=CLUE_VECTORS.get(clue),b=SEMANTIC_SENSES[word];if(!a||!b)return 0;
  let best=0;for(const x of a)for(const y of b)best=Math.max(best,cosine(x.v,y.v)*x.weight*y.weight);return best;
}
function semanticClue(g,team,level){
  const visible=g.words.map((w,i)=>({w,i,k:g.keys[i]})).filter(x=>!g.revealed[x.i]);
  const used=new Set(g.log.filter(s=>s.startsWith(team.toUpperCase()+' clue: ')).map(s=>s.split(' clue: ')[1]?.split(' ')[0]));
  const {urgency,ours,theirs}=aiSituation(g,team);
  let best=null;
  for(const [word] of CLUE_VECTORS){
    const key=word.toLowerCase();
    // The generated embeddings are not sufficient evidence to use arbitrary
    // board words as clues: the descriptive templates produce false matches.
    if(!Object.keys(CATEGORIES).some(k=>key===k||(CLUE_SYNONYMS[k]||[]).includes(key)))continue;
    if(used.has(word)||g.words.some(w=>w===word||w+'S'===word||word+'S'===w))continue;
    const ranking=visible.map(x=>({...x,sim:semanticSimilarity(word,x.w)})).sort((a,b)=>b.sim-a.sim);
    if(!ranking.length||ranking[0].sim<.16)continue;
    // A spymaster must predict a guesser's complete ranked board, NOT merely
    // how closely a clue relates to the intended cards in isolation.
    const temperature=level==='easy'?.105:level==='medium'?.075:.055;
    const exponent=ranking.map(x=>Math.exp(Math.max(-35,(x.sim-ranking[0].sim)/temperature)));
    for(let n=1;n<=Math.min(4,ours);n++){
      const top=ranking.slice(0,n);
      const correct=top.filter(x=>x.k===team).length;
      if(correct===0)continue;
      const assassin=top.some(x=>x.k==='assassin');
      if(assassin)continue;
      const wrong=top.filter(x=>x.k!==team);
      const next=ranking[n];
      const lowest=top[n-1].sim;
      if(n>1&&lowest<(urgency>=2?.43:.48))continue;
      const danger=ranking.filter(x=>x.k!==team&&x.sim>=lowest-.075);
      const assassinRisk=ranking.filter(x=>x.k==='assassin').reduce((s,x)=>s+Math.exp(Math.max(-35,(x.sim-ranking[0].sim)/temperature)),0);
      const prefix=correct===n;
      // Reward useful cards recovered per turn; reward 2-3 far more than
      // repeatedly clearing singles. Still permit singles on truly bad boards.
      const progress=correct*11+(n>=2&&prefix?17:0)+(n>=3&&prefix?10:0)+(n>=4&&prefix?2:0);
      const weakness=Math.max(0,.48-lowest)*26;
      const confusion=danger.reduce((s,x)=>s+(x.k==='assassin'?26:x.k==='neutral'?6:9)*Math.exp(Math.max(-20,(x.sim-lowest)/temperature)),0);
      const boundary=next?(lowest-next.sim)*20:2;
      const score=progress+boundary+top.reduce((s,x)=>s+x.sim,0)*3
        -wrong.length*18-confusion-weakness-assassinRisk*24
        -(prefix?0:24)
        +urgency*correct*1.7
        +(Math.random()-.5)*(level==='hard'?.35:level==='medium'?1.5:3);
      if(!best||score>best.score)best={word,n:prefix?n:Math.max(1,correct),score,correct,prefix};
    }
  }
  if(best)return{word:best.word,n:best.n};
  return legacyClue(g,team,level);
}
function semanticGuess(g,team,level){
  const clue=g.clue.word;
  const remainingWords=g.words.map((w,i)=>({w,i})).filter(x=>!g.revealed[x.i]);
  const ranking=remainingWords.map(x=>({...x,sim:semanticSimilarity(clue,x.w)}))
    .sort((a,b)=>(b.sim-a.sim)+(Math.random()-.5)*(level==='hard'?.006:level==='medium'?.025:.065));
  const top=ranking[0];if(!top)return null;
  const second=ranking[1]?.sim||0;
  const rank=g.guesses;
  const margin=Math.max(0,top.sim-second);
  const confidence=Math.max(0,Math.min(1,(top.sim-.20)*1.8+margin*1.6));
  return{i:top.i,related:top.sim>.24,confidence,sim:top.sim,margin,rank};
}
const legacyClue=aiClue;
aiClue=semanticClue;
aiGuess=semanticGuess;
// Confidence is not an absolute cosine cutoff: how many guesses the clue
// promised, the score, and whether this is a bonus guess all matter.
aiShouldContinue=function(g,team,level,choice){
  if(!choice)return false;
  const {urgency}=aiSituation(g,team);
  if(g.clue.n!==0&&g.guesses>=g.clue.n+1)return false;
  const bonus=g.clue.n!==0&&g.guesses>=g.clue.n;
  const threshold=(level==='hard'?.27:level==='medium'?.23:.19)
    +(bonus?.19:0)+Math.max(0,g.guesses-1)*.025-urgency*.025;
  return choice.related&&choice.confidence>=threshold;
};
