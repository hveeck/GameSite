// Broad, balanced, 900-word board vocabulary. Every board still selects 25
// uniformly random distinct cards, with a shuffle bag between matches.
const BOARD_WORDS=[];
const candidates=Object.entries(CATEGORIES).map(([category,words])=>({category,words:[...new Set(words)]}));
for(let round=0;BOARD_WORDS.length<900;round++){
  let added=0;
  for(const group of candidates){
    if(BOARD_WORDS.length>=900)break;
    const word=group.words[round];
    if(word&&!BOARD_WORDS.includes(word)){BOARD_WORDS.push(word);added++}
  }
  if(!added)break;
}
// Preserve common polysemous words for multi-sense testing and game variety.
for(const word of ['BANK','RIVER','MOUSE','CURRENT','SPRING','BAT','BARK','JAM','RING','MATCH','LIGHT','CRANE','SEAL','STOCK','PITCH','PALM','WAVE','SHARK','MOUSE','SCALE','BRIDGE','COURT','STAR','CAP','DATE','MINT','KEY','PLANE','ROCK','TRAIN']){
  if(WORDS.includes(word)&&!BOARD_WORDS.includes(word))BOARD_WORDS.splice(BOARD_WORDS.length-1,1,word);
}
if(BOARD_WORDS.length!==900||new Set(BOARD_WORDS).size!==900)throw Error('Invalid board vocabulary');
WORDS.splice(0,WORDS.length,...BOARD_WORDS);
