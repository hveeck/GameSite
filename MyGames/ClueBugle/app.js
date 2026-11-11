const $=s=>document.querySelector(s), app=$('#app');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mode='home', game=null, myRole='guesser', difficulty='medium',busy=false, online=null, poller=null, carryMissed=localStorage.getItem('cb_carry')!=='off', serverURL=localStorage.getItem('cb_url')||'', serverKey=localStorage.getItem('cb_key')||'';
let cbLastShownReport='';
const toast=s=>{let t=$('#toast');t.textContent=s;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),3500)};
$('#rulesBtn').onclick=()=>$('#rules').showModal();$('#closeRules').onclick=()=>$('#rules').close();$('#homeBtn').onclick=()=>{if(online&&mode==='online')stopOnline();mode='home';game=null;home()};
function home(){app.innerHTML=`<section class="hero"><div><div class="eyebrow">A game of clever connections</div><h1>Think alike.<br>Guess right.<br><span style="color:var(--green)">Bugle on.</span></h1><p>A secret-word showdown for sharp minds. Give a clue, follow the connections, and avoid the one word that ends it all.</p><div class="modegrid"><button class="mode" id="solo"><span style="font-size:29px">✦</span><strong>Play solo</strong><small>Three computer players. Set your rival team's difficulty.</small></button><button class="mode" id="multi"><span style="font-size:29px">◈</span><strong>Play online</strong><small>Bring your friends together in a private room.</small></button></div></div><div class="hero-art"><div class="artgrid">${['ORBIT','PIANO','RIVER','QUEEN','CROWN','SHARK','WHALE','FOREST','KNIGHT','BRIDGE','DRAGON','APPLE','MOON','TIGER','ROCKET','CASTLE','BEETLE','STAR','COURT','PIRATE'].map(x=>`<i>${x}</i>`).join('')}</div><div class="bubble">🐞</div></div></section>`;$('#solo').onclick=()=>{$('#soloBeta').showModal()};$('#multi').onclick=onlineSetup}
$('#betaProceed').onclick=()=>{$('#soloBeta').close();soloSetup()};
$('#betaBack').onclick=()=>{$('#soloBeta').close();home()};
function soloSetup(){mode='setup';app.innerHTML=`<div class="wrap panel"><div class="eyebrow">Solo / 1 human + 3 bots</div><h2>Choose your seat</h2><p class="muted">Your computer teammate handles the other role. The other team has an AI Spymaster and AI Guesser.</p><div class="field"><label>Your role</label><select id="role"><option value="guesser">Guesser — decipher your teammate's clues</option><option value="spymaster">Spymaster — give clues to your AI teammate</option></select></div><div class="field"><label>Opposing AI difficulty</label><select id="level"><option value="easy">Easy — loose connections and risky guesses</option><option value="medium" selected>Medium — sensible but imperfect</option><option value="hard">Hard — stronger clues and careful deductions</option></select></div><div class="field"><label style="display:flex;align-items:center;gap:10px"><input id="carry" type="checkbox" ${carryMissed?'checked':''} style="width:auto"> Carry missed clues forward (solo house rule)</label><p class="small muted">Unused clue targets add extra guesses to your next turn. Turn off for classic number + 1 guessing.</p></div><div class="actions"><button id="start">Start game</button><button class="secondary" id="back">Back</button></div></div>`;$('#back').onclick=home;$('#start').onclick=()=>{myRole=$('#role').value;difficulty=$('#level').value;carryMissed=$('#carry').checked;localStorage.setItem('cb_carry',carryMissed?'on':'off');mode='solo';game=newGame();render();scheduleAI()}}
function soloBoard(){
  // Pure random selection and independent random key assignment, exactly as
  // multiplayer. The AI must work with the resulting board as it is.
  const start=Math.random()<.5?'red':'blue';
  // A shuffled bag keeps the board random but avoids seeing the same words
  // repeatedly across consecutive solo matches. Refill only after exhausting it.
  let bag=[];
  try{bag=JSON.parse(localStorage.getItem('cb_wordbag_v42')||'[]')}catch{}
  if(!Array.isArray(bag)||bag.some(w=>!WORDS.includes(w)||w==='SERVO')||new Set(bag).size!==bag.length)bag=[];
  if(bag.length<25)bag=shuffle(WORDS.filter(w=>w!=='SERVO'));
  const words=bag.splice(0,25);
  localStorage.setItem('cb_wordbag_v42',JSON.stringify(bag));
  const keys=shuffle([...Array(start==='red'?9:8).fill('red'),
    ...Array(start==='blue'?9:8).fill('blue'),...Array(7).fill('neutral'),'assassin']);
  return{start,words,keys};
}
function newGame(){const {start,words,keys}=soloBoard();return{words,keys,revealed:Array(25).fill(false),turn:start,starter:start,clue:null,guesses:0,correctThisTurn:0,carry:{red:0,blue:0},priorClues:{red:[],blue:[]},carryEnabled:carryMissed,phase:'clue',winner:null,log:[`${start.toUpperCase()} begins with 9 agents.`],round:1}}
const remaining=(g,t)=>g.remaining?.[t]??g.keys.filter((v,i)=>v===t&&!g.revealed[i]).length;
function log(g,s){g.log.unshift(s);g.log=g.log.slice(0,30)}
function guessLimit(g){if(!g.clue||g.clue.n===0)return Infinity;return g.clue.n+1+(g.carryEnabled?g.clue.bonus||0:0)}
function giveClue(g,word,n){if(g.phase!=='clue'||g.winner)throw Error('Not time for a clue');word=word.trim().toUpperCase();n=Number(n);if(!/^[A-Z]+$/.test(word))throw Error('Clue must be one ordinary word (no spaces or hyphens)');if(!Number.isInteger(n)||n<0||n>9)throw Error('Number must be 0–9');if(g.words.some(w=>w===word||w===word+'S'||w+'S'===word))throw Error('Clue cannot be a visible word');g.clue={word,n,bonus:g.carryEnabled?Math.min(8,g.carry?.[g.turn]||0):0};g.guesses=0;g.correctThisTurn=0;g.phase='guess';log(g,`${g.turn.toUpperCase()} clue: ${word} ${n}`);if(mode==='solo'){let recent=[];try{recent=JSON.parse(localStorage.getItem('cb_recent_clues')||'[]')}catch{}recent=[word,...recent.filter(x=>x!==word)].slice(0,45);localStorage.setItem('cb_recent_clues',JSON.stringify(recent))}}
function endTurn(g){if(g.winner)return;if(g.clue&&g.carryEnabled){const old=g.carry[g.turn]||0;g.carry[g.turn]=Math.max(0,Math.min(8,old+g.clue.n-g.correctThisTurn));if(g.clue.n>g.correctThisTurn){const prior=g.priorClues||(g.priorClues={red:[],blue:[]});prior[g.turn]=[{word:g.clue.word,missed:g.clue.n-g.correctThisTurn},...prior[g.turn]].slice(0,4)}}g.turn=g.turn==='red'?'blue':'red';g.phase='clue';g.clue=null;g.guesses=0;g.correctThisTurn=0;g.round++;log(g,`Now ${g.turn.toUpperCase()}'s turn`)}
function guess(g,i){if(g.phase!=='guess'||g.revealed[i]||g.winner)throw Error('This card cannot be guessed');g.revealed[i]=true;g.guesses++;let kind=g.keys[i];if(kind===g.turn)g.correctThisTurn++;log(g,`${g.turn.toUpperCase()} guessed ${g.words[i]} — ${kind.toUpperCase()}`);if(kind==='assassin'){g.winner=g.turn==='red'?'blue':'red';log(g,`${g.turn.toUpperCase()} hit the assassin!`)}else if(!remaining(g,'red'))g.winner='red';else if(!remaining(g,'blue'))g.winner='blue';if(g.winner){g.phase='over';log(g,`${g.winner.toUpperCase()} wins!`)}else if(kind!==g.turn||g.guesses>=guessLimit(g))endTurn(g)}
const CLUE_THEMES={...CATEGORIES,
  wildlife:['animals','insects','ocean'].flatMap(k=>CATEGORIES[k]),
  outdoors:['nature','garden','weather','winter'].flatMap(k=>CATEGORIES[k]),
  adventure:['travel','transport','ocean','fantasy'].flatMap(k=>CATEGORIES[k]),
  civilization:['history','royalty','buildings','law'].flatMap(k=>CATEGORIES[k]),
  entertainment:['music','sport','theater','art'].flatMap(k=>CATEGORIES[k]),
  workshop:['tools','technology','buildings'].flatMap(k=>CATEGORIES[k]),
  celebration:['food','music','clothes','art'].flatMap(k=>CATEGORIES[k]),
  danger:['fire','weather','fantasy','law'].flatMap(k=>CATEGORIES[k]),
  exploration:['space','travel','ocean','nature'].flatMap(k=>CATEGORIES[k]),
  everyday:['kitchen','school','clothes','transport','household','furniture'].flatMap(k=>CATEGORIES[k]),
  creatures:['birds','mammals','pets','farm','fish','reptiles','wilderness','animals','insects'].flatMap(k=>CATEGORIES[k]),
  science:['astronomy','physics','chemistry','biology','anatomy','geology','technology'].flatMap(k=>CATEGORIES[k]),
  culture:['literature','language','painting','cinema','dancing','art','music','theater'].flatMap(k=>CATEGORIES[k]),
  history:['ancient','medieval','military','archaeology','mythology','history'].flatMap(k=>CATEGORIES[k]),
  nature:['geography','gardening','wilderness','tropical','garden','nature','weather'].flatMap(k=>CATEGORIES[k]),
  machines:['mechanics','electricity','robotics','vehicles','aviation','transport'].flatMap(k=>CATEGORIES[k]),
  journey:['navigation','roads','cities','vacation','travel','seafaring'].flatMap(k=>CATEGORIES[k]),
  cooking:['breakfast','dinner','produce','fruits','desserts','drinks','cooking','kitchen'].flatMap(k=>CATEGORIES[k]),
  competition:['games','athletics','ballgames','sport'].flatMap(k=>CATEGORIES[k]),
  society:['politics','economics','business','communication','law','religion'].flatMap(k=>CATEGORIES[k]),
  household:['furniture','household','construction','textiles','gardening'].flatMap(k=>CATEGORIES[k]),
  costume:['fashion','jewelry','clothes','medieval','festivals'].flatMap(k=>CATEGORIES[k]),
  expedition:['camping','climbing','wilderness','navigation','geography','travel'].flatMap(k=>CATEGORIES[k])
};
// Shared strategic context for both teams. Positive means the team is behind.
function aiSituation(g,team){
  const other=team==='red'?'blue':'red';
  const ours=remaining(g,team),theirs=remaining(g,other);
  const gap=ours-theirs;
  const urgency=Math.min(3,Math.max(0,gap)+(theirs<=2?2:theirs<=4?1:0));
  return{ours,theirs,gap,urgency};
}
function aiClue(g,team,level){
  const available=g.words.map((w,i)=>({w,i,k:g.keys[i]})).filter(x=>!g.revealed[x.i]);
  const {ours,urgency}=aiSituation(g,team);
  const used=new Set(g.log.filter(s=>s.startsWith(team.toUpperCase()+' clue: '))
    .map(s=>s.split(' clue: ')[1]?.split(' ')[0]));
  const options=[];
  for(const [category,words] of Object.entries(CLUE_THEMES)){
    if(!/^[a-z]+$/.test(category))continue;
    const clueWord=category.toUpperCase();
    if(g.words.some(w=>w===clueWord||w+'S'===clueWord||clueWord+'S'===w))continue;
    if(used.has(clueWord))continue; // Spymasters should build on earlier clues, not recycle them.
    const own=available.filter(x=>x.k===team&&words.includes(x.w));
    if(!own.length)continue;
    const danger=available.filter(x=>x.k!==team&&words.includes(x.w));
    const assassin=danger.some(x=>x.k==='assassin');
    const enemy=danger.filter(x=>x.k!=='assassin').length;
    const confusion=enemy+(assassin?6:0);
    // Every associated neutral or enemy card is an equally plausible guess.
    // A clue pointing to HAMSTER (neutral) and WHISKER (ours) is NOT a safe
    // two-card clue, even if it sounds semantically natural.
    const precision=own.length/(own.length+enemy+(assassin?4:0));
    const cap=level==='easy'?3:level==='medium'?4:5;
    const n=Math.min(own.length,cap);
    const riskCost=level==='hard'?12:level==='medium'?10:7;
    const score=n*5.4+(n>=2?4:0)-enemy*(riskCost-urgency*.8)
      -(assassin?35:0)+precision*9+urgency*Math.min(n,3)*1.1
      +(Math.random()-.5)*(level==='hard'?.6:level==='medium'?2:4);
    options.push({category,n,score,confusion,assassin,enemy,precision});
  }
  if(!options.length)return{word:'MYSTERY',n:1};
  const clean=options.filter(x=>!x.assassin&&x.enemy===0);
  const cleanMulti=clean.filter(x=>x.n>=2);
  // Only take the ambiguous multi-card clue when no clean connection exists
  // and the comeback value justifies the risk. Never target the assassin.
  const viableRisk=options.filter(x=>!x.assassin&&x.n>=2&&x.precision>=
    (level==='hard'?.78:level==='medium'?.7:.62));
  const eligible=ours<=1?(clean.length?clean:options):
    cleanMulti.length?cleanMulti:
    (urgency>=2&&viableRisk.length?viableRisk:clean.length?clean:viableRisk.length?viableRisk:options);
  eligible.sort((a,b)=>b.score-a.score);
  const best=eligible[0];
  return{word:best.category.toUpperCase(),n:best.n};
}
function aiGuess(g,team,level){
  const aliases={sea:'ocean',marine:'ocean',fish:'fish',ship:'seafaring',boat:'seafaring',animal:'creatures',zoo:'creatures',pet:'pets',farm:'farm',food:'cooking',meal:'dinner',breakfast:'breakfast',fruit:'fruits',vegetable:'produce',fruitful:'fruits',instrument:'instruments',song:'music',royal:'royalty',kingdom:'royalty',historic:'history',ancient:'ancient',battle:'military',war:'military',science:'science',scientific:'science',electronic:'technology',machine:'machines',mechanical:'mechanics',vehicle:'vehicles',car:'vehicles',flight:'aviation',air:'aviation',travel:'journey',holiday:'vacation',vacation:'vacation',artistic:'art',paint:'painting',sporty:'competition',sport:'competition',game:'games',wintertime:'winter',nature:'nature',garden:'gardening',plant:'garden',forest:'nature',insect:'insects',bug:'insects',bird:'birds',spooky:'horror',scary:'horror',magical:'magic',fairytale:'fantasy',money:'economics',business:'business',office:'business',home:'household',furniture:'furniture'};
  const category=g.clue.word.toLowerCase(),current=aliases[category]||category;
  const relevant=CLUE_THEMES[current]||[];
  const remembered=g.log.filter(s=>s.startsWith(team.toUpperCase()+' clue: '))
    .map(s=>s.split(' clue: ')[1]?.split(' ')[0]?.toLowerCase())
    .filter(s=>s&&s!==category).slice(0,5)
    .flatMap(s=>CLUE_THEMES[aliases[s]||s]||[]);
  const candidates=g.words.map((w,i)=>({w,i,score:(relevant.includes(w)?12:0)+(remembered.includes(w)?4:0)})).filter(x=>!g.revealed[x.i]);
  // Guesser sees only the public clue and words, never the secret key.
  candidates.forEach(x=>x.score+=(Math.random()-.5)*(level==='hard'?3:level==='medium'?9:16));
  candidates.sort((a,b)=>b.score-a.score);
  const best=candidates[0];
  return best?{i:best.i,confidence:Math.max(0,Math.min(1,(best.score-2)/12)),related:relevant.includes(best.w)||remembered.includes(best.w)}:null;
}
function aiShouldContinue(g,team,level,choice){
  const {urgency,ours,theirs}=aiSituation(g,team),used=g.guesses,number=g.clue.n;
  if(!choice)return false;
  const extra=number!==0&&used>=number;
  if(number!==0&&used>=number+1)return false;
  // Good humans rarely guess blindly while comfortably ahead, but when the other
  // team is close to winning they will take calculated extra chances.
  const threshold=(level==='hard'?.42:level==='medium'?.31:.18)
    -(urgency*.095)+(extra?.2:0)+(used>=1?.03:0);
  if(choice.related)return choice.confidence>=threshold||urgency>=2&&choice.confidence>.2;
  if(ours===1&&theirs>1)return false;
  return urgency>=2&&choice.confidence>Math.max(.23,threshold+.1);
}
function render(){if(!game)return;let g=game, solo=mode==='solo', me=online?.player, team=solo?'red':(me?.team||'spectator'), role=solo?myRole:(me?.role||'spectator'), keyview=role==='spymaster', myturn=g.turn===team, canClue=myturn&&role==='spymaster'&&g.phase==='clue',canGuess=myturn&&role==='guesser'&&g.phase==='guess';app.innerHTML=`<div class="gamehead"><div class="score"><span class="dot red"></span><b>RED</b><span class="count">${remaining(g,'red')}</span><span class="small muted">left</span></div><div class="turn">${g.winner?`${g.winner.toUpperCase()} WINS!`:g.turn.toUpperCase()+` • ${g.phase==='clue'?'CLUE':'GUESS'}`}</div><div class="score right"><span class="small muted">left</span><span class="count">${remaining(g,'blue')}</span><b>BLUE</b><span class="dot blue"></span></div></div><div class="gamewrap"><div><div class="board">${g.words.map((word,i)=>{let k=g.keys?.[i],rev=g.revealed[i],showKey=keyview||!!g.winner,cls=rev?(k||'neutral')+'tile':showKey&&k?'key'+k:'';return`<button class="tile ${rev?'revealed':''} ${g.winner&&!rev?'unfound':''} ${cls}" data-i="${i}" ${(!canGuess||rev||g.winner)?'disabled':''}>${esc(word)}${rev?'<span class="mark">✦</span>':g.winner?'<span class="mark">○</span>':''}</button>`}).join('')}</div><p class="small muted">${g.winner?'Game over • Colors now reveal every remaining agent, bystander and assassin. Unfound cards have a ○.':keyview?'Spymaster key visible • Never show this screen to your guesser.':'Only Spymasters know the hidden colors.'}</p></div><aside class="side"><div class="panel"><h3>${solo?'Solo match':'Online room'}</h3><div class="status">${solo?`You: <b>Red ${myRole}</b><br>Rival bots: <b>${difficulty}</b>`:`Room <b class="roomcode">${esc(online?.code)}</b><br>You: <b>${esc(me?.name)} — ${esc(team)} ${esc(role)}</b>`}</div>${online?`<div class="actions"><button class="secondary wide" id="copy">Copy invite link</button></div>`:''}</div><div class="panel"><h3>Current clue</h3>${g.clue?`<div class="clue">${esc(g.clue.word)} · ${g.clue.n}</div><p class="small muted">${g.clue.n===0?'Unlimited guesses':Math.max(0,g.clue.n+1-g.guesses)+' guesses remaining (maximum)'}</p>`:'<p class="muted">Waiting for the Spymaster…</p>'}${canClue?`<div class="field"><label>One-word clue</label><input id="clueWord" placeholder="e.g. ocean" maxlength="32" autocomplete="off"></div><div class="field"><label>Number</label><select id="clueNum">${Array.from({length:10},(_,i)=>`<option value="${i}" ${i===2?'selected':''}>${i}</option>`).join('')}</select></div><button id="submitClue" class="wide">Give clue</button>`:''}${canGuess?`<div class="actions"><button id="endTurn" class="secondary wide">End guessing</button></div>`:''}${g.winner?`<div class="end"><h2>${g.winner.toUpperCase()} wins!</h2><p>Game over</p>${solo?'<button id="again">Play again</button>':(me?.host?'<button id="again">New round</button>':'<p>Host can start another round.</p>')}</div>`:''}</div><div class="panel"><h3>Game log</h3><div class="log">${g.log.map(s=>`<p>${esc(s)}</p>`).join('')}</div></div></aside></div>`;
  if(g.winner&&typeof cbPostgame==='function'){
    app.insertAdjacentHTML('beforeend',cbPostgame(g,solo));
    const reportId=g.words.join('|')+'|'+g.winner;
    const report=app.querySelector('#postgame');
    const end=app.querySelector('.end');
    if(end&&report){
      const button=document.createElement('button');
      button.textContent='See postgame analysis ↓';
      button.className='secondary wide';
      button.style.marginTop='10px';
      button.onclick=()=>report.scrollIntoView({behavior:'smooth',block:'start'});
      end.append(button);
    }
    if(report&&cbLastShownReport!==reportId){
      cbLastShownReport=reportId;
      requestAnimationFrame(()=>report.scrollIntoView({behavior:'smooth',block:'start'}));
    }
  }
  // Resize the clue text to the available sidebar width, not just the
  // viewport. Long valid clues must never spill onto a second line.
  const clueDisplay=app.querySelector('.clue');
  if(clueDisplay){
    let size=parseFloat(getComputedStyle(clueDisplay).fontSize);
    while(clueDisplay.scrollWidth>clueDisplay.clientWidth&&size>8){
      size=Math.max(8,size-1);
      clueDisplay.style.fontSize=size+'px';
    }
  }
  const clueDetail=app.querySelector('.clue + p');
  if(clueDetail&&g.clue&&solo){
    const left=guessLimit(g)-g.guesses;
    clueDetail.textContent=g.clue.n===0?'Unlimited guesses':`${Math.max(0,left)} guesses remaining${g.clue.bonus?` (includes ${g.clue.bonus} carried-over guesses)`:''}`;
    if(g.carryEnabled){const previous=g.priorClues?.[g.turn]||[];if(previous.length){const hint=document.createElement('p');hint.className='small muted';hint.textContent='Earlier missed clues: '+previous.map(x=>`${x.word} (${x.missed})`).join(' · ');clueDetail.after(hint)}}
  }
  document.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{let i=+b.dataset.i;if(solo){try{guess(game,i);render();scheduleAI()}catch(e){toast(e.message)}}else action('guess',{index:i})});
  if($('#submitClue'))$('#submitClue').onclick=()=>{let word=$('#clueWord').value,n=+$('#clueNum').value;if(solo){try{giveClue(game,word,n);render();scheduleAI()}catch(e){toast(e.message)}}else action('clue',{word,n})};
  if($('#endTurn'))$('#endTurn').onclick=()=>solo?(endTurn(game),render(),scheduleAI()):action('pass',{});
  if($('#again'))$('#again').onclick=()=>{if(solo){game=newGame();render();scheduleAI()}else action('restart',{})};
  if($('#copy'))$('#copy').onclick=()=>navigator.clipboard.writeText(location.origin+location.pathname+'?room='+online.code).then(()=>toast('Invite link copied!')).catch(()=>toast('Room code: '+online.code));
}
async function scheduleAI(){
  if(mode!=='solo'||busy||!game||game.winner)return;
  busy=true;
  try{
    while(mode==='solo'&&game&&!game.winner){
      const g=game,team=g.turn,level=team==='red'?'hard':difficulty;
      const humanTurn=team==='red'&&((myRole==='spymaster'&&g.phase==='clue')||(myRole==='guesser'&&g.phase==='guess'));
      if(humanTurn)break;
      await pause(g.phase==='clue'?850:1000);
      if(mode!=='solo'||game!==g||g.winner)break;
      if(g.phase==='clue'){
        const c=typeof cbLiveClue==='function'?await cbLiveClue(g,team,level):aiClue(g,team,level);
        if(mode!=='solo'||game!==g||g.winner)break;
        const opponent=team==='red'?'blue':'red';
        if(remaining(g,opponent)===1&&remaining(g,team)>1){
          // Final enforcement at the point of issuing the actual clue.
          // No strategy module or fallback path may concede a 2–1 / 3–1 game
          // by announcing only one intended target.
          c.n=Math.min(9,remaining(g,team));
        }
        if(typeof cbRecordAIClue==='function')cbRecordAIClue(g,team,c);
        giveClue(g,c.word,c.n);render();
      }else{
        const decision=typeof cbLiveGuess==='function'?await cbLiveGuess(g,team,level):{choice:aiGuess(g,team,level),fallback:true};
        if(mode!=='solo'||game!==g||g.winner)break;
        const choice=decision.choice;
        if(choice&&(decision.fallback?(g.guesses===0||aiShouldContinue(g,team,level,choice)):true)){
          if(choice)guess(g,choice.i);else endTurn(g);
        }else endTurn(g);
        render();
      }
    }
  }finally{busy=false}
}
function onlineSetup(){mode='onlineSetup';let params=new URLSearchParams(location.search),code=params.get('room')||'';app.innerHTML=`<div class="wrap panel"><div class="eyebrow">Online multiplayer</div><h2>Gather your team</h2><p class="muted">A separate Supabase project powers shared rooms. Players do not need accounts.</p><div class="field"><label>Your display name</label><input id="name" maxlength="22" value="${esc(localStorage.getItem('cb_name')||'')}" placeholder="Your name"></div><div class="field"><label>Room code (to join)</label><input id="code" maxlength="7" value="${esc(code)}" placeholder="e.g. BEE123"></div><div class="actions"><button id="create">Create room</button><button id="join" class="bluebtn">Join room</button></div><details style="margin-top:25px"><summary>Supabase connection settings</summary><p class="small muted">Enter your Project URL and publishable/anon key. These are public browser credentials; never use a service-role key here.</p><div class="field"><label>Project URL</label><input id="url" value="${esc(serverURL)}" placeholder="https://yourproject.supabase.co"></div><div class="field"><label>Publishable / anon key</label><input id="key" value="${esc(serverKey)}" placeholder="sb_publishable_... or eyJ..."></div><button class="secondary" id="save">Save connection</button></details></div>`;$('#save').onclick=()=>{serverURL=$('#url').value.trim().replace(/\/$/,'');serverKey=$('#key').value.trim();localStorage.setItem('cb_url',serverURL);localStorage.setItem('cb_key',serverKey);toast('Saved connection')};$('#create').onclick=()=>joinOrCreate('create');$('#join').onclick=()=>joinOrCreate('join')}
async function api(body){if(!serverURL||!serverKey)throw Error('Configure your Supabase connection first.');let r=await fetch(serverURL+'/functions/v1/cluebugle',{method:'POST',headers:{'content-type':'application/json','apikey':serverKey,'authorization':'Bearer '+serverKey},body:JSON.stringify(body)});let data=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok||data.error)throw Error(data.error||'Request failed');return data}
async function joinOrCreate(kind){try{let name=$('#name').value.trim();if(!name)throw Error('Enter your name');localStorage.setItem('cb_name',name);let data=await api({action:kind,name,code:$('#code').value.trim().toUpperCase()});online={code:data.code,token:data.token,player:data.player};sessionStorage.setItem('cb_session',JSON.stringify(online));mode='online';history.replaceState({},'',location.pathname+'?room='+online.code);lobby(data);startPolling()}catch(e){toast(e.message)}}
function stopOnline(){clearInterval(poller);poller=null;online=null;sessionStorage.removeItem('cb_session');history.replaceState({},'',location.pathname)}
async function refresh(force=false){if(!online||mode!=='online')return;try{let d=await api({action:'state',code:online.code,token:online.token});if(!force&&online.version===d.version)return;online.version=d.version;online.player=d.player;if(d.state.phase==='lobby')lobby(d);else{game=d.state;render()}}catch(e){toast(e.message);clearInterval(poller)}}
function startPolling(){clearInterval(poller);poller=setInterval(refresh,1600)}
function lobby(d){let players=d.players||[];online.player=d.player;app.innerHTML=`<div class="wrap panel"><div class="eyebrow">Online room</div><h2>Room <span class="roomcode">${esc(online.code)}</span></h2><p class="muted">Invite friends with the room code. Choose Red or Blue and a role. Each team needs one Spymaster and at least one Guesser.</p><div class="lobbylist">${players.map(p=>`<div class="lobbyitem"><b>${esc(p.name)} ${p.id===online.player.id?'(you)':''}</b><p class="small">${esc(p.team)} · ${esc(p.role)}</p></div>`).join('')}</div><div class="formrow"><div class="field"><label>Team</label><select id="team"><option value="red" ${online.player.team==='red'?'selected':''}>Red</option><option value="blue" ${online.player.team==='blue'?'selected':''}>Blue</option><option value="spectator" ${online.player.team==='spectator'?'selected':''}>Spectator</option></select></div><div class="field"><label>Role</label><select id="role"><option value="guesser" ${online.player.role==='guesser'?'selected':''}>Guesser</option><option value="spymaster" ${online.player.role==='spymaster'?'selected':''}>Spymaster</option></select></div></div><div class="actions"><button id="seat">Update my seat</button>${online.player.host?'<button id="start">Start game</button>':''}<button class="secondary" id="copy">Copy invite</button></div></div>`;$('#seat').onclick=()=>action('seat',{team:$('#team').value,role:$('#role').value});if($('#start'))$('#start').onclick=()=>action('start',{});$('#copy').onclick=()=>navigator.clipboard.writeText(location.origin+location.pathname+'?room='+online.code).then(()=>toast('Invite link copied'))}
async function action(type,payload){try{await api({action:type,code:online.code,token:online.token,...payload});await refresh(true)}catch(e){toast(e.message)}}
const prior=sessionStorage.getItem('cb_session');if(prior){try{online=JSON.parse(prior);mode='online';refresh().then(()=>startPolling())}catch{home()}}else if(new URLSearchParams(location.search).has('room'))onlineSetup();else home();
