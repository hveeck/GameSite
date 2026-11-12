// Solo-mode adapter. Gemini runs exclusively in a Supabase Edge Function;
// no Gemini credential is ever held by this page.
const CB_AI_ENDPOINT='https://joqypdrkojtinlflbvur.supabase.co/functions/v1/cluebugle-ai';
let cbGeminiFailureShown=false;
// A Spymaster turn makes two SEQUENTIAL Gemini calls (candidate clues and
// independent color-blind verification). The former 25-second browser timeout
// could abort a healthy request before the second model call finished.
async function cbGeminiRequest(g,team,level,role){
  const data={role,team,difficulty:level,board:g.words,
    revealed:g.revealed,previous:(g.log||[]).slice(-12),strategy:(typeof localStorage!=='undefined'?localStorage.getItem('cb_ai_risk'):null)||'balanced',
    lessons:(()=>{try{return typeof localStorage==='undefined'?[]:JSON.parse(localStorage.getItem('cb_ai_lessons')||'[]').slice(-8)}catch{return []}})(),
    ...(role==='spymaster'?{keys:g.keys}:{clue:g.clue})};
  // 2 x 22s upstream, plus backend retries and network overhead.
  const timeoutMs=role==='spymaster'?95000:45000;
  for(let attempt=0;attempt<2;attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    let response, result;
    try{
      response=await fetch(CB_AI_ENDPOINT,{method:'POST',signal:controller.signal,
        headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      result=await response.json().catch(()=>({error:'Invalid response from Gemini service'}));
      if(response.ok&&!result.error)return result;
      const error=new Error(result.error||`AI returned ${response.status}`);
      error.status=response.status;
      throw error;
    }catch(error){
      // Do not retry quota exhaustion, authorization errors, or invalid input.
      // An occasional missing legal candidate / failed verifier (422 / 503),
      // network interruption or timeout warrants ONE fresh attempt.
      const retryable=error.name==='AbortError'||error instanceof TypeError||
        error.status===422||error.status===500||error.status===502||error.status===503||error.status===504;
      if(attempt===1||!retryable)throw error;
      console.warn('Gemini temporary failure; retrying once:',error.message);
    }finally{clearTimeout(timer)}
  }
  throw Error('AI service unavailable');
}

async function cbLiveClue(g,team,level){
  try{
    const result=await cbGeminiRequest(g,team,level,'spymaster');
    if(!Number.isInteger(result.n)||result.n<1||!cbLegalClue(result.word,new Set(g.words)))throw Error('Invalid AI clue');
    return {word:result.word,n:result.n,targets:result.targets,
      reason:result.reason,verification:result.verification,provider:'gemini'};
  }catch(e){
    console.warn('Gemini Spymaster unavailable for this turn:',e);
    if(!cbGeminiFailureShown){cbGeminiFailureShown=true;toast('Gemini was unavailable for this turn; the backup AI took over. See browser console for details.');}
    return aiClue(g,team,level);
  }
}
async function cbLiveGuess(g,team,level){
  if(!g.aiPlan||g.aiPlan.clue!==g.clue.word){
    try{
      const result=await cbGeminiRequest(g,team,level,'guesser');
      g.aiPlan={clue:g.clue.word,guesses:result.guesses,stopAfter:result.stopAfter};
    }catch(e){
      console.warn('Gemini Guesser unavailable for this turn:',e);
      if(!cbGeminiFailureShown){cbGeminiFailureShown=true;toast('Gemini was unavailable for this turn; the backup AI took over. See browser console for details.');}
      return {choice:aiGuess(g,team,level),fallback:true};
    }
  }
  if(g.guesses>=g.aiPlan.stopAfter)return{choice:null,fallback:false};
  const next=g.aiPlan.guesses.find(w=>g.words.includes(w)&&!g.revealed[g.words.indexOf(w)]);
  return{choice:next?{i:g.words.indexOf(next),sim:1,margin:1}:null,fallback:false};
}

// Persist a small, anonymous list of previous clue outcomes for subsequent
// solo games. This is contextual feedback, not automatic model training.
function cbRememberGeminiGame(g){
  if(!g||!g.winner||g._geminiHistorySaved)return;
  g._geminiHistorySaved=true;
  const notes=(g.review||[]).filter(x=>x.provider==='gemini');
  const lessons=notes.map(x=>{
    const wrong=(x.guesses||[]).filter(z=>z.key!==x.team).map(z=>z.word).slice(0,3);
    const hits=(x.guesses||[]).filter(z=>z.key===x.team).map(z=>z.word);
    return {clue:x.word,n:x.n,targets:(x.targets||[]).map(z=>z.word),hits,wrong};
  }).filter(x=>x.wrong.length||x.hits.length);
  try{const old=JSON.parse(localStorage.getItem('cb_ai_lessons')||'[]');
    localStorage.setItem('cb_ai_lessons',JSON.stringify([...old,...lessons].slice(-25)));
  }catch{}
}


// One postgame AI review per completed solo match. The game key is sent ONLY
// after the outcome is settled; until then, the guesser never sees it.
async function cbGetPostgameReview(g,role){
  const rounds=(g.roundReview||[]).filter(r=>r.team==='red').map(r=>({
    round:r.round,clue:r.word,n:r.n,clueGiver:r.ai?'gemini':'human',
    guesses:r.guesses.map(z=>({word:z.word,color:z.key})),
    predictedMatches:(r.scores||[]).slice(0,6).map(z=>({word:z.word,score:Math.round(100*z.score)}))
  }));
  const redNotes=(g.review||[]).filter(r=>r.team==='red');
  for(const r of rounds){
    const note=redNotes.find(n=>n.round===r.round&&n.word===r.clue);
    if(note){r.intended=note.targets.map(t=>t.word);r.originalExplanation=note.reason||'';}
  }
  const payload={role:'review',team:'red',humanRole:role,board:g.words,keys:g.keys,
    revealed:g.revealed,winner:g.winner,rounds:rounds.slice(0,22)};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),65000);
  try{
    const response=await fetch(CB_AI_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
    const data=await response.json();
    if(!response.ok||data.error)throw Error(data.error||'Gemini review unavailable');
    if(!Array.isArray(data.rounds))throw Error('Review response incomplete');
    return data;
  }finally{clearTimeout(timer)}
}
