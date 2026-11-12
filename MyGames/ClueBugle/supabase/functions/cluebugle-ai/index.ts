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
const VERIFIER_MODEL = Deno.env.get('GEMINI_VERIFIER_MODEL') || 'gemini-2.5-flash-lite';
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
async function askGemini(key:string,model:string,prompt:string,temperature=.3,maxOutputTokens=2700) {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),maxOutputTokens>2700?48000:22000);
  let response:Response;
  // Google documents 503 as transient server overload. Retry that specific
  // upstream status with bounded backoff, preserving the normal model safety
  // response and every downstream legality/risk check.
  for(let attempt=0;;attempt++){
    try {
      response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
        method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','x-goog-api-key':key},
        body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature,maxOutputTokens}})
      });
    } catch(e) {
      clearTimeout(timeout);
      throw e;
    }
    if(response.status===503 && attempt<2){
      await response.body?.cancel().catch(()=>{});
      await new Promise(resolve=>setTimeout(resolve,attempt===0?650:1700));
      continue;
    }
    break;
  }
  clearTimeout(timeout);
  if(!response.ok)throw Error(`Gemini request failed (${response.status})`);
  const raw=await response.json();
  const text=raw.candidates?.[0]?.content?.parts?.map((p:{text?:string})=>p.text||'').join('')||'';
  if(!text)throw Error(`Gemini returned no text (${raw.candidates?.[0]?.finishReason||raw.promptFeedback?.blockReason||'unknown'})`);
  return parseJson(text);
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
async function verifyClues(key:string,model:string,available:string[],candidates:any[]) {
  const prompt=`You are an independent expert CODENAMES GUESSER who cannot see card colors.
All visible words: ${JSON.stringify(available)}.
For EACH candidate clue below, list the six words you would guess FIRST, ordered by
most obvious association. Treat misleading distractors as seriously as correct answers.
Do not use any secret card identities: you have not been given any.
Candidates: ${JSON.stringify(candidates.map(x=>({word:x.word,n:x.n})))}.
Return JSON only: {"rankings":[{"word":"CLUE","guesses":["CARD", "CARD"]}]}.
Only use words appearing on the visible board. One entry for each clue.`;
  let result:Record<string,unknown>;
  try { result=await askGemini(key,VERIFIER_MODEL,prompt,.12); }
  catch(e){
    // A model might not be available to this API key. For that case only,
    // use the working primary model; never bypass verification.
    if(!String(e).includes('404'))throw e;
    result=await askGemini(key,model,prompt,.12);
  }
  const rows=Array.isArray(result.rankings)?result.rankings:[];
  return new Map<string,string[]>(rows.map((x:any)=>[String(x.word||'').toUpperCase(),
    Array.isArray(x.guesses)?x.guesses.map((w:unknown)=>String(w).toUpperCase()).filter((w:string)=>available.includes(w)):[]]));
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
        ? 'The HUMAN supplied the clues; evaluate how understandable each was, why the AI guesser selected its answers, and any better clue choice. Its exact intended targets were NOT recorded: infer likely targets and clearly say they are inferred.'
        : 'The AI supplied the clues; its recorded intended targets and explanation are shown. Evaluate what the human guessed, what was overlooked, and whether the clue itself was misleading. Do not blame the human for an ambiguous clue.';
      const prompt=`You are an expert, fair and candid CODENAMES postgame coach.
This match is OVER. Analyze only the human RED team's clue turns.
HUMAN ROLE: ${data.humanRole}. ${roleInstruction}
FINAL PUBLIC BOARD WITH TRUE COLORS: ${JSON.stringify(coloredBoard)}.
RED TURNS: ${JSON.stringify(filtered)}.
Explain specific semantic connections, realistic distractors, and what the player or bot could have done differently.
For EVERY turn, give: intended friendly cards (recorded if supplied, otherwise inferred and labeled),
why the clue fit each intended card, each actual guess including WRONG ones,
why each was tempting and how strongly it related to that clue, and one specific improvement.
Closeness scores 0..100 are SUBJECTIVE conversational ratings of intuitive semantic association,
NOT measured likelihoods, original model logits, or observed probabilities. Avoid false precision.
Do not invent guesses, targets, or colors. Never say a blue/neutral/assassin word was an intended RED card.
Return JSON ONLY with the exact schema:
{"overview":"2-4 specific sentences", "rounds":[{"round":1,"outcome":"successful|partial|missed",
"clueAssessment":"plain-English evaluation", "targets":[{"word":"WORD","closeness":82,"explanation":"why"}],
"guessAssessments":[{"word":"WORD","color":"red|blue|neutral|assassin","closeness":76,"explanation":"why that was or was not a sensible guess"}],
"improvement":"concrete advice or clearer legal one-word clue"}]}.
One round record per supplied round, in order. Max 180 words of explanation per round.`;
      let review:Record<string,unknown>;
      try{review=await askGemini(key,MODEL,prompt,.25,10000)}
      catch(e){if(String(e).includes('429')||String(e).includes('403'))throw e;
        review=await askGemini(key,MODEL,prompt+'\nReturn a single compact valid JSON object, no markdown.',.1,10000)}
      const raw=Array.isArray(review.rounds)?review.rounds:[];
      const rows=filtered.map((round:any)=>{
        const row=raw.find((r:any)=>Number(r?.round)===round.round)||{};
        const normScore=(x:unknown)=>Math.max(0,Math.min(100,Math.round(Number(x)||0)));
        const expected=new Set(round.intended);
        const guesses=round.guesses.map((g:any)=>{
          const item=Array.isArray(row.guessAssessments)?row.guessAssessments.find((x:any)=>String(x.word).toUpperCase()===g.word):null;
          return {word:g.word,color:g.color,closeness:normScore(item?.closeness),explanation:String(item?.explanation||'').slice(0,350)};
        });
        const targets=Array.isArray(row.targets)?row.targets.filter((x:any)=>typeof x.word==='string'&&
          data.keys[board.indexOf(x.word.toUpperCase())]==='red').slice(0,9).map((x:any)=>({
            word:String(x.word).toUpperCase(),closeness:normScore(x.closeness),explanation:String(x.explanation||'').slice(0,350)})):[];
        const hits=guesses.filter((g:any)=>g.color==='red').map((g:any)=>g.word);
        const wrong=guesses.some((g:any)=>g.color!=='red');
        const outcomes=['successful','partial','missed'];
        const outcome=wrong?'missed':(expected.size&&[...expected].every(w=>hits.includes(w)))?'successful':
          guesses.length?'partial':'missed';
        return {round:round.round,outcome:outcomes.includes(outcome)?outcome:'partial',
          clueAssessment:String(row.clueAssessment||'').slice(0,900),targets,
          guessAssessments:guesses,improvement:String(row.improvement||'').slice(0,700)};
      });
      return json({provider:'gemini',overview:String(review.overview||'').slice(0,1200),rounds:rows});
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
      prompt = `You are a brilliant HUMAN Codenames spymaster. Return JSON only.
${CLUE_RULES}
TEAM: ${team}. DIFFICULTY: ${level}. REMAINING FRIENDLY: ${ours}.
UNREVEALED BOARD WITH HIDDEN COLORS: ${JSON.stringify(cards)}.
RECENT GAME LOG: ${JSON.stringify(history)}.
Produce FIVE DISTINCT possible single-word clue candidates for 1..${Math.min(6,ours)} friendly cards.
Find ingenious but ordinary connections: actions and objects, materials and uses,
idioms, technology, geography, science, arts, food and multiple senses.
Early turns prefer 3-4 related friendly cards if reasonably safe, otherwise 2.
Risk profile: ${strategy}. For safe prioritize protection, for balanced prioritize safe 2-3,
for aggressive accept plausible risky 3-4 cards when trailing.
Previous clue outcomes (avoid repeating failures): ${JSON.stringify(lessons)}.
Avoid 1 until late unless there truly is no defensible pair. Re-evaluate the
whole board; don't fixate on a single category. Consider several candidate
clues and mentally simulate the first guesses of a person who DOES NOT know colors.
Dangerous cards are an absolute priority, especially assassin. Never count an
opponent, neutral, or assassin as an intended target. Be much more precise
when there is only one friendly target left. Do not repeat any past clue.
Only single English words; don't use a visible board word, its inflection,
or a clue containing a visible word as an obvious component.
JSON: {"candidates":[{"word":"CLUE","n":2,"targets":["WORD1","WORD2"],"reason":"brief explanation"}]}.
Give FIVE alternatives, not just one. Targets MUST all be unrevealed friendly words and exactly n entries.`;
    } else {
      if (!clue || !validWord(clue.word) || !Number.isInteger(clue.n) || clue.n < 0 || clue.n > 9)
        return json({ error: 'Invalid clue' }, 400);
      // Never include hidden colors in the guesser request or its prompt.
      prompt = `You are an excellent human Codenames guesser. Return JSON only.
CLUE: ${clue.word} ${clue.n}. DIFFICULTY: ${level}.
UNREVEALED PUBLIC BOARD: ${JSON.stringify(available)}.
PREVIOUS CLUES / REVEALED HISTORY: ${JSON.stringify(history)}.
Rank likely answers by direct, intuitive semantic relationship to the clue.
Consider different word senses. Prefer obvious strong links; avoid tangential
connections. You do NOT know any hidden colors, so do not invent them.
Return an ordered list with at most ${Math.min(10, available.length)} words,
most convincing first, plus your recommended number of guesses for this clue.
The recommended number may be lower than the clue count if clues are unsafe.
JSON: {"guesses":["WORD1","WORD2"],"stopAfter":2,"reason":"brief explanation"}.`;
    }
    let output:Record<string,unknown>;
    try{output=await askGemini(key,MODEL,prompt,level==='hard'?.25:.5)}
    catch(e){
      // An occasional blocked or invalid response gets one fresh attempt.
      // Quota/rate-limit errors must surface immediately instead of doubling usage.
      if(String(e).includes('429')||String(e).includes('403'))throw e;
      output=await askGemini(key,MODEL,prompt+'\nPlease return one complete, valid JSON object only.',.15);
    }
    if(role==='spymaster'){
      const own=available.filter((w:string)=>data.keys[board.indexOf(w)]===team);
      const normalize=(result:Record<string,unknown>)=>{
        const raw=Array.isArray(result.candidates)?result.candidates:[result];
        return raw.map((c:any)=>legalCandidate(c,board,available,own,history))
          .filter(Boolean).slice(0,6);
      };
      let candidates=normalize(output);
      if(!candidates.length){
        // A 422 is our validator rejecting all proposed clues, not a Gemini outage.
        // Regenerate once with the exact legal target list, keeping all safety rules.
        const retryPrompt=`${CLUE_RULES}
Your previous clue proposals could not be used because
        they failed the game's strict legality check. Generate FIVE NEW clues.
        UNREVEALED BOARD: ${JSON.stringify(available)}.
        UNREVEALED FRIENDLY WORDS (only these may be targets):
        ${JSON.stringify(own)}.
        PREVIOUS CLUES: ${JSON.stringify(history)}.
        Give one-word ordinary English clues, not any board word or its
        inflection, without including an entire visible board word.
        For each clue, choose 1 to ${Math.min(6,own.length)} distinct friendly
        targets, and set n EXACTLY to the number of listed targets.
        Focus on strong intuitive links and avoid clues suggesting the assassin
        or opponents. Risk strategy: ${strategy}. Return JSON ONLY:
        {"candidates":[{"word":"EXAMPLE","n":2,"targets":["TARGET1","TARGET2"],
        "reason":"why this connects those exact words"}]}.
        When no safe pair exists, a safe one-target clue is acceptable.`;
        try{
          const repaired=await askGemini(key,MODEL,retryPrompt,.18);
          candidates=normalize(repaired);
        }catch(e){
          if(String(e).includes('429')||String(e).includes('403'))throw e;
          // Keep the original validation error rather than mislabel as service outage.
        }
      }
      if(!candidates.length)return json({
        error:'No legal Gemini clue candidates after regeneration',
        code:'CLUE_VALIDATION_FAILED'
      },422);
      let rankings:Map<string,string[]>;
      try{rankings=await verifyClues(key,MODEL,available,candidates)}
      catch(e){
        // A malformed verifier response is recoverable. Never send an unverified
        // clue, and do not double-send requests when the provider is rate-limiting.
        if(String(e).includes('429')||String(e).includes('403'))throw e;
        try{rankings=await verifyClues(key,MODEL,available,candidates)}
        catch(e2){return json({error:'Clue verifier failed: '+String(e2 instanceof Error?e2.message:e2)},503)}
      }
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
