// Solo-mode adapter. Gemini runs exclusively in a Supabase Edge Function;
// no Gemini credential is ever held by this page.
const CB_AI_ENDPOINT='https://joqypdrkojtinlflbvur.supabase.co/functions/v1/cluebugle-ai';
let cbGeminiFailureShown=false;
async function cbGeminiRequest(g,team,level,role){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{
    const data={role,team,difficulty:level,board:g.words,
      revealed:g.revealed,previous:(g.log||[]).slice(0,12),
      ...(role==='spymaster'?{keys:g.keys}:{clue:g.clue})};
    const res=await fetch(CB_AI_ENDPOINT,{method:'POST',signal:controller.signal,
      headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const result=await res.json();
    if(!res.ok||result.error)throw Error(result.error||`AI returned ${res.status}`);
    return result;
  }finally{clearTimeout(timer)}
}
async function cbLiveClue(g,team,level){
  try{
    const result=await cbGeminiRequest(g,team,level,'spymaster');
    if(!Number.isInteger(result.n)||result.n<1||!cbLegalClue(result.word,new Set(g.words)))throw Error('Invalid AI clue');
    return {word:result.word,n:result.n,targets:result.targets,
      reason:result.reason,provider:'gemini'};
  }catch(e){
    if(!cbGeminiFailureShown){cbGeminiFailureShown=true;toast(`Gemini unavailable: ${e.message}. Using offline bot.`)}
    return aiClue(g,team,level);
  }
}
async function cbLiveGuess(g,team,level){
  if(!g.aiPlan||g.aiPlan.clue!==g.clue.word){
    try{
      const result=await cbGeminiRequest(g,team,level,'guesser');
      g.aiPlan={clue:g.clue.word,guesses:result.guesses,stopAfter:result.stopAfter};
    }catch(e){
      if(!cbGeminiFailureShown){cbGeminiFailureShown=true;toast(`Gemini unavailable: ${e.message}. Using offline bot.`)}
      return {choice:aiGuess(g,team,level),fallback:true};
    }
  }
  if(g.guesses>=g.aiPlan.stopAfter)return{choice:null,fallback:false};
  const next=g.aiPlan.guesses.find(w=>g.words.includes(w)&&!g.revealed[g.words.indexOf(w)]);
  return{choice:next?{i:g.words.indexOf(next),sim:1,margin:1}:null,fallback:false};
}
