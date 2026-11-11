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
// Best-effort per-worker throttling; Google free-tier quotas are the final
// limit. A production, paid deployment should add durable DB-backed quotas.
const traffic = new Map<string,{minute:number,count:number}>();

function parseJson(text: string) {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(stripped);
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
TEAM: ${team}. DIFFICULTY: ${level}. REMAINING FRIENDLY: ${ours}.
UNREVEALED BOARD WITH HIDDEN COLORS: ${JSON.stringify(cards)}.
RECENT GAME LOG: ${JSON.stringify(history)}.
Select ONE normal dictionary word clue, plus an integer count of 1..${Math.min(6,ours)}.
Find ingenious but ordinary connections: actions and objects, materials and uses,
idioms, technology, geography, science, arts, food and multiple senses.
Early turns prefer 3-4 related friendly cards if reasonably safe, otherwise 2.
Avoid 1 until late unless there truly is no defensible pair. Re-evaluate the
whole board; don't fixate on a single category. Consider several candidate
clues and mentally simulate the first guesses of a person who DOES NOT know colors.
Dangerous cards are an absolute priority, especially assassin. Never count an
opponent, neutral, or assassin as an intended target. Be much more precise
when there is only one friendly target left. Do not repeat any past clue.
Only single English words; don't use a visible board word, its inflection,
or a clue containing a visible word as an obvious component.
JSON: {"word":"CLUE","n":2,"targets":["WORD1","WORD2"],"reason":"brief explanation"}.
Targets MUST all be unrevealed friendly words and exactly n entries.`;
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22000);
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type':'application/json', 'x-goog-api-key':key },
        body: JSON.stringify({ contents:[{parts:[{text:prompt}]}],
          generationConfig:{responseMimeType:'application/json',temperature:level==='hard'?.35:.65,maxOutputTokens:1400} }),
      });
    } finally { clearTimeout(timeout); }
    if (!response.ok) return json({ error:`Gemini request failed (${response.status})` }, 503);
    const raw = await response.json();
    const output = parseJson(raw.candidates?.[0]?.content?.parts?.map((p:{text?:string})=>p.text||'').join('')||'');
    if (role === 'spymaster') {
      const word = String(output.word||'').trim().toUpperCase();
      const n = Number(output.n);
      const targets = Array.isArray(output.targets) ? output.targets.map((x:unknown)=>String(x).toUpperCase()) : [];
      const own = available.filter((w:string)=>data.keys[board.indexOf(w)]===team);
      const singular = (s:string) => s.endsWith('IES') ? s.slice(0,-3)+'Y' : s.endsWith('S')?s.slice(0,-1):s;
      const legal = validWord(word) && !board.some((w:string)=>singular(w)===singular(word)||
        (w.length>=4&&(word.startsWith(w)||word.endsWith(w))));
      const safe = Number.isInteger(n) && n>=1 && n<=Math.min(6,own.length) &&
        targets.length===n && new Set(targets).size===n && targets.every((w:string)=>own.includes(w));
      if (!legal || !safe || history.some((h:string)=>h.includes('clue: '+word+' ')))
        return json({ error:'Gemini proposed an illegal or unsafe clue; retry or use fallback' }, 422);
      return json({ word,n,targets,reason:String(output.reason||'').slice(0,350),provider:'gemini' });
    }
    const guesses = Array.isArray(output.guesses) ? output.guesses.map((w:unknown)=>String(w).toUpperCase()) : [];
    const clean = [...new Set(guesses)].filter((w:string)=>available.includes(w));
    if (!clean.length) return json({ error:'Gemini returned no legal guesses' }, 422);
    const stopAfter = Math.max(1,Math.min(clue.n+1,clean.length,Number(output.stopAfter)||clue.n));
    return json({ guesses:clean,stopAfter,reason:String(output.reason||'').slice(0,350),provider:'gemini' });
  } catch (e) { return json({ error:e instanceof Error?e.message:'AI unavailable' }, 503); }
});
