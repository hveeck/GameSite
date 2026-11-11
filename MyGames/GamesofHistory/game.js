/* Rithmomachia: playable Renaissance-style ruleset. All tactical rules share this engine. */
(() => {
'use strict';
const $=id=>document.getElementById(id), ROWS=16,COLS=8;
const TYPE={c:'Circle',t:'Triangle',s:'Square',p:'Pyramid'};
const WHITE={c:[2,4,4,6,6,8,8,10],t:[6,9,12,16,20,25,30,36],s:[15,25,28,36,45,49,66,81]};
const BLACK={c:[3,5,5,7,7,9,9,11],t:[9,16,20,25,30,36,42,49],s:[28,36,45,49,66,81,120,121]};
const PYR={white:[36,25,16,9,4,1],black:[64,49,36,25,16]};
const ORTH=[[1,0],[-1,0],[0,1],[0,-1]],DIAG=[[1,1],[1,-1],[-1,1],[-1,-1]];
const ALL=[...ORTH,...DIAG];
let state=null, selected=-1, opts={difficulty:2,side:'white',victory:'hybrid'}, lastHuman=null, botTimer=null, gameId=0, highlightHint=null;
const other=s=>s==='white'?'black':'white';
const pos=(r,c)=>r*8+c, rc=i=>[Math.floor(i/8),i%8], inside=(r,c)=>r>=0&&r<16&&c>=0&&c<8;
const val=p=>p.t==='p'?p.layers.reduce((a,b)=>a+b,0):p.v;
const name=s=>s==='white'?'Ivory':'Obsidian';
function piece(side,t,v){return {side,t,v, ...(t==='p'?{layers:PYR[side].slice()}: {})}}
function initial(){
 const b=Array(128).fill(null);
 // Four carefully staggered rows per army. The opposing number armies are asymmetrical.
 for(const [side,start,dir,stock] of [['black',0,1,BLACK],['white',15,-1,WHITE]]){
  const rowC=start+dir*3,rowT=start+dir*2,rowS=start+dir;
  stock.c.forEach((v,c)=>b[pos(rowC,c)]=piece(side,'c',v));
  stock.t.forEach((v,c)=>b[pos(rowT,c)]=piece(side,'t',v));
  stock.s.forEach((v,c)=>b[pos(rowS,c)]=piece(side,'s',v));
  // The pyramid replaces a square rather than adding a twenty-fifth man.
  b[pos(rowS,3)]=piece(side,'p',0);
 }
 return {b,turn:'black',ply:0,caps:{white:[],black:[]},history:[],winner:null,reason:'',last:null};
}
function movePatterns(p){
 if(p.t==='c')return [[1,ORTH]];
 if(p.t==='t')return [[2,DIAG]];
 if(p.t==='s')return [[3,ALL]];
 const pts=[];if(p.layers.some(v=>[1,4,16].includes(v)))pts.push([1,ORTH]);if(p.layers.some(v=>[9,16,25,36].includes(v)))pts.push([2,DIAG]);if(p.layers.some(v=>[25,36,49,64].includes(v)))pts.push([3,ALL]);return pts;
}
function destinations(b,from,p){const [r,c]=rc(from),ret=[];
 for(const [steps,dirs] of movePatterns(p))for(const [dr,dc] of dirs){let clear=true;for(let k=1;k<=steps;k++){const nr=r+dr*k,nc=c+dc*k;if(!inside(nr,nc)||b[pos(nr,nc)]){clear=false;break}}if(clear){const dst=pos(r+dr*steps,c+dc*steps);if(!ret.includes(dst))ret.push(dst)}}return ret;
}
function canAttack(b,from,to,p){const [r,c]=rc(from),[tr,tc]=rc(to);const dr=tr-r,dc=tc-c,ad=Math.abs(dr),ac=Math.abs(dc);
 if(!dr&&!dc)return false;
 return movePatterns(p).some(([n,dirs])=>dirs.some(([vr,vc])=>vr*n===dr&&vc*n===dc)&&clearLine(b,from,to));
}
function clearLine(b,from,to){const [r,c]=rc(from),[tr,tc]=rc(to);const dr=Math.sign(tr-r),dc=Math.sign(tc-c),steps=Math.max(Math.abs(tr-r),Math.abs(tc-c));for(let k=1;k<steps;k++)if(b[pos(r+dr*k,c+dc*k)])return false;return true}
function candidates(b,side){const out=[];for(let i=0;i<128;i++)if(b[i]?.side===side)for(const to of destinations(b,i,b[i]))out.push({from:i,to});return out}
function numbers(p){return p.t==='p'?[...p.layers,val(p)]:[p.v]}
function matches(p,v){return numbers(p).includes(v)}
function attackedBy(b,side,target){const a=[];for(let i=0;i<128;i++)if(b[i]?.side===side&&canAttack(b,i,target,b[i]))a.push([i,b[i]]);return a}
function assault(b,from,target,p,q){const [r,c]=rc(from),[tr,tc]=rc(target);const dr=tr-r,dc=tc-c;const d=Math.max(Math.abs(dr),Math.abs(dc));if(d<2||!(dr===0||dc===0||Math.abs(dr)===Math.abs(dc))||!clearLine(b,from,target))return false;
 // Traditional distance-number assault, including both occupied endpoints.
 const distance=d+1;return numbers(p).some(a=>numbers(q).some(v=>a*distance===v||v*distance===a));
}
function captureTarget(s,target,cause,events){let p=s.b[target];if(!p)return;const amount=val(p);if(p.t==='p'){
  const layer=cause.layer;
  if(layer!=null&&p.layers.includes(layer)){p.layers.splice(p.layers.indexOf(layer),1);events.push(`${name(other(p.side))} removes a ${layer} layer from the ${name(p.side)} pyramid (${cause.reason}).`);if(p.layers.length)return}
 }
 s.b[target]=null;s.caps[other(p.side)].push({t:p.t,v:amount});events.push(`${name(other(p.side))} captures ${name(p.side)} ${TYPE[p.t].toLowerCase()} ${amount} by ${cause.reason}.`);
}
function captureAfter(s,mover,events){const b=s.b,attacker=b[mover];if(!attacker)return;const side=attacker.side,enemy=other(side);const proposed=new Map();
 for(let j=0;j<128;j++){
  const target=b[j];if(!target||target.side!==enemy)continue;
  let reason=null,layer=null;
  if(canAttack(b,mover,j,attacker)){
   const common=numbers(attacker).find(v=>matches(target,v));if(common!==undefined){reason='equality';if(target.t==='p'&&target.layers.includes(common))layer=common}
   else{const friends=attackedBy(b,side,j).filter(([i])=>i!==mover);outer:for(const [,f] of friends)for(const a of numbers(attacker))for(const v of numbers(f))if(matches(target,a+v)||matches(target,Math.abs(a-v))){reason=`ambush (${a} ${matches(target,a+v)?'+':'−'} ${v})`;break outer}}
  }
  if(!reason&&assault(b,mover,j,attacker,target))reason='assault';
  if(!reason){ // Siege: the moving side occupies or controls every escape destination.
   const escapes=destinations(b,j,target);if(!escapes.length){let closed=true;for(const [dr,dc] of ORTH){const [r,c]=rc(j),nr=r+dr,nc=c+dc;if(inside(nr,nc)&&!b[pos(nr,nc)]){closed=false;break}}if(closed&&Math.max(Math.abs(rc(mover)[0]-rc(j)[0]),Math.abs(rc(mover)[1]-rc(j)[1]))<=3)reason='siege'}
  }
  if(reason)proposed.set(j,{reason,layer});
 }
 for(const [target,cause] of proposed)captureTarget(s,target,cause,events);
}
function progression(a,b,c){if(a===b||b===c||a===c)return null;if(a+c===2*b)return 'arithmetic';if(a*c===b*b)return 'geometric';if(2*a*c===b*(a+c))return 'harmonic';return null}
function harmony(s,side){const b=s.b;for(let i=0;i<128;i++){
 const p=b[i];if(!p||p.side!==side)continue;const [r,c]=rc(i);if(side==='white'&&r>=8||side==='black'&&r<8)continue;
 for(const [dr,dc] of ALL)for(let step=1;step<=4;step++){
  const r2=r+dr*step,c2=c+dc*step,r3=r+dr*step*2,c3=c+dc*step*2;
  if(!inside(r3,c3)||!inside(r2,c2))continue;
  if(side==='white'&&(r2>=8||r3>=8)||side==='black'&&(r2<8||r3<8))continue;
  const p2=b[pos(r2,c2)],p3=b[pos(r3,c3)];if(!p2||!p3||p2.side!==side||p3.side!==side)continue;
  for(const a of numbers(p))for(const v of numbers(p2))for(const z of numbers(p3)){const kind=progression(a,v,z);if(kind)return {kind,positions:[i,pos(r2,c2),pos(r3,c3)],values:[a,v,z]}}
 }
 }return null}
function afterMove(prev,m){const s={b:prev.b.map(p=>p?{...p,...(p.layers?{layers:[...p.layers]}:{})}:null),turn:prev.turn,ply:prev.ply+1,caps:{white:[...prev.caps.white],black:[...prev.caps.black]},history:prev.history.slice(),winner:null,reason:'',last:m};const p=s.b[m.from];s.b[m.to]=p;s.b[m.from]=null;const events=[];captureAfter(s,m.to,events);const h=harmony(s,p.side);if(h){s.winner=p.side;s.reason=`${h.kind[0].toUpperCase()+h.kind.slice(1)} harmony: ${h.values.join(' · ')}`;s.harmony=h}
 const count=s.caps[p.side].length;
 if(!s.winner&&((opts.victory==='hybrid'&&count>=8)||(opts.victory==='captures'&&count>=12))){s.winner=p.side;s.reason=`Captured ${count} opposing pieces`}
 if(!s.winner&&!candidates(s.b,other(p.side)).length){s.winner=p.side;s.reason='The opposing army has no legal moves'}
 if(!s.winner&&s.ply>=240){const w=s.caps.white.length,bl=s.caps.black.length;s.winner=w===bl?'draw':w>bl?'white':'black';s.reason='Turn limit reached; capture count decides'}
 s.history.push({m,events,side:p.side,kind:p.t,value:val(p)});s.turn=other(p.side);return s}
function score(s,side){const foe=other(side);if(s.winner)return s.winner===side?100000:s.winner===foe?-100000:0;
 let x=(s.caps[side].length-s.caps[foe].length)*85;
 x+=(s.caps[side].reduce((a,p)=>a+Math.sqrt(p.v),0)-s.caps[foe].reduce((a,p)=>a+Math.sqrt(p.v),0))*2;
 const alive=s.b.filter(Boolean), n1=alive.filter(p=>p.side===side).length,n2=alive.length-n1;x+=(n1-n2)*38;
 for(let i=0;i<128;i++){const p=s.b[i];if(!p)continue;const [r,c]=rc(i),adv=p.side==='white'?15-r:r,cent=3.5-Math.abs(c-3.5),weight=p.t==='p'?1.8:1;x+=(p.side===side?1:-1)*(adv*1.8+cent*.5)*weight}
 return x}
function moveValue(s,m,side){const ns=afterMove(s,m);let v=score(ns,side);const gain=ns.caps[side].length-s.caps[side].length;v+=gain*115;const my=s.b[m.from],dest=rc(m.to);v+=(my.t==='p'?-1:0)+(Math.random()-.5)*.05;return {m,s:ns,v}}
function botPick(s,diff){const side=s.turn,moves=candidates(s.b,side);if(!moves.length)return null;
 if(diff===0)return moves[Math.floor(Math.random()*moves.length)];
 let scored=moves.map(m=>moveValue(s,m,side));scored.sort((a,b)=>b.v-a.v);
 if(diff===1){const top=scored.slice(0,Math.max(5,Math.ceil(scored.length*.3)));return top[Math.floor(Math.random()*top.length)].m}
 if(diff===2){const top=scored.slice(0,Math.min(8,scored.length));const weights=top.map((_,i)=>Math.exp(-i*.55)),sum=weights.reduce((a,b)=>a+b);let n=Math.random()*sum;for(let i=0;i<top.length;i++){n-=weights[i];if(n<=0)return top[i].m}return top[0].m}
 // Master and Grandmaster search opponent counterplay on strongest candidate moves.
 const breadth=diff===3?9:18, replyBreadth=diff===3?22:42;
 let best=null,bestScore=-Infinity;
 for(const item of scored.slice(0,breadth)){
  if(item.s.winner)return item.m;
  const replies=candidates(item.s.b,other(side));let responses=replies.map(m=>moveValue(item.s,m,other(side)));responses.sort((a,b)=>b.v-a.v);
  const worst=responses.slice(0,replyBreadth).reduce((max,r)=>Math.max(max,score(r.s,other(side))),-Infinity);
  let value=item.v-(worst===-Infinity?0:worst)*(.65+(diff-3)*.2);
  // At highest level, consider exposed high-value pyramid positions and three-in-a-row proximity.
  if(diff===4){const myP=item.s.b.findIndex(p=>p?.side===side&&p.t==='p');if(myP>=0&&attackedBy(item.s.b,other(side),myP).length)value-=90}
  value+=(Math.random()-.5)*(diff===3?16:2);
  if(value>bestScore){bestScore=value;best=item.m}
 }return best||scored[0].m
}
function render(){if(!state)return;const b=$('board');b.innerHTML='';const legal=selected>=0&&state.b[selected]?.side===opts.side?destinations(state.b,selected,state.b[selected]):[];
 const landscape=window.innerWidth>820;
 for(let i=0;i<128;i++){const p=state.b[i],cell=document.createElement('button');cell.type='button';cell.className='cell '+(((Math.floor(i/8)+i%8)%2)?'dark ':'')+(Math.floor(i/8)<8?'enemy-half ':'')+(selected===i?'selected ':'')+(legal.includes(i)&&$('showThreats').checked?'legal ':'')+(state.last&&(state.last.from===i||state.last.to===i)?'last ':'')+(highlightHint&&(highlightHint.from===i||highlightHint.to===i)?'hint ':'');cell.dataset.rank=16-Math.floor(i/8);cell.setAttribute('aria-label',`${String.fromCharCode(65+i%8)}${16-Math.floor(i/8)} ${p?name(p.side)+' '+TYPE[p.t]+' '+val(p):'empty'}`);cell.onclick=()=>clickCell(i);if(landscape)cell.style.gridArea=`${i%8+1} / ${Math.floor(i/8)+1}`;
 if(p){const el=document.createElement('div');el.className=`piece ${p.side} ${p.t}`;const span=document.createElement('span');span.textContent=val(p);el.appendChild(span);cell.appendChild(el)}b.appendChild(cell)}
 const turn=state.turn;const isHuman=turn===opts.side;$('turnText').textContent=state.winner?'Match complete':`${name(turn)} ${isHuman?'· You':'· Bot'}`;$('phaseText').textContent=state.winner?state.reason:isHuman?'Choose your move':'Calculating a move…';$('turnPanel').style.borderLeft=`3px solid ${turn==='white'?'#e4d5b3':'#9aafb0'}`;
 $('humanCaptures').textContent=state.caps[opts.side].length;$('botCaptures').textContent=state.caps[other(opts.side)].length;$('humanValue').textContent=state.caps[opts.side].reduce((a,p)=>a+p.v,0)+' points';$('botValue').textContent=state.caps[other(opts.side)].reduce((a,p)=>a+p.v,0)+' points';$('moveCounter').textContent=`TURN ${Math.floor(state.ply/2)+1}`;
 $('hint').disabled=!isHuman||!!state.winner;$('undo').disabled=!lastHuman||!!state.winner;
 const logs=state.history.slice(-35).reverse();$('log').innerHTML=logs.map((h,n)=>`<div class="log-entry ${h.events.length?'capture':''}"><span class="number">${state.history.length-n}.</span><b>${name(h.side)}</b> moved ${TYPE[h.kind].toLowerCase()} ${h.value} ${squareName(h.m.from)} → ${squareName(h.m.to)}.${h.events.map(e=>`<br>✦ ${escapeHtml(e)}`).join('')}</div>`).join('')||'<div class="log-entry">The chronicles await their first move.</div>';
 inspect(selected>=0?selected:null);$('status').textContent=state.winner?`${name(state.winner)} wins — ${state.reason}`:turn!==opts.side?'The opponent is studying the board.':selected>=0?`${TYPE[state.b[selected]?.t]||'Piece'} selected · ${legal.length} legal destinations.`:'Select one of your pieces. Green dots show legal destinations.';
}
function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function squareName(i){const [r,c]=rc(i);return String.fromCharCode(65+c)+(16-r)}
function inspect(i){if(i==null||!state.b[i]){$('inspect').innerHTML='<div class="empty-inspect">Select any piece to inspect its number, movement, and capture possibilities.</div>';return}const p=state.b[i],moves=destinations(state.b,i,p);const attacked=[];for(let j=0;j<128;j++)if(state.b[j]?.side!==p.side&&state.b[j]&&canAttack(state.b,i,j,p))attacked.push(`${TYPE[state.b[j].t]} ${val(state.b[j])}`);
 $('inspect').innerHTML=`<div class="big-piece">${name(p.side)} ${TYPE[p.t]} · ${val(p)}</div><p>Square ${squareName(i)} · ${moves.length} free destinations</p><p>${p.t==='p'?'Layers: '+p.layers.join(' + '):p.t==='c'?'One square orthogonally':p.t==='t'?'Two squares diagonally':'Three squares in any straight direction'}</p>${attacked.length?`<p style="color:var(--gold)">In range: ${attacked.slice(0,4).join(', ')}</p>`:''}`;
}
function clickCell(i){if(!state||state.winner)return;const p=state.b[i];if(state.turn!==opts.side){if(p){selected=i;render()}return}
 if(selected>=0&&state.b[selected]?.side===opts.side&&destinations(state.b,selected,state.b[selected]).includes(i)){const m={from:selected,to:i};lastHuman=state;commit(m);return}
 if(p){selected=p.side===opts.side?i:i;highlightHint=null;render()}else{selected=-1;render()}
}
function commit(m){if(!m||state.winner)return;state=afterMove(state,m);selected=-1;highlightHint=null;render();const recent=state.history.at(-1);if(recent.events.length&&$('autoCapture').checked){$('status').textContent=recent.events.join(' ')}
 if(state.winner){clearTimeout(botTimer);setTimeout(()=>result(),550);return}
 if(state.turn!==opts.side)botTurn();
}
function botTurn(){const id=gameId;clearTimeout(botTimer);const delay=Number($('pace').value);botTimer=setTimeout(()=>{if(id!==gameId||!state||state.winner||state.turn===opts.side)return;const m=botPick(state,opts.difficulty);if(m)commit(m)},Math.max(delay,50))}
function newGame(){clearTimeout(botTimer);gameId++;state=initial();selected=-1;lastHuman=null;highlightHint=null;$('setup').classList.add('hidden');$('game').classList.remove('hidden');$('matchTitle').textContent=`${name(opts.side)} vs ${name(other(opts.side))}`;render();if(state.turn!==opts.side)botTurn()}
function result(){if(!state?.winner)return;const win=state.winner===opts.side,draw=state.winner==='draw';showModal(`<div class="eyebrow" style="text-align:center">THE CONTEST IS CONCLUDED</div><div class="result">${draw?'A DRAW':win?'VICTORY':'DEFEAT'}</div><p class="result-sub">${escapeHtml(state.reason)}</p><p class="result-sub">You captured ${state.caps[opts.side].length} pieces; the opponent captured ${state.caps[other(opts.side)].length}.</p><button class="primary" id="again">PLAY AGAIN <span>→</span></button>`);$('again').onclick=()=>{hideModal();newGame()}}
function showModal(html){$('modalContent').innerHTML=html;$('modal').classList.remove('hidden')}
function hideModal(){$('modal').classList.add('hidden')}
const RULES=`<div class="eyebrow">THE MEDIEVAL NUMBER-WAR</div><h2>Rules of Rithmomachia</h2><p>Rithmomachia (“battle of numbers”) was played in medieval and Renaissance Europe to explore the harmonies of arithmetic. Historical manuscripts disagree on details; this implementation uses a coherent <b>Renaissance-style playable variant</b>. The key conventions are stated below.</p>
<h3>1. The board &amp; armies</h3><p>Two opposing armies occupy the ends of a <b>16-row × 8-column board</b>. Ivory is the even-number tradition; Obsidian the odd-number tradition. Each begins with eight circles, eight triangles, seven standalone squares, and one compound pyramid replacing an eighth square. Obsidian moves first. All pieces move to vacant squares only, and no piece jumps over another.</p>
<div class="rule-columns"><div><h3>2. How pieces move</h3><ul><li><b>Circles ●</b> — exactly one square horizontally or vertically.</li><li><b>Triangles ▲</b> — exactly two squares diagonally.</li><li><b>Squares ■</b> — exactly three squares horizontally, vertically, or diagonally.</li><li><b>Pyramids ◆</b> — can use the movement of their surviving layers: circles (1 orthogonal), triangles (2 diagonal), or squares (3 straight).</li></ul></div><div><h3>3. Mathematical captures</h3><p>Pieces capture <b>without occupying the captured square</b>. A capture is tested after the attacking side completes its move.</p><ul><li><b>Equality:</b> your moving piece can reach an enemy with the same number.</li><li><b>Ambush:</b> your moving piece and another friendly piece both threaten an enemy whose number equals their sum or absolute difference.</li><li><b>Assault:</b> your moving piece and an enemy lie along a clear straight line; multiplying the smaller number by the inclusive distance gives the larger.</li><li><b>Siege:</b> an enemy boxed in on all four orthogonal sides, with no legal escape, is captured when your move closes the surrounding net.</li></ul></div></div>
<h3>4. Pyramids</h3><p>The Ivory pyramid starts with layers <b>36 + 25 + 16 + 9 + 4 + 1 = 91</b>; Obsidian has <b>64 + 49 + 36 + 25 + 16 = 190</b>. An equality attack matching a surviving layer removes that layer; attacks matching a total or other capture method remove the entire pyramid. Layer removal affects its subsequent movement. The historical 91/190 compositions are preserved.</p>
<h3>5. How to win</h3><p>The authentic higher ambition is to form a <b>line of three equally spaced friendly pieces entirely in the opponent's half</b>, with their values (in board order) creating one of these progressions:</p><ul><li><b>Arithmetic:</b> equal differences — e.g. 4, 6, 8.</li><li><b>Geometric:</b> equal ratios — e.g. 4, 8, 16.</li><li><b>Harmonic:</b> equal differences in reciprocals — e.g. 6, 8, 12.</li></ul><p>By default this game also awards victory at <b>8 captured enemy pieces</b> (a streamlined common victory). You may instead choose <b>pure harmony</b> or a capture-only contest of <b>12 pieces</b>. If an army has no legal move, it loses. A 240-ply safety limit uses captures to break a prolonged stalemate.</p>
<h3>6. What is standardized here?</h3><p>Medieval rules were never universal. Our chosen movement variant follows a documented later tradition. For clarity, captures occur only when enabled by the piece that <i>just moved</i>; multiple valid enemy pieces may fall at once. Siege uses complete orthogonal enclosure plus no legal escape. The pyramid keeps its historical layers, but uses a simplified layer-removal rule. The starting deployment is a regular, staggered interpretation of the traditional number armies. The bot uses the exact same legal move and capture logic as you.</p>
<h3>7. Help while playing</h3><p>Click your piece to display green destinations; click one to move. Click any piece to inspect it. <b>Hint</b> identifies a promising move, and <b>Undo turn</b> restores your previous position. Four difficulties range from random novice play to shallow counter-move search. Master and Grandmaster are stronger heuristics, not solved-game engines.</p><p style="font-size:11px">Historical reading: <a target="_blank" rel="noopener" href="https://jducoeur.org/game-hist/mebben.ryth.html">The Rules of Rithmomachia</a> · <a target="_blank" rel="noopener" href="https://en.wikipedia.org/wiki/Rithmomachia">Historical overview</a></p>`;
function bind(){for(const btn of document.querySelectorAll('[data-diff]'))btn.onclick=()=>{opts.difficulty=Number(btn.dataset.diff);document.querySelectorAll('[data-diff]').forEach(x=>x.classList.toggle('chosen',x===btn))};for(const btn of document.querySelectorAll('[data-side]'))btn.onclick=()=>{opts.side=btn.dataset.side;document.querySelectorAll('[data-side]').forEach(x=>x.classList.toggle('chosen',x===btn))};
 $('start').onclick=()=>{opts.victory=$('victory').value;newGame()};for(const id of ['rulesTop','rulesStart','rulesGame'])$(id).onclick=()=>showModal(RULES);$('closeModal').onclick=hideModal;$('modal').onclick=e=>{if(e.target===$('modal'))hideModal()};document.addEventListener('keydown',e=>{if(e.key==='Escape')hideModal()});$('newTop').onclick=()=>{if(state&&!state.winner&&!confirm('Abandon this match and return to setup?'))return;clearTimeout(botTimer);gameId++;state=null;$('game').classList.add('hidden');$('setup').classList.remove('hidden')};
 $('hint').onclick=()=>{if(!state||state.turn!==opts.side)return;const m=botPick(state,Math.max(3,opts.difficulty));if(!m)return;highlightHint=m;selected=m.from;render();$('status').textContent=`Suggested move: ${squareName(m.from)} → ${squareName(m.to)}. This is a strategic suggestion, not a guaranteed best move.`};
 $('undo').onclick=()=>{if(!lastHuman)return;clearTimeout(botTimer);gameId++;state=lastHuman;lastHuman=null;selected=-1;render()};$('clearLog').onclick=()=>{$('log').innerHTML='<div class="log-entry">The chronicle has been cleared from view.</div>'};$('showThreats').onchange=render;
}
bind();window.addEventListener('resize',()=>{if(state)render()});
// Lightweight test access for local QA only; no network, accounts or storage required.
window.RithmomachiaEngine={initial,candidates,afterMove,harmony,progression,botPick};
})();
