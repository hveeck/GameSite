// ClueBugle v6: server-side Gemini decisions. The Gemini secret never reaches
// the browser. Deploy separately from the existing multiplayer room function.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const validWord = (s: unknown): s is string => typeof s === 'string' && /^[A-Z]{2,24}$/.test(s);
const validTeam = (s: unknown) => ['red', 'blue', 'neutral', 'assassin'].includes(String(s));
const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
// The verifier only ranks publicly visible word associations. Keep the
// stronger model for actual clues and detailed postgame reviews.
const VERIFIER_MODEL = Deno.env.get('GEMINI_VERIFIER_MODEL') || 'gemini-3.5-flash-lite';
// Best-effort per-worker throttling; Google free-tier quotas are the final
// limit. A production, paid deployment should add durable DB-backed quotas.
const traffic = new Map<string,{minute:number,count:number}>();

// Gemini normally returns a single JSON object, but occasionally appends a
// second object, a code fence, or commentary despite responseMimeType. Parse
// the first *complete* object rather than rejecting otherwise valid output.
// Never execute model output; the caller still validates all selected words.
function parseJson(text: string): Record<string, unknown> {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const value = JSON.parse(stripped);
    if (value && typeof value === 'object' && !Array.isArray(value))
      return value as Record<string, unknown>;
  } catch { /* Try a complete JSON object from a response with trailing text. */ }
  let start = -1, depth = 0, inString = false, escaped = false;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (start < 0) {
      if (ch !== '{') continue;
      start = i;
      depth = 1;
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          const value = JSON.parse(stripped.slice(start, i + 1));
          if (value && typeof value === 'object' && !Array.isArray(value))
            return value as Record<string, unknown>;
        } catch { /* Malformed object: reject, do not accept partial JSON. */ }
        break;
      }
    }
  }
  throw new Error('Gemini returned invalid JSON');
}

// Ask Gemini with explicit JSON output. Safety blocks and quota exhaustion
// are surfaced as recoverable errors rather than accepting an invalid move.
async function askGemini(key:string,model:string,prompt:string,temperature=.3,maxOutputTokens=950,
                         deadline=Date.now()+16000, thinkingBudget=256) {
  // Never stack four full-length waits. Every stage respects the SAME turn deadline.
  let last:Error=new Error('Gemini temporarily unavailable');
  for(let attempt=0; attempt<2; attempt++){
    const remaining=deadline-Date.now();
    if(remaining<650)throw last;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(400,Math.min(7500,remaining-100)));
    try{
      const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
        method:'POST',signal:controller.signal,
        headers:{'Content-Type':'application/json','x-goog-api-key':key},
        body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{
          responseMimeType:'application/json',
          maxOutputTokens,
          ...(model.startsWith('gemini-3')
            ? {thinkingConfig:{
                thinkingLevel:model.includes('flash-lite')?'MINIMAL':'LOW'
              }}
            : {temperature,thinkingConfig:{thinkingBudget}})}})
      });
      if(response.ok){
        const raw=await response.json();
        const answer=raw.candidates?.[0]?.content?.parts?.map((p:{text?:string})=>p.text||'').join('')||'';
        if(!answer)throw Error(`Gemini returned no text (${raw.candidates?.[0]?.finishReason||raw.promptFeedback?.blockReason||'unknown'})`);
        return parseJson(answer);
      }
      const upstreamError = await response.text();
      console.error("GEMINI UPSTREAM ERROR", JSON.stringify({
        model,
        status: response.status,
        details: upstreamError.slice(0, 1500)
      }));
      last=new Error(`Gemini request failed (${response.status})`);
      if(![429,500,502,503,504].includes(response.status))throw last;
    }catch(e){
      last=e instanceof Error?e:new Error(String(e));
      if(last.name!=='AbortError'&&!/Gemini request failed \((429|500|502|503|504)\)/.test(String(last)))throw last;
    }finally{clearTimeout(timer)}
    if(attempt===0&&deadline-Date.now()>1000)await new Promise(r=>setTimeout(r,350));
  }
  throw last;
}

// Shared rules are provided to both the first generation and the repair prompt.
// Game legality must also be checked on the server (see legalCandidate).
const CLUE_RULES = `STRICT CODENAMES CLUE RULES (mandatory):
1. Your clue must be ONE ordinary English word: letters only. No spaces, hyphens, numbers, initials or phrases.
2. The clue must NOT be any word currently on the board, revealed OR unrevealed.
3. The clue must NOT be a plural, inflection, or obvious derivative of a board word.
4. The clue must NOT contain an entire board word as an obvious component (e.g. RAINBOW for RAIN).
5. Never reuse a clue already given in this match.
6. Use meaning-based associations, not spelling, initial letters, word location, or the number of letters.
7. The number n must equal the number of distinct, unrevealed FRIENDLY targets you list. Never list an enemy, bystander, or assassin as an intended target.
8. Look for intuitive 2-3 target links when safe; a single-target clue is preferable to a risky multi-target clue.
9. Avoid clues strongly associated with the assassin. Evaluate dangerous alternatives before proposing a clue.
The legality rules do not change with Conservative, Balanced or Aggressive settings.`;

// Candidate validation is independent of the model's confidence.
function legalCandidate(c:any, board:string[], available:string[], own:string[], history:string[]) {
  const word=String(c?.word||'').trim().toUpperCase();
  const targets=Array.isArray(c?.targets)?c.targets.map((x:unknown)=>String(x).trim().toUpperCase()):[];
  // A model occasionally says n=3 but provides two specific targets.
  // The intended words, not the inconsistent count, determine the legal clue number.
  const statedN=Number(c?.n);
  const n=targets.length>0 && targets.length<=9 ? targets.length : statedN;
  const singular=(s:string)=>s.endsWith('IES')?s.slice(0,-3)+'Y':s.endsWith('S')?s.slice(0,-1):s;
  const legal=validWord(word)&&!board.some((w:string)=>singular(w)===singular(word)||(w.length>=4&&(word.startsWith(w)||word.endsWith(w))));
  const safe=Number.isInteger(n)&&n>=1&&n<=Math.min(9,own.length)&&targets.length===n&&
    new Set(targets).size===n&&targets.every((w:string)=>own.includes(w)&&available.includes(w));
  return legal&&safe&&!history.some((h:string)=>h.toUpperCase().includes('CLUE: '+word+' '))
    ?{word,n,targets,reason:String(c.reason||'').slice(0,400)}:null;
}

// A separate hidden-key-blind guessing pass. It sees ONLY public board words
// and proposed clues. The spymaster evaluates its guesses against the key.
async function verifyClues(key:string,model:string,available:string[],candidates:any[],deadline:number) {
  // Color-blind verifier: no secret identity data enters this request.
  const prompt=`CODENAMES GUESSER. Rank the 5 most tempting guesses for each clue.
VISIBLE UNREVEALED WORDS: ${JSON.stringify(available)}
CLUES: ${JSON.stringify(candidates.map(x=>({word:x.word,n:x.n})))}
Respond with compact JSON ONLY: {"rankings":[{"word":"CLUE","guesses":["WORD1","WORD2","WORD3","WORD4","WORD5"]}]}
Use only visible words. No explanation. Consider the most obvious connections, including dangerous distractors.`;
  let result:Record<string,unknown>;
  try{result=await askGemini(key,VERIFIER_MODEL,prompt,.08,680,deadline,0)}
  catch(e){
    if(!String(e).includes('(404)'))throw e;
    result=await askGemini(key,model,prompt,.08,680,deadline,0);
  }
  const rows=Array.isArray(result.rankings)?result.rankings:[];
  return new Map<string,string[]>(rows.map((x:any)=>[String(x.word||'').trim().toUpperCase(),
    Array.isArray(x.guesses)?[...new Set<string>(x.guesses.map((w:unknown)=>String(w).trim().toUpperCase()))]
      .filter((w:string)=>available.includes(w)).slice(0,6):[]]));
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  const caller=req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||'unknown';
  const minute=Math.floor(Date.now()/60000);
  const prior=traffic.get(caller);
  const count=prior?.minute===minute?prior.count+1:1;
  traffic.set(caller,{minute,count});
  if(count>25)return json({error:'Too many requests. Wait a minute.'},429);
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json({ error: 'Gemini has not been configured' }, 503);
  try {
    const body=await req.text();
    if(body.length>14000)return json({error:'Request too large'},413);
    const data = JSON.parse(body);
    const { role, board, revealed, team, clue, previous, difficulty } = data;
    if (role === 'review') {
      // Postgame only; this is a solo game submitted by its owner, never a
      // source of authoritative multiplayer data. Do not claim model guesses
      // are objective measurements or the human's actual intention.
      if (team !== 'red' || !['spymaster','guesser'].includes(data.humanRole) ||
          !['red','blue'].includes(data.winner) ||
          !Array.isArray(board) || board.length !== 25 || !board.every(validWord) ||
          new Set(board).size !== 25 || !Array.isArray(data.keys) ||
          data.keys.length !== 25 || !data.keys.every(validTeam) ||
          !Array.isArray(revealed) || revealed.length !== 25 ||
          !revealed.every((x:unknown)=>typeof x==='boolean') ||
          !Array.isArray(data.rounds) || data.rounds.length>22)
        return json({error:'Invalid postgame review'},400);
      const filtered=data.rounds.map((r:any)=>({
        round:Number(r.round),clue:String(r.clue||'').slice(0,25),
        n:Number(r.n),clueGiver:r.clueGiver==='human'?'human':'gemini',
        intended:Array.isArray(r.intended)?r.intended.filter((w:unknown)=>validWord(w)&&board.includes(w)).slice(0,9):[],
        originalExplanation:String(r.originalExplanation||'').slice(0,300),
        guesses:Array.isArray(r.guesses)?r.guesses.filter((v:any)=>validWord(v.word)&&board.includes(v.word)).slice(0,10).map((v:any)=>({word:v.word,color:data.keys[board.indexOf(v.word)]})):[]
      })).filter((r:any)=>Number.isInteger(r.round)&&r.round>0&&r.round<=60&&
        validWord(r.clue)&&Number.isInteger(r.n)&&r.n>=0&&r.n<=9);
      if (!filtered.length)return json({error:'No complete turns to review'},400);
      const coloredBoard=board.map((word:string,i:number)=>({word,color:data.keys[i],revealed:revealed[i]}));
      const roleInstruction=data.humanRole==='spymaster'
        ? 'Human gave the clues; intended targets may be inferred, not known.'
        : 'Human guessed; AI targets are recorded where supplied.';
      // The actual round-by-round similarity bars are calculated locally.
      // Generate only a concise 5-sentence overall summary, not per-round essays.
      const brief=filtered.map((r:any)=>({clue:r.clue,n:r.n,
        intended:r.intended,guesses:r.guesses}));
      const prompt=`You are a thoughtful Codenames coach. Write EXACTLY FIVE short,
      specific, easy-to-understand sentences reviewing this finished match.
      Mention actual clues and words, which correct guesses worked, which
      incorrect guess was tempting, any dangerously attractive wrong word,
      and one improvement. ${roleInstruction}
      BOARD: ${JSON.stringify(coloredBoard)}.
      HUMAN ROLE: ${data.humanRole}. WINNER: ${data.winner}.
      OUR TURNS: ${JSON.stringify(brief)}.
      Never invent a guess, intention or danger. Keep it friendly, direct,
      and less than 125 total words. JSON ONLY: {"overview":"Five sentences."}`;
      let result:Record<string,unknown>;
      try{result=await askGemini(key,VERIFIER_MODEL,prompt,.15,620,Date.now()+11500,0)}
      catch(e){
        if(!String(e).includes('(404)'))throw e;
        result=await askGemini(key,MODEL,prompt,.15,620,Date.now()+8500,0);
      }
      const overview=String(result.overview||'').trim();
      if(!overview)throw Error('Review summary missing');
      return json({provider:'gemini',overview:overview.slice(0,950),rounds:[]});
    }
    const strategy=['safe','balanced','aggressive'].includes(data.strategy)?data.strategy:'balanced';
    const lessons=Array.isArray(data.lessons)?data.lessons.slice(-8).map((x:any)=>({
      clue:String(x.clue||'').slice(0,24),wrong:Array.isArray(x.wrong)?x.wrong.slice(0,3):[],
      targets:Array.isArray(x.targets)?x.targets.slice(0,6):[],hits:Array.isArray(x.hits)?x.hits.slice(0,6):[]
    })):[];
    if (!['spymaster', 'guesser'].includes(role) || !['red', 'blue'].includes(team) ||
        !Array.isArray(board) || board.length !== 25 || !board.every(validWord) ||
        new Set(board).size !== 25 || !Array.isArray(revealed) || revealed.length !== 25 ||
        !revealed.every((x: unknown) => typeof x === 'boolean')) {
      return json({ error: 'Invalid board or role' }, 400);
    }
    const history = Array.isArray(previous) ? previous.slice(-12).filter((x: unknown) =>
      typeof x === 'string').map((x: string) => x.slice(0,100)) : [];
    const level = ['easy','medium','hard'].includes(difficulty) ? difficulty : 'medium';
    const available = board.filter((_: string, i: number) => !revealed[i]);
    let prompt: string;
    if (role === 'spymaster') {
      const keys = data.keys;
      if (!Array.isArray(keys) || keys.length !== 25 || !keys.every(validTeam))
        return json({ error: 'Missing spymaster key' }, 400);
      const cards = available.map((word: string) => ({ word, color: keys[board.indexOf(word)] }));
      const ours = cards.filter((x: {color: string}) => x.color === team).length;
      prompt = `Play as an expert Codenames Spymaster for ${team}.
${CLUE_RULES}
UNREVEALED BOARD AND SECRET COLORS: ${JSON.stringify(cards)}.
FULL BOARD (none may appear in clues): ${JSON.stringify(board)}.
PAST CLUES: ${JSON.stringify(history)}.
FRIENDLY WORDS REMAINING: ${ours}.
RISK: ${strategy} (avoid the assassin at every risk level).
LESSONS FROM PRIOR MATCHES: ${JSON.stringify(lessons.slice(-4))}.
Generate EXACTLY THREE DISTINCT, clever, LEGAL ordinary one-word clue options.
Prefer 2-3 intuitive friendly words, but 1 if necessary to protect from danger.
Try unrelated meanings if one theme is too risky. Targets must be DISTINCT,
UNREVEALED, FRIENDLY words only. Do NOT add clue numbers or explanations.
Return ONLY compact JSON: {"candidates":[{"word":"CLUE","targets":["TARGET1","TARGET2"]}]}`;
    } else {
      if (!clue || !validWord(clue.word) || !Number.isInteger(clue.n) || clue.n < 0 || clue.n > 9)
        return json({ error: 'Invalid clue' }, 400);
      // Never include hidden colors in the guesser request or its prompt.
      prompt = `Play as a careful Codenames Guesser. You CANNOT see card colors.
CLUE: ${clue.word} ${clue.n}. SKILL: ${level}.
UNREVEALED WORDS: ${JSON.stringify(available)}.
PREVIOUS CLUES: ${JSON.stringify(history)}.
Rank the most obvious semantic connections first. No explanations.
Return JSON ONLY: {"guesses":["WORD1","WORD2","WORD3"],"stopAfter":2}.
Choose up to ${Math.min(7,available.length)} board words; never invent words.`;
    }
    // One friendly card remains: one short model call, no batch verification.
    // Legality is still checked; Gemini sees all nonfriendly colors for safety.
    if(role==='spymaster'){
      const own=available.filter((w:string)=>data.keys[board.indexOf(w)]===team);
      if(own.length===1){
        const target=own[0],others=available.filter(w=>w!==target);
        const assassin=available.filter(w=>data.keys[board.indexOf(w)]==='assassin');
        const quick=`CODENAMES: one remaining friendly word is ${target}.
${CLUE_RULES}
ALL BOARD WORDS: ${JSON.stringify(board)}
ASSASSIN: ${JSON.stringify(assassin)}
OTHER UNREVEALED DISTRACTORS: ${JSON.stringify(others)}
PAST CLUES: ${JSON.stringify(history)}
Give ONE simple, safe, legal clue; avoid connections to distractors.
Return JSON ONLY: {"word":"CLUE","targets":["${target}"]}.`;
        const deadline=Date.now()+8500;
        for(let i=0;i<2;i++){
          try{
            let response:Record<string,unknown>;
            try{response=await askGemini(key,VERIFIER_MODEL,quick+(i?' Different word required.':''),.1,240,deadline,0)}
            catch(e){if(!String(e).includes('(404)'))throw e;
              response=await askGemini(key,MODEL,quick,.1,240,deadline,0)}
            const options=Array.isArray(response.candidates)?response.candidates:[response];
            const legal=options.map((c:any)=>legalCandidate(c,board,available,own,history)).find(Boolean);
            if(legal)return json({...legal,provider:'gemini',verification:{predicted:[target],risks:[],score:0,
              note:'One-card fast path; independent check skipped'}});
          }catch(e){if(i===1)throw e;}
        }
        return json({error:'No legal final-card clue',code:'CLUE_VALIDATION_FAILED'},422);
      }
    }
    // All normal Spymaster stages share a 16-second total budget.
    const deadline=Date.now()+(role==='spymaster'?16000:10000);
    let output:Record<string,unknown>;
    output=await askGemini(key,MODEL,prompt,level==='hard'?.2:.35,role==='spymaster'?1150:580,deadline,
      role==='spymaster'?256:128);
    if(role==='spymaster'){
      const own=available.filter((w:string)=>data.keys[board.indexOf(w)]===team);
      const normalize=(result:Record<string,unknown>)=>{
        const raw=Array.isArray(result.candidates)?result.candidates:[result];
        return raw.map((c:any)=>legalCandidate(c,board,available,own,history))
          .filter(Boolean).slice(0,3);
      };
      let candidates=normalize(output);
      if(!candidates.length && deadline-Date.now()>2600){
        // One short correction only when every candidate was illegal.
        const reprompt=`${CLUE_RULES}\nOnly these FRIENDLY targets are allowed: ${JSON.stringify(own)}.
Full forbidden BOARD words: ${JSON.stringify(board)}.
Already used clues: ${JSON.stringify(history)}.
Produce 2 NEW legal one-word clues (with friendly target lists only).
Return JSON: {"candidates":[{"word":"CLUE","targets":["FRIENDLY"]}]}`;
        try{candidates=normalize(await askGemini(key,MODEL,reprompt,.12,500,deadline,0))}
        catch(e){if(String(e).includes('429')||String(e).includes('403'))throw e;}
      }
      if(!candidates.length)return json({
        error:'No legal Gemini clue candidates after regeneration',
        code:'CLUE_VALIDATION_FAILED'
      },422);
      let rankings:Map<string,string[]>;
      try{rankings=await verifyClues(key,MODEL,available,candidates,deadline)}
      catch(e){return json({error:'Clue verifier temporarily unavailable: '+String(e instanceof Error?e.message:e)},503)}
      const opposition=available.filter((w:string)=>data.keys[board.indexOf(w)]!==team);
      const lastChance=opposition.filter((w:string)=>data.keys[board.indexOf(w)]=== (team==='red'?'blue':'red')).length===1;
      const countFriendly=(words:string[])=>words.filter(w=>own.includes(w)).length;
      const assessments=candidates.map((c:any)=>{
        const guesses=rankings.get(c.word)||[];
        const first=guesses.slice(0,c.n);
        const mistakes=first.filter((w:string)=>!own.includes(w));
        const assassinIndex=guesses.indexOf(available.find((w:string)=>data.keys[board.indexOf(w)]==='assassin')||'');
        const firstDanger=first.findIndex((w:string)=>!own.includes(w));
        const correctBeforeDanger=firstDanger<0?countFriendly(first):countFriendly(first.slice(0,firstDanger));
        const matchedTargets=c.targets.filter((w:string)=>first.includes(w)).length;
        const riskPenalty=strategy==='safe'?12:strategy==='aggressive'?5:9;
        const sizeBonus=(lastChance?12:3)*(Math.min(c.n,own.length)-1);
        const score=correctBeforeDanger*22+matchedTargets*9+sizeBonus
          -mistakes.length*riskPenalty-(assassinIndex>=0&&assassinIndex<c.n+1?100:0)
          -(first.length<c.n?35:0);
        return {...c,score,predicted:guesses.slice(0,Math.max(5,c.n+1)),mistakes};
      });
      assessments.sort((a:any,b:any)=>b.score-a.score);
      const best=assessments[0];
      // Every candidate is checked against a separate color-blind guesser.
      // If it anticipates a dangerous first guess, refuse to improvise a larger claim.
      if(!best.predicted.length||!own.includes(best.predicted[0])||
         (!lastChance&&strategy==='safe'&&best.mistakes.length>0))
        return json({error:'No safe verified clue; retry or use fallback'},422);
      return json({word:best.word,n:best.n,targets:best.targets,reason:best.reason,provider:'gemini',
        verification:{predicted:best.predicted,risks:best.mistakes,score:best.score,
          alternatives:assessments.slice(1,4).map((x:any)=>({word:x.word,n:x.n,score:x.score}))}});
    }
    const guesses = Array.isArray(output.guesses) ? output.guesses.map((w:unknown)=>String(w).toUpperCase()) : [];
    const clean = [...new Set(guesses)].filter((w:string)=>available.includes(w));
    if (!clean.length) return json({ error:'Gemini returned no legal guesses' }, 422);
    const stopAfter = Math.max(1,Math.min(clue.n+1,clean.length,Number(output.stopAfter)||clue.n));
    return json({ guesses:clean,stopAfter,reason:String(output.reason||'').slice(0,350),provider:'gemini' });
  } catch (e) { return json({ error:e instanceof Error?e.message:'AI unavailable' }, 503); }
});
