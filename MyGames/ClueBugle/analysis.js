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
    provider:clue.provider,reason:clue.reason,
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
  const chosen=note.options.find(x=>x.word===note.word&&x.n===note.n);
  const ordered=note.options.filter(x=>x.word!==note.word).slice(0,4);
  const alternatives=ordered.length?ordered.map(x=>`<li><b>${escape(x.word)} · ${x.n}</b> — decision score ${x.score.toFixed(1)} (${x.hits} expected friendly, ${x.risk} risky among first ${x.n})${note.utility!=null?`; ${Math.max(0,note.utility-x.score).toFixed(1)} points below the chosen clue`:''}</li>`).join(''):'<li>No other competitive clue scores were retained.</li>';
  const targets=note.targets.map((x,i)=>`<li><b>#${i+1} ${escape(x.word)}</b> — match ${cbPct(x.score)}; ${escape(cbCardType(x.key,note.team))}</li>`).join('');
  const incorrect=note.guesses.filter(x=>x.key!==note.team).map(x=>`<li><b>${escape(x.word)}</b> — wrong-card match ${cbPct(cbSimilarity(note.word,x.word))}; ${escape(cbCardType(x.key,note.team))}</li>`).join('');
  const missed=note.leftOut?.length?note.leftOut.map(x=>`<li><b>${escape(x.word)}</b> — match ${cbPct(x.s)}, ranked #${x.rank}; outside the clue's ${note.n} planned guesses${x.s<.42?' and only weakly associated':''}.</li>`).join(''):'<li>No remaining friendly words were omitted.</li>';
  return `<div class="review-numbers"><h4>Numbers behind this decision</h4><p><b>Clue decision score:</b> ${note.utility==null?'Unavailable for this fallback clue':note.utility.toFixed(1)+' points'}${chosen?' (higher is better among candidates considered)':''}. A match score is the AI’s <em>relative association strength</em> from 0 to 100, <b>not</b> the chance that a person will guess correctly.</p><div class="review-columns"><div><b>Intended friendly picks</b><ol>${targets}</ol></div><div><b>Our words left out</b><ul>${missed}</ul></div></div>${incorrect?`<b>Incorrect guesses and their match scores</b><ul>${incorrect}</ul>`:''}<b>Other clues considered</b><ul>${alternatives}</ul></div>`;
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
function cbPostgame(g,solo){
  if(!g?.winner)return '';
  const escape=s=>esc(s);
  const loser=g.winner==='red'?'blue':'red';
  const assassinHit=g.words.find((w,i)=>g.keys?.[i]==='assassin'&&g.revealed[i]);
  const reason=assassinHit?`${loser.toUpperCase()} selected ${assassinHit}, the assassin. That immediately ended the match.`:
    `${g.winner.toUpperCase()} uncovered every one of its agents first.`;
  const unclaimed=team=>g.words.filter((w,i)=>g.keys?.[i]===team&&!g.revealed[i]);
  const red=unclaimed('red'),blue=unclaimed('blue');
  const userTeam=solo?'red':(typeof online!=='undefined'?online?.player?.team:null);
  const notes=(g.review||[]).filter(note=>!userTeam||note.team===userTeam);
  function cbRoundResult(note){
    const intended=note.targets.filter(x=>x.key===note.team).map(x=>x.word);
    const picked=note.guesses.filter(x=>x.key===note.team).map(x=>x.word);
    const wrong=note.guesses.some(x=>x.key!==note.team);
    if(!wrong&&intended.length&&intended.every(w=>picked.includes(w)))return {label:'All intended cards',type:'good'};
    if(!wrong&&intended.length&&picked.length>=intended.length&&intended.some(w=>!picked.includes(w)))return {label:'Friendly swap',type:'swap'};
    return {label:'Missed target',type:'miss'};
  }
  const rows=notes.map((note,idx)=>{
    const result=cbRoundResult(note);
    const guesses=note.guesses.length?note.guesses.map(x=>`${escape(x.word)} (${escape(cbCardType(x.key,note.team))}; match ${cbPct(cbSimilarity(note.word,x.word))})`).join(' → '):'No guesses followed this clue.';
    const targets=note.targets.length?note.targets.map(x=>`<span class="review-chip good">${escape(x.word)} <small>our card · ${cbPct(x.score)}</small></span>`).join(' '):'<span class="muted">No confidently ranked friendly targets</span>';
    const danger=note.danger.filter(x=>x.key!==note.team&&x.score>=note.targets.at(-1)?.score-.07);
    const caution=danger.length?`<p class="review-warning">Nearby danger (not intended): ${escape(danger.map(x=>x.word+' ('+cbCardType(x.key,note.team)+', '+cbPct(x.score)+')').join(', '))}.</p>`:'';
    return `<details class="review-turn" ${idx===notes.length-1?'open':''}><summary><span class="review-team ${note.team}">${note.team.toUpperCase()}</span> <b>${escape(note.word)} · ${note.n}</b> <small>Round ${note.round}</small> <span class="review-round-status ${result.type}">${result.label}</span></summary><div class="review-body"><p>${escape(cbWhy(note))}</p><div><b>Friendly cards the bot intended:</b><div class="review-chips">${targets}</div></div>${caution}<p><b>What actually got guessed (with scores):</b> ${guesses}</p>${result.type==='swap'?'<p class="review-warning">You found the right number of team cards, but one or more were different from those planned by the AI.</p>':''}${cbNumericalDetails(note)}<p class="small muted">This is the bot's recorded ranking and risk estimate, not a guaranteed human interpretation.</p></div></details>`;
  }).join('');
  const guessEvents=(g.log||[]).filter(x=>x.includes(' guessed ')).slice(0,8);
  return `<section id="postgame" class="postgame panel"><div class="review-heading"><div><div class="eyebrow">After-action report</div><h2>How this game unfolded</h2></div><span class="review-result ${g.winner}">${g.winner.toUpperCase()} WIN</span></div><p class="review-outcome">${escape(reason)}</p><div class="review-stats"><div><b>${remaining(g,'red')}</b><small>Red cards left</small></div><div><b>${remaining(g,'blue')}</b><small>Blue cards left</small></div><div><b>${notes.length}</b><small>Your team's AI clues</small></div></div><div class="review-explain"><h3>How to read the analysis</h3><p>Only your team's clues are shown. Each round is labeled <b>All intended cards</b>, <b>Friendly swap</b> (you found different friendly words), or <b>Missed target</b>. Expand a round to see its planned cards, model scores, alternatives, and mistakes. Match scores are relative associations, not probabilities.</p></div>${cbWrongRounds(g,userTeam)}<h3>Your AI teammate's clues</h3>${rows||`<p>${solo?'You played the spymaster, so no teammate AI clues were recorded.':'No AI clue decisions were recorded for your team.'}</p>`}<div class="review-footer"><h3>Words still hidden</h3><p><b>Red:</b> ${red.length?escape(red.join(', ')):'None'}<br><b>Blue:</b> ${blue.length?escape(blue.join(', ')):'None'}</p>${!notes&&guessEvents.length?`<h3>Recent guesses</h3><p>${escape(guessEvents.join(' · '))}</p>`:''}<p class="small muted">The colors of all unselected cards are now visible on the board. Every ending—including choosing the assassin—shows this report.</p></div></section>`;
}
