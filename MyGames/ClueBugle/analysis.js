/* Postgame analysis is recorded as decisions happen, so it survives any way
 * the match ends (including an assassin) and does not pretend to know a bot's
 * hidden reasoning after the fact. Private colors are shown only at game over. */
function cbRecordAIClue(g,team,clue){
  if(!g.review)g.review=[];
  const other=team==='red'?'blue':'red';
  const ranked=typeof cbRank==='function'?cbRank(g,clue.word):[];
  const predicted=ranked.slice(0,Math.max(1,clue.n));
  // Intended targets can ONLY be friendly. Enemy/bystander predictions are
  // hazards, never instructions to the player—even in a last-chance turn.
  const targets=clue.provider==='gemini'&&Array.isArray(clue.targets)?
    clue.targets.filter(w=>g.words.some((x,i)=>x===w&&g.keys[i]===team&&!g.revealed[i]))
      .map(w=>({word:w,key:team,score:null})):
    predicted.filter(x=>x.key===team).map(x=>({word:x.word,key:x.key,score:x.s}));
  const danger=ranked.filter(x=>x.key!==team).slice(0,3).map(x=>({word:x.word,key:x.key,score:x.s}));
  const leftOut=ranked.map((x,i)=>({...x,rank:i+1})).filter(x=>x.key===team&&!targets.some(y=>y.word===x.word));
  const oneAway=remaining(g,other)===1&&remaining(g,team)>1;
  const note={team,word:clue.word,n:clue.n,round:g.round,ours:remaining(g,team),theirs:remaining(g,other),targets,danger,leftOut,
    provider:clue.provider,reason:clue.reason,verification:clue.verification,
    predictedRisks:predicted.filter(x=>x.key!==team).map(x=>({word:x.word,key:x.key,score:x.s})),
    options:clue.audit?.choices||[],utility:clue.audit?.utility,oneAway,guesses:[]};
  g.review.push(note);
}
// Record every solo turn, including human clues and wrong guesses. AI-only
// reviews would otherwise omit mistakes made during a human spymaster round.
const cbOriginalGiveClue=giveClue;
giveClue=function(g,word,n){
  const result=cbOriginalGiveClue(g,word,n);
  if(!g.roundReview)g.roundReview=[];
  const aiNote=(g.review||[]).slice().reverse().find(x=>x.round===g.round&&x.team===g.turn&&x.word===g.clue.word);
  const scores=typeof cbRank==='function'?cbRank(g,g.clue.word).map((x,i)=>({word:x.word,key:x.key,score:x.s,rank:i+1})):[];
  g.roundReview.push({round:g.round,team:g.turn,word:g.clue.word,n:g.clue.n,ai:!!aiNote,scores,guesses:[]});
  return result;
};
const cbOriginalGuess=guess;
guess=function(g,i){
  const team=g.turn,word=g.words[i],key=g.keys[i];
  const review=(g.review||[]).slice().reverse().find(x=>x.team===team&&!x.closed);
  if(review)review.guesses.push({word,key});
  const round=(g.roundReview||[]).slice().reverse().find(x=>x.team===team&&!x.closed);
  if(round)round.guesses.push({word,key,score:round.scores.find(x=>x.word===word)?.score,rank:round.scores.find(x=>x.word===word)?.rank});
  const result=cbOriginalGuess(g,i);
  if(review&&(g.turn!==team||g.winner))review.closed=true;
  if(round&&(g.turn!==team||g.winner))round.closed=true;
  return result;
};
const cbOriginalEndTurn=endTurn;
endTurn=function(g){
  if(g.review){const last=g.review.slice().reverse().find(x=>x.team===g.turn&&!x.closed);if(last)last.closed=true}
  if(g.roundReview){const last=g.roundReview.slice().reverse().find(x=>x.team===g.turn&&!x.closed);if(last)last.closed=true}
  return cbOriginalEndTurn(g);
};
function cbCardType(key,team){
  return key===team?'our card':key==='assassin'?'assassin':key==='neutral'?'bystander':'opponent card';
}
function cbWhy(note){
  if(note.provider==='gemini'&&note.reason)return note.reason;
  const candidates=note.targets.filter(x=>x.key===note.team);
  const nonteam=note.predictedRisks||[];
  if(note.oneAway)return `The opponents had one card left. The bot had to try for all ${note.ours} remaining cards in a single turn, even with a weak connection.`;
  const words=candidates.map(x=>x.word).join(' and ');
  if(candidates.length>1&&!nonteam.length)return `The bot thought “${note.word}” could connect ${words}. Its model ranked those as the first ${candidates.length} guesses on this board.`;
  if(candidates.length===1&&!nonteam.length)return `The bot found one comparatively clear connection to ${words}. Other possible groups looked riskier on this board.`;
  return `The bot stretched for a larger group because of the game situation. Its own ranking included ${nonteam.length} risky card${nonteam.length===1?'':'s'} among the first ${note.n}.`;
}
function cbPct(score){return score==null?'—':Math.round(score*100)+'/100'}
function cbNumericalDetails(note){
  const escape=s=>esc(s);
  const verifier=note.verification;
  const verifierDetail=verifier?`<p><b>Independent Gemini guesser check:</b> predicted order ${escape((verifier.predicted||[]).join(' → '))}. ${verifier.risks?.length?`Risky cards within the intended guesses: ${escape(verifier.risks.join(', '))}.`:'No predicted incorrect cards in the intended group.'} Comparison score ${Number(verifier.score||0).toFixed(1)} (a ranking score, not a probability).</p>`:'';
  const chosen=note.options.find(x=>x.word===note.word&&x.n===note.n);
  const ordered=note.options.filter(x=>x.word!==note.word).slice(0,4);
  const alternatives=ordered.length?ordered.map(x=>`<li><b>${escape(x.word)} · ${x.n}</b> — decision score ${x.score.toFixed(1)} (${x.hits} expected friendly, ${x.risk} risky among first ${x.n})${note.utility!=null?`; ${Math.max(0,note.utility-x.score).toFixed(1)} points below the chosen clue`:''}</li>`).join(''):'<li>No other competitive clue scores were retained.</li>';
  const targets=note.targets.map((x,i)=>`<li><b>#${i+1} ${escape(x.word)}</b> — match ${cbPct(x.score)}; ${escape(cbCardType(x.key,note.team))}</li>`).join('');
  const incorrect=note.guesses.filter(x=>x.key!==note.team).map(x=>`<li><b>${escape(x.word)}</b> — wrong-card match ${cbPct(cbSimilarity(note.word,x.word))}; ${escape(cbCardType(x.key,note.team))}</li>`).join('');
  const missed=note.leftOut?.length?note.leftOut.map(x=>`<li><b>${escape(x.word)}</b> — match ${cbPct(x.s)}, ranked #${x.rank}; outside the clue's ${note.n} planned guesses${x.s<.42?' and only weakly associated':''}.</li>`).join(''):'<li>No remaining friendly words were omitted.</li>';
  return `<div class="review-numbers"><h4>Numbers behind this decision</h4>${verifierDetail}<p><b>Clue decision score:</b> ${note.utility==null?'Unavailable for this fallback clue':note.utility.toFixed(1)+' points'}${chosen?' (higher is better among candidates considered)':''}. A match score is the AI’s <em>relative association strength</em> from 0 to 100, <b>not</b> the chance that a person will guess correctly.</p><div class="review-columns"><div><b>Intended friendly picks</b><ol>${targets}</ol></div><div><b>Our words left out</b><ul>${missed}</ul></div></div>${incorrect?`<b>Incorrect guesses and their match scores</b><ul>${incorrect}</ul>`:''}<b>Other clues considered</b><ul>${alternatives}</ul></div>`;
}
function cbWrongRounds(g,teamFilter){
  const escape=s=>esc(s);
  const rounds=(g.roundReview||[]).filter(r=>(!teamFilter||r.team===teamFilter)&&r.guesses.some(x=>x.key!==r.team));
  if(rounds.length)return `<div class="review-mistakes"><h3>Every round with a wrong guess (${rounds.length})</h3>${rounds.map(r=>{
    const bad=r.guesses.filter(x=>x.key!==r.team);
    const good=r.guesses.filter(x=>x.key===r.team).length;
    return `<div class="review-error"><b>Round ${r.round} · ${r.team.toUpperCase()} · ${escape(r.word)} ${r.n}</b><p>${good} correct before the turn ended. Wrong guess: ${bad.map(x=>`<strong>${escape(x.word)}</strong> (${escape(cbCardType(x.key,r.team))}) — <b>wrong-card match ${cbPct(x.score)}</b>, guesser rank #${x.rank??'?'}`).join(', ')}.</p><p class="small muted">The match score shows how strongly the AI associated the incorrect card with this clue. It is not the probability that a human would guess it.</p></div>`;
  }).join('')}</div>`;
  const log=(g.log||[]).filter(s=>{const m=s.match(/^(RED|BLUE) guessed (.+) — (RED|BLUE|NEUTRAL|ASSASSIN)$/i);return m&&(!teamFilter||m[1].toLowerCase()===teamFilter)&&m[1].toLowerCase()!==m[3].toLowerCase()});
  return `<div class="review-mistakes"><h3>Wrong guesses${log.length?' ('+log.length+')':''}</h3><p>${log.length?'From the available match log: '+escape(log.join(' · ')):'No wrong guesses were recorded in the available match log.'}</p></div>`;
}
// Escape all model-authored text before rendering it into the game page.
function cbLLMReviewHTML(data,rounds){
  if(!data)return '<p>Written feedback unavailable.</p>';
  const record=new Map((rounds||[]).map(r=>[Number(r.round),r]));
  const notes=(data.rounds||[]).filter(r=>record.has(Number(r.round))).map(r=>{
    const known=record.get(Number(r.round));
    const score=x=>`${Math.max(0,Math.min(100,Math.round(Number(x.closeness)||0)))}/100`;
    const relevant=(r.targets||[]).filter(x=>typeof x.word==='string').map(x=>`${esc(x.word)} ${score(x)}`).join(', ');
    const wrong=(r.guessAssessments||[]).filter(x=>x.color!=='red'&&typeof x.word==='string').map(x=>`${esc(x.word)} (${esc(x.color)}, ${score(x)})`).join(', ');
    const correct=(r.guessAssessments||[]).filter(x=>x.color==='red'&&typeof x.word==='string').map(x=>`${esc(x.word)} ${score(x)}`).join(', ');
    return `<div class="cb-written-round"><b>Round ${Number(r.round)}</b><p>${esc(String(r.clueAssessment||'').slice(0,190))}</p>
      <p class="small"><b>${known.ai?'Intended words':'Likely human targets (inferred by Gemini, not recorded)'}:</b> ${relevant||'Not identified'}</p>
      <p class="small"><b>Correct guesses:</b> ${correct||'None'}${wrong?` · <b>Incorrect:</b> ${wrong}`:''}</p></div>`;
  }).join('');
  return `<p>${esc(String(data.overview||'').slice(0,450))}</p>${notes}`;
}
function cbStartLLMReview(g,role){
  if(g._llmReviewState==='loading'||g._llmReviewState==='ready')return;
  g._llmReviewState='loading';
  // Snapshot turn history before submitting; never leak the hidden board
  // during gameplay. This is called only once g.winner is present.
  const rounds=(g.roundReview||[]).filter(r=>r.team==='red').map(r=>({round:r.round,clue:r.word,n:r.n}));
  cbGetPostgameReview(g,role).then(data=>{
    g._llmReviewState='ready';g._llmReviewData=data;
    if(game!==g||mode!=='solo')return;
    const el=document.getElementById('cb-llm-report');
    if(el)el.innerHTML=cbLLMReviewHTML(data,rounds);
  }).catch(error=>{
    g._llmReviewState='error';
    if(game!==g||mode!=='solo')return;
    const el=document.getElementById('cb-llm-report');
    if(el)el.innerHTML='<p>Written commentary is temporarily unavailable. Word-by-word comparisons above are unaffected.</p>';
  });
}
function cbPostgame(g,solo){
  if(!g?.winner)return '';
  const team=solo?'red':(typeof online!=='undefined'?online?.player?.team:'red');
  const rounds=(g.roundReview||[]).filter(r=>r.team===team);
  const format=(v)=>esc(String(v));
  const scale=(v)=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n*100))):null};
  // Scores are offline semantic association estimates, NOT measured human
  // agreement or calibrated probabilities. They always load, even if Gemini fails.
  const percent=(clue,word,recorded)=>{
    const s=recorded?.scores?.find(x=>x.word===word)?.score;
    return scale(s==null?cbSimilarity(clue,word):s);
  };
  const meter=(word,color,pct,tag)=>`<div class="cb-match-line"><div class="cb-match-name"><b>${format(word)}</b><small>${format(tag)}</small></div><div class="cb-match-meter"><span style="width:${pct??0}%"></span></div><b class="cb-match-score">${pct==null?'—':pct+'/100'}</b></div>`;
  const cards=rounds.map((r,index)=>{
    const note=(g.review||[]).find(n=>n.team===team&&n.round===r.round&&n.word===r.word);
    const targets=(note?.targets||[]).map(x=>x.word);
    const inferred=!note;
    // The human Spymaster's true intentions were never recorded. Infer only
    // from friendly board cards, and say explicitly that these are guesses.
    const guesses=r.guesses||[];
    const candidates=(r.scores||[]).filter(x=>x.key===team);
    const likely=inferred?candidates.slice(0,Math.max(1,Math.min(3,r.n))).map(x=>x.word):targets;
    const intended=likely.length?likely.map(w=>meter(w,team,percent(r.word,w,r),'friendly card')).join(''):'<p class="muted small">No intended targets recorded.</p>';
    const picked=guesses.length?guesses.map(x=>meter(x.word,x.key,percent(r.word,x.word,r),x.key===team?'correct':cbCardType(x.key,team))).join(''):'<p class="muted small">No guesses this round.</p>';
    const hazards=(r.scores||[]).filter(x=>x.key!==team).sort((a,b)=>b.score-a.score);
    const assassin=hazards.find(x=>x.key==='assassin');
    const closest=hazards.filter(x=>x.key!=='assassin').slice(0,2);
    const nearby=[...new Map([...(assassin?[assassin]:[]),...closest].map(x=>[x.word,x])).values()];
    const risky=nearby.length?nearby.map(x=>meter(x.word,x.key,percent(r.word,x.word,r),cbCardType(x.key,team))).join(''):'<p class="muted small">No unrevealed risky cards recorded.</p>';
    const correct=guesses.filter(x=>x.key===team).length;
    const missed=guesses.filter(x=>x.key!==team).length;
    const summary=missed?`${correct} correct · ${missed} wrong`: `${correct} correct`;
    return `<details class="review-turn cb-simple-round" ${index===0?'open':''}>
      <summary><b>${format(r.word)} · ${Number(r.n)}</b><small> Round ${Number(r.round)} · ${summary}</small></summary>
      <div class="review-body">
        <div class="cb-review-section"><b>${inferred?'Likely intended words (inferred)':'Intended words'}</b>${intended}</div>
        <div class="cb-review-section"><b>What was guessed</b>${picked}</div>
        <div class="cb-review-section"><b>Other tempting words</b>${risky}</div>
      </div>
    </details>`;
  }).join('');
  const noData=rounds.length?'':'<p>Round-by-round records were not available for this match.</p>';
  const llm=solo?`<details class="review-turn cb-gemini-commentary"><summary><b>Gemini's written feedback</b> <small>optional</small></summary>
    <div class="review-body"><div id="cb-llm-report">${g._llmReviewState==='ready'?cbLLMReviewHTML(g._llmReviewData,rounds):g._llmReviewState==='error'?'The written review was unavailable. Your word comparisons above are complete.':'Writing a brief review…'}</div>
    <button class="secondary" id="cb-retry-review" type="button">Retry written review</button></div></details>`:'';
  return `<section id="postgame" class="postgame panel"><div class="review-heading"><div><div class="eyebrow">After-action report</div><h2>Clue strength</h2></div><span class="review-result ${format(g.winner)}">${format(g.winner.toUpperCase())} WIN</span></div>
    <p class="small muted">Connection scores compare clue and word meanings on a 0–100 relative scale. They are estimates, not probabilities. The assassin is always listed separately when available.</p>
    <div class="cb-simple-rounds">${cards||noData}</div>${llm}
  </section>`;
}

if(typeof window!=='undefined'&&typeof document!=='undefined'&&!window.__cbRetryReviewBound){
  window.__cbRetryReviewBound=true;
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('#cb-retry-review') && typeof game!=='undefined'&&game?.winner){
      game._llmReviewState=null;cbStartLLMReview(game,typeof myRole==='string'?myRole:'guesser');
      const el=document.getElementById('cb-llm-report');
      if(el)el.textContent='Trying again…';
    }
  });
}
