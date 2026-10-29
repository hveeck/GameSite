// Only receives sanitized per-player views from the authoritative Edge Function.
// Never imports the offline game, its global state, or the private server engine.
export function orderGameEventRecord(record){
  const stage=m=>{
    if(m.kind==='ballots')return 3;
    if(m.kind==='policy-summary')return 6;
    const t=m.text||'';
    if(/is Secretary|nomination expired/i.test(t))return 0;
    if(/nominated /i.test(t))return 1;
    if(/election (passed|failed)|veto (accepted|rejected)/i.test(t))return 2;
    if(/enacted .*policy|chaos/i.test(t))return 4;
    if(/ claimed: /i.test(t))return 5;
    if(/policy dispute|contradict/i.test(t))return 7;
    if(/investigat|declar|execut|special election|peek/i.test(t))return 8;
    return 9;
  };
  return record.map((m,i)=>({...m,_order:i})).sort((a,b)=>
    (a.round||0)-(b.round||0)||stage(a)-stage(b)||(a.at||0)-(b.at||0)||a._order-b._order);
}
export function safeSecretaryClaimOptions(enacted){
  const options=[];
  for(let d=0;d<=3;d++)for(let p=0;p<=2;p++){
    if(p>d||2-p>3-d)continue;
    if((enacted==='white'&&p===0)||(enacted==='communist'&&p===2))continue;
    // No official Communist/Stalin claim should confess to burying a White.
    if(d>p&&!(d===3&&p===2))continue;
    options.push({type:'claim',drawWhite:d,passedWhite:p});
  }
  return options;
}
export function safePremierClaimOptions(enacted){
  return [0,1,2].filter(r=>
    !((enacted==='white'&&r===0)||(enacted==='communist'&&r>=1)))
    .map(receivedWhite=>({type:'claim',receivedWhite}));
}
export function createOnlineMatchController(supabase,rooms,options={}){
  let active=false,current=null,clockOffset=0,pollId=null,tickId=null;
  let claimActions=[];
  let syncQueued=false,pendingDecision=null,submitError=null,requestQueue=Promise.resolve();
  let chatPending=0,lastChatSentAt=0,nextMessageId=0,lastVoteKey='',voteRevealedCount=0,voteRevealClientStart=0;
  let voteShowing=false,voteResultReady=false,voteDismissedKey='',lastDisputeKey='';
  let localVote=null;
  let policyReportKey='',dismissedPolicyKey='',policyReportCompleteKey='';
  let lastInvestigationKey='';
  let lastResultHighlight='',lastRoundHighlight=0;
  let previousPolicyCounts=null,policyHighlight=null,lastVotePauseActive=null;
  let dossierSeat=null,gameOverNotified=false;
  let markedRound=null;
  let logView='events';
  let conversationInitialized=false,unreadConversation=0;
  const seenConversation=new Set();
  const outbox=[],animationTimers=new Set();
  const trusted=new Set(),suspected=new Set();
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const name=s=>current?.players?.[s]?.name||`Player ${s+1}`;
  const roleName=r=>({white:'★ WHITE',communist:'☭ COMMUNIST',stalin:'👤 STALIN'})[r]||'';
  const visibleRole=s=>current?.knownRoles?.[s]||current?.investigations?.[s]||current?.players?.[s]?.role||null;
  const cleared=s=>current?.confirmedNotStalin?.includes(s);
  function remaining(){return Math.max(0,Math.ceil(((current?.deadline||0)-(Date.now()+clockOffset))/1000));}
  function clock(){
    if(!current||current.phase==='gameover'){$('online-clock').textContent='FINISHED';return;}
    const votePause=current.phase==='voting'&&Date.now()+clockOffset<(current.voteReadyAt||0);
    const time=votePause?Math.ceil((current.voteReadyAt-Date.now()-clockOffset)/1000):remaining();
    $('online-clock').textContent=`${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}`;
    if(lastVotePauseActive!==votePause){lastVotePauseActive=votePause;if(active&&current)decisions();}
    const yourFinalFifteen=!!current.myTurn&&!pendingDecision&&time<=15;
    $('online-clock').classList.toggle('urgent',time<=10);
    $('online-match').classList.toggle('your-final-fifteen',yourFinalFifteen);
    $('online-clock').setAttribute?.('aria-label',yourFinalFifteen?`Your turn: ${time} seconds remaining`:`${time} seconds remaining`);
    if(current.phase==='election_reveal'){
      updateVoteReveal(current);
      renderSeatVotes(current);
      decisions();
    }else if(['policy_reveal','nomination_intro','reshuffle_reveal'].includes(current.phase))decisions();
  }
  function enqueue(task){
    const next=requestQueue.then(task,task);
    requestQueue=next.catch(()=>{});
    return next;
  }
  function scheduleAnimation(task,delay){
    const timer=setTimeout(()=>{animationTimers.delete(timer);if(active)task();},delay);
    animationTimers.add(timer);
  }
  async function call(action,phaseVersion=current?.phaseVersion){
    const requestId=action?(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`):undefined;
    let response;
    for(let attempt=0;attempt<5;attempt++){
      response=await supabase.functions.invoke('match',{body:{roomId:rooms().id,
        phaseVersion,action,requestId}});
      if(!response.error)break;
      // Supabase reports HTTP 409/503 as FunctionsHttpError rather than data.
      // Preserve the server's helpful response body instead of dropping it.
      let detail=null;
      try{detail=await response.error.context?.clone?.().json?.();}catch{}
      if(detail?.state){current=detail.state;render();}
      const message=detail?.error||response.error.message||'Could not reach game server';
      if(attempt<4&&/busy|retry|temporar|network|failed to fetch/i.test(message)){
        await new Promise(resolve=>setTimeout(resolve,170*(attempt+1)));
        continue;
      }
      throw new Error(message);
    }
    const {data,error}=response;
    if(error)throw new Error(error.message||'Could not reach game server');
    if(data?.error){
      if(data.state){current=data.state;render();}
      throw new Error(data.error);
    }
    clockOffset=(data.serverNow||Date.now())-Date.now();
    current=data.state;if(active)render();return data;
  }
  async function sync(){
    if(!active||syncQueued||pendingDecision||chatPending)return;
    syncQueued=true;
    try{await enqueue(()=>call(null));}catch(e){$('online-prompt').textContent='Reconnecting: '+e.message;}
    finally{syncQueued=false;}
  }
  async function submit(action,label){
    if(!active||!current?.myTurn||pendingDecision)return;
    const phaseVersion=current.phaseVersion;
    submitError=null;
    if(action.type==='vote')localVote={phaseVersion,yes:action.yes};
    pendingDecision={phaseVersion,label:label||'Decision',action};
    decisions(); // One click instantly locks all options and acknowledges it.
    try{
      await enqueue(async()=>{
        if(current.phaseVersion!==phaseVersion||!current.myTurn)
          throw new Error('The council advanced before your decision could be submitted.');
        return call(action,phaseVersion);
      });
    }catch(e){
      if(action.type==='vote')localVote=null;
      if(current?.phaseVersion===phaseVersion&&current.myTurn)
        submitError={phaseVersion,message:'Not submitted — please try again: '+e.message};
      else submitError={phaseVersion:current?.phaseVersion,message:'Decision not accepted: '+e.message};
    }finally{
      pendingDecision=null;
      if(active&&current)render();
    }
  }
  function chatStatus(text,error=false){
    const box=$('online-chat-status');box.textContent=text;box.classList.toggle('online-error',error);
  }
  function renderChat(){
    if(!current)return;
    // Count only newly received public speech, not the entire conversation
    // restored when joining/reconnecting to an existing match.
    const conversation=(current.chat||[]).filter(m=>(!m.kind&&!current.players?.[m.seat]?.bot)||
      (m.kind==='opinion'&&current.players?.[m.seat]?.bot));
    let fresh=0;
    for(const m of conversation){
      const key=[m.at,m.seat,m.kind||'',m.text].join('\u001f');
      if(!seenConversation.has(key)){
        seenConversation.add(key);
        if(conversationInitialized&&m.seat!==current.seat)fresh++;
      }
    }
    conversationInitialized=true;
    while(seenConversation.size>600)seenConversation.delete(seenConversation.values().next().value);
    if(logView==='conversation')unreadConversation=0;
    else unreadConversation+=fresh;
    const conversationTab=document.querySelector?.('[data-log-view="conversation"]');
    if(conversationTab){
      const badge=conversationTab.querySelector?.('.online-unread-badge');
      if(badge){badge.hidden=!unreadConversation;badge.textContent=unreadConversation>99?'99+':String(unreadConversation);}
      conversationTab.classList.toggle('has-unread',unreadConversation>0);
      conversationTab.setAttribute?.('aria-label',unreadConversation?`Conversation, ${unreadConversation} unread messages`:'Conversation');
    }
    const chat=$('online-chat-messages'),atBottom=chat.scrollHeight-chat.scrollTop-chat.clientHeight<90;
    // The council record contains actual human speech and objective public
    // events. Bot commentary is omitted; private hands are never published.
    const completedPolicyRounds=new Set((current.policyHistory||[]).filter(h=>!h.chaos&&h.debriefAt).map(h=>h.round));
    const record=[...(current.events||[]).filter(e=>/is Secretary|enact|chaos|claim|investigat|declar|execut|election|veto|nomina|policy dispute|contradict|reshuffl/i.test(e.text))
      .filter(e=>!(/ claimed: /i.test(e.text)&&completedPolicyRounds.has(e.round)))
      .map(e=>({at:e.at||0,round:e.round,kind:'event',text:e.text})),
      ...(current.votingHistory||[]).filter(v=>v.resolvedAt).map(v=>({at:v.resolvedAt+1,round:v.round,kind:'ballots',votes:v.votes})),
      ...(current.policyHistory||[]).filter(h=>!h.chaos&&h.debriefAt).map(h=>({at:h.debriefAt+2,round:h.round,kind:'policy-summary',policy:h})),
      ...(current.chat||[]).filter(m=>!m.kind&&!current.players?.[m.seat]?.bot)
        .map(m=>({at:m.at||0,kind:'human',seat:m.seat,text:m.text})),
      ...(current.chat||[]).filter(m=>m.kind==='opinion'&&current.players?.[m.seat]?.bot)
        .map(m=>({at:m.at||0,kind:'opinion',seat:m.seat,text:m.text}))]
      .sort((a,b)=>a.at-b.at);
    const round=m=>m.round?`<span class="council-round-chip">R${m.round}</span> `:'';
    const coloredClaims=s=>esc(s).replace(/\bWhite\b/g,'<b class="claim-white">White</b>')
      .replace(/\bCommunist\b/g,'<b class="claim-communist">Communist</b>');
    const eventMarkup=m=>{
      const t=m.text;
      if(/^Election failed:/i.test(t))return `<p class="council-event-line election-failed">${round(m)}<strong>⛔ GOVERNMENT REJECTED</strong> — ${esc(t.replace(/^Election failed:\s*/i,''))}</p>`;
      if(/^Election passed:/i.test(t))return `<p class="council-event-line election-passed">${round(m)}<strong>✓ GOVERNMENT ELECTED</strong> — ${esc(t.replace(/^Election passed:\s*/i,''))}</p>`;
      if(/nominated .*\./i.test(t))return `<p class="council-event-line council-nomination">${round(m)}<strong>👑 PREMIER NOMINATED</strong> — ${esc(t)}</p>`;
      if(/enacted a (white|communist) policy/i.test(t)){
        const white=/enacted a white policy/i.test(t);
        return `<p class="council-event-line ${white?'council-white-policy':'council-communist-policy'}">${round(m)}<strong>${white?'★ WHITE POLICY ENACTED':'☭ COMMUNIST POLICY ENACTED'}</strong> — ${esc(t)}</p>`;
      }
      if(/ declared .* (WHITE|COMMUNIST)\./i.test(t)){
        const white=/ WHITE\./i.test(t);
        return `<p class="council-event-line ${white?'council-invest-white':'council-invest-communist'}">${round(m)}<strong>🔎 INVESTIGATION DECLARED ${white?'WHITE':'COMMUNIST'}</strong> — ${esc(t)} <em>(Public claim, not verified.)</em></p>`;
      }
      if(/ claimed: /i.test(t))return `<p class="council-event-line council-policy-claim">${round(m)}<strong>🃏 CARD ACCOUNT (CLAIM)</strong> — ${coloredClaims(t)}</p>`;
      if(/dispute|contradict/i.test(t))return `<p class="council-event-line council-conflict">${round(m)}<strong>⚡ POLICY CONTRADICTION</strong> — ${esc(t)}</p>`;
      if(/execut/i.test(t))return `<p class="council-event-line council-execution">${round(m)}<strong>🎯 EXECUTION</strong> — ${esc(t)}</p>`;
      if(/Nomination expired/i.test(t))return `<p class="council-event-line election-failed">${round(m)}<strong>⌛ NOMINATION EXPIRED</strong> — ${esc(t)}</p>`;
      return `<p class="council-event-line">${round(m)}${esc(t)}</p>`;
    };
    const filteredRecord=record.filter(m=>logView==='conversation'
      ?(m.kind==='human'||m.kind==='opinion'):(m.kind!=='human'&&m.kind!=='opinion'));
    const displayedRecord=logView==='events'?orderGameEventRecord(filteredRecord):filteredRecord;
    let recordRound=null;
    const serverMessages=displayedRecord.map(m=>{
      const separator=m.round&&m.round!==recordRound?`<div class="council-round-separator">ROUND ${m.round}</div>`:'';
      if(m.round)recordRound=m.round;
      return separator+(m.kind==='human'
      ?`<p class="human-chat-line"><strong>${esc(name(m.seat))}:</strong> ${esc(m.text)}</p>`:
      m.kind==='opinion'
        ?`<p class="bot-opinion-line"><strong>🤖 ${esc(name(m.seat))}:</strong> ${esc(m.text)}</p>`
        :m.kind==='policy-summary'
          ?`<div class="council-event-line council-handoff">${round(m)}<strong>🃏 GOVERNMENT POLICY HANDOFF</strong>
            <div><b>Secretary ${esc(name(m.policy.president))} claimed:</b> ${coloredClaims(m.policy.claims?.[m.policy.president]||'No statement')}</div>
            <div><b>Premier ${esc(name(m.policy.chancellor))} claimed:</b> ${coloredClaims(m.policy.claims?.[m.policy.chancellor]||'No statement')}</div>
            <div><b>Board enacted:</b> <span class="${m.policy.policy==='white'?'claim-white':'claim-communist'}">${m.policy.policy==='white'?'★ WHITE':'☭ COMMUNIST'}</span></div>
            <small>These are public claims, not proof of the cards actually held.</small></div>`
        :m.kind==='ballots'
          ?`<p class="council-event-line council-ballot-detail">${round(m)}<strong>🗳 WHO VOTED HOW</strong><span class="ballot-list">${Object.entries(m.votes).sort((a,b)=>Number(a[0])-Number(b[0])).map(([seat,yes])=>`<span class="ballot-mini ${yes?'yes':'no'}">${esc(name(Number(seat)))}: ${yes?'ДА':'НЕТ'}</span>`).join('')}</span></p>`
          :eventMarkup(m));
    }).join('');
    const pending=outbox.map(m=>`<p class="chat-outbox ${m.failed?'chat-failed':''}"><strong>You:</strong> ${esc(m.text)} <span>${m.failed?'Not sent':'Sending…'}</span>${m.failed?` <button type="button" data-chat-retry="${m.id}">Retry</button>`:''}</p>`).join('');
    chat.innerHTML=(serverMessages||`<p class="online-empty-log">${logView==='events'?'Public game events will appear here.':'No one has spoken yet. Write a message below.'}</p>`)+
      (logView==='conversation'?pending:'');
    if(atBottom)chat.scrollTop=chat.scrollHeight;
  }
  function sendChat(message){
    const item=typeof message==='string'?{id:++nextMessageId,text:message,failed:false}:message;
    if(typeof message==='string')outbox.push(item);
    logView='conversation';
    for(const tab of document.querySelectorAll?.('[data-log-view]')||[])
      tab.classList.toggle('active',tab.dataset.logView===logView);
    item.failed=false;chatPending++;renderChat();chatStatus('Sending…');
    enqueue(async()=>{
      const delay=Math.max(0,lastChatSentAt+850-Date.now());
      if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      // A chat can be sent in any active phase, but must use its latest version.
      await call({type:'chat',text:item.text});
      lastChatSentAt=Date.now();
    }).then(()=>{
      const i=outbox.indexOf(item);if(i>=0)outbox.splice(i,1);
      chatStatus('Message sent ✓');
    }).catch(e=>{
      item.failed=true;
      chatStatus('Message not sent — click Retry on your message. '+e.message,true);
    }).finally(()=>{chatPending--;if(active)renderChat();});
  }
  function button(text,type,target=null,cls=''){
    return `<button class="online-choice ${cls}" data-type="${type}" ${target!==null?`data-target="${target}"`:''}>${esc(text)}</button>`;
  }
  function policyButton(policy,type,index){
    return `<button class="online-choice policy-card ${policy}" data-type="${type}" data-target="${index}">
      <span class="card-icon">${policy==='white'?'★':'☭'}</span>
      <span class="card-label">${policy==='white'?'WHITE':'COMMUNIST'}</span>
    </button>`;
  }
  function decisions(){
    if(!current)return;
    const g=current,disabled=!g.myTurn,head=$('online-prompt');
    let html='';
    claimActions=[];
    const decisionTitle=$('online-decision-title');
    const panel=decisionTitle.closest?.('.online-action-panel');
    if(panel)panel.dataset.phase=g.phase+(g.power?'-'+g.power:'');
    const phaseTitles={nomination_intro:'👑 NEW SECRETARY',legislative_intro:'🃏 GOVERNMENT ELECTED',
      power_intro:'⚡ EXECUTIVE POWER',power_target:'🔎 INVESTIGATING',power_result:'⚡ POWER RESULT',
      reshuffle_reveal:'🔀 DECK RESHUFFLED',nomination:'👑 PREMIER NOMINATION',voting:'🗳 GOVERNMENT VOTE',
      election_reveal:'🗳 REVEALING THE VOTES',policy_reveal:'🃏 POLICY ENACTED',
      legislative_president:'🃏 SECRETARY SELECTS POLICIES',legislative_chancellor:'🃏 PREMIER ENACTS POLICY',
      veto_response:'🚫 VETO REQUEST',debrief:'🗣 POLICY ACCOUNTS',executive_power:g.power==='execution'?'🎯 EXECUTION ORDER':
        g.power==='investigate'?'🔎 INVESTIGATION':g.power==='special'?'📣 SPECIAL ELECTION':'⚡ EXECUTIVE POWER',
      gameover:'🏁 MATCH COMPLETE'};
    decisionTitle.textContent=(g.myTurn?'YOUR TURN · ':'')+(phaseTitles[g.phase]||g.phase);
    const elapsed=Math.max(0,Date.now()+clockOffset-(g.phaseStart||0));
    const seconds=x=>Math.max(0,Math.ceil(x/1000));
    const candidate=`<strong>${esc(name(g.president))}</strong> (Secretary) + <strong>${esc(name(g.nominee??g.chancellor))}</strong> (Premier)`;
    if(g.phase==='election_reveal'){
      decisionTitle.textContent='🗳 ELECTION RESULTS';
      if(!voteResultReady){head.textContent='Votes are being revealed one at a time.';
        html='<div class="flow-announcement">🗳 COUNTING VOTES…</div>';}
      else{
        const failCount=g.electionTracker+1;
        const failed=`${failCount===1?'1st':failCount===2?'2nd':'3rd'} FAILED ELECTION!`;
        head.textContent='The full vote is visible under every player.';
        html=`<div class="flow-announcement ${g.votes?.passed?'flow-yes':'flow-no'}"><strong>${g.votes?.passed?'✓ ELECTION PASSED':'✕ ELECTION FAILED'}</strong>
          ${!g.votes?.passed?`<span>${failed}</span>`:''}<small>${candidate}</small></div>`;
      }
    }else if(g.phase==='legislative_intro'){
      decisionTitle.textContent='🃏 POLICY HANDOFF';head.textContent='The elected government is preparing its policies.';
      html=`<div class="flow-announcement"><strong>Policies being passed by</strong><small>${candidate}</small></div>`;
    }else if(g.phase==='nomination_intro'){
      decisionTitle.textContent='👑 NEXT SECRETARY';head.textContent='Next government is about to be nominated.';
      html=`<div class="flow-announcement"><strong>Secretary ${esc(name(g.president))} is choosing a Premier</strong></div>`;
    }else if(g.phase==='reshuffle_reveal'){
      const info=g.reshuffleNotice||{seen:0,zero:[],disagreements:[]};
      decisionTitle.textContent='🔀 DECK RESHUFFLED';head.textContent='The public card-counting record is being reviewed.';
      const conflicts=(info.disagreements||[]).map(d=>`${esc(d.secretary)} vs ${esc(d.premier)} (R${Number(d.round)})`).join(' · ');
      html=`<div class="flow-announcement flow-reshuffle"><strong>🔀 DECK RESHUFFLED</strong><span>${info.seen}/6 White cards reported seen</span>
        <small><b>Secretaries who claimed 0 White:</b> ${esc(info.zero?.join(', ')||'None')}</small>
        <small><b>Policy disagreements:</b> ${conflicts||'None'}</small></div>`;
    }else if(g.phase==='policy_reveal'){
      decisionTitle.textContent='🃏 POLICY RESULT';head.textContent='Review the enacted policy and the public card claims.';
      if(elapsed<1000)html='';
      else{
        const p=g.policyHistory?.at(-1);
        const a=p?.claims?.[p.president]||'',b=p?.claims?.[p.chancellor]||'';
        const given=a.match(/passed (\d+) White/i),received=b.match(/Received (\d+) White/i);
        const conflict=given&&received&&given[1]!==received[1];
        html=`<div class="flow-announcement ${p?.policy==='white'?'flow-white':'flow-red'}"><strong>${p?.policy==='white'?'★ WHITE PASSED':'☭ COMMUNIST PASSED'}</strong>
          ${p?.chaos?'<small>Drawn by election chaos.</small>':`<small><b>${esc(name(p?.president))} (Secretary)</b>: ${esc(a||'No claim')}</small><small><b>${esc(name(p?.chancellor))} (Premier)</b>: ${esc(b||'No claim')}</small>
          <span class="${conflict?'flow-contradiction':''}">${conflict?'⚠ CONTRADICTION — ACCOUNTS DISAGREE':'✓ No contradiction in the reported counts'}</span>`}</div>`;
      }
    }else if(g.phase==='power_intro'){
      decisionTitle.textContent='⚡ EXECUTIVE POWER';head.textContent='The Secretary receives an executive power.';
      const verb={investigate:'investigate',special:'call a special election',execution:'execute',peek:'inspect the next policies'}[g.power]||'act';
      html=`<div class="flow-announcement"><strong>Secretary ${esc(name(g.president))} has power to ${verb}</strong></div>`;
    }else if(g.phase==='power_target'){
      decisionTitle.textContent='🔎 INVESTIGATION';head.textContent='The investigation target has been selected.';
      html=`<div class="flow-announcement"><strong>Secretary ${esc(name(g.president))} is investigating ${esc(name(g.powerTarget))}</strong></div>`;
    }else if(g.phase==='power_result'){
      const r=g.powerResult||{};decisionTitle.textContent='⚡ EXECUTIVE RESULT';
      head.textContent='The council is reviewing the executive action.';
      html=`<div class="flow-announcement"><strong>${r.type==='investigate'?`${esc(name(g.president))} declared ${esc(name(r.target))} ${esc((r.team||'').toUpperCase())}`:
        r.type==='execution'?`${esc(name(g.president))} executed ${esc(name(r.target))}`:
        `${esc(name(g.president))} selected ${esc(name(r.target))} as special Secretary`}</strong>
        ${r.type==='investigate'?'<small>Public declaration; may be untrue.</small>':''}</div>`;
    }else if(pendingDecision&&pendingDecision.phaseVersion===g.phaseVersion){
      decisionTitle.textContent='✓ Choice Locked In';
      head.textContent=`${pendingDecision.label} — choice locked in.`;
      html=pendingDecision.action.type==='vote'
        ?'<div class="flow-announcement"><strong>Waiting on election</strong><small>Your ballot was submitted.</small></div>'
        :`<div class="online-click-confirmation"><span>✓</span> Choice registered. Waiting for the server.</div>`;
    }else if(g.phase==='gameover'){
      head.textContent=g.winReason;
      html=`<div class="online-win">${g.winner==='white'?'★ WHITES WIN':'☭ COMMUNISTS WIN'}</div>`;
    }else if(disabled){
      const people=(g.waiting||[]).filter(p=>!p.bot).map(p=>p.name);
      const actions={election_reveal:'🗳 Revealing every vote before the government can proceed.',
        policy_reveal:'🃏 Policy enacted! Three seconds to review the board before the next decision.',
        nomination:`👑 ${name(g.president)} is nominating a Premier. The nominee will be voted on by the council.`,
        voting:`🗳 ${name(g.president)} and ${name(g.nominee)} are up for election. ${g.doneCount}/${g.requiredCount} secret ballots submitted.`,
        legislative_president:`🃏 Secretary ${name(g.president)} is looking at three secret policies and discarding one.`,
        legislative_chancellor:`🃏 Premier ${name(g.chancellor)} is choosing which of two secret policies to enact.`,
        veto_response:`🚫 Secretary ${name(g.president)} is considering the Premier's veto request.`,
        debrief:`🗣 Secretary ${name(g.president)} and Premier ${name(g.chancellor)} are declaring what they saw. Their claims may conflict.`,
        executive_power:g.power==='execution'?`🎯 Secretary ${name(g.president)} is choosing a player to EXECUTE.`:
          g.power==='investigate'?`🔎 Secretary ${name(g.president)} is investigating someone's party loyalty.`:
          g.power==='special'?`📣 Secretary ${name(g.president)} is selecting the next Secretary.`:
          `⚡ Secretary ${name(g.president)} is resolving an executive power.`};
      const ownVote=g.phase==='voting'&&localVote?.phaseVersion===g.phaseVersion
        ?` Your vote: ${localVote.yes?'ДА (YES)':'НЕТ (NO)'} ✓ — locked in.`:'';
      head.textContent=(actions[g.phase]||'Council deliberations underway.')+ownVote+
        (people.length?` Waiting for ${people.join(', ')}.`:' All required decisions are being processed.');
      if(g.phase==='voting')html=`<div class="flow-announcement"><strong>Waiting on election</strong><small>${people.length?'Waiting for '+esc(people.join(', ')):'All votes submitted; counting shortly.'}</small></div>`;
      else if(g.phase==='legislative_president'||g.phase==='legislative_chancellor')html=`<div class="flow-announcement"><strong>Policies being passed by</strong><small>${candidate}</small><small>${people.length?'Waiting on '+esc(people.join(', ')):''}</small></div>`;
      else if(g.phase==='debrief')html='';
      else html=`<div class="online-wait-card"><span class="online-wait-spinner">◌</span><strong>${people.length?'WAITING ON '+esc(people.join(', ')):'ADVANCING COUNCIL'}</strong><small>${esc(actions[g.phase]||'A server-controlled action is completing.')} · Deadline shown above.</small></div>`;
    }else if(g.phase==='nomination'){
      head.textContent='👑 YOU are Secretary. Only YOU choose the Premier. You have 30 seconds; if time expires, your nomination is skipped (no bot will choose for you).';
      html=g.eligible.map(i=>button(name(i),'nominate',i)).join('');
    }else if(g.phase==='voting'){
      if(Date.now()+clockOffset<(g.voteReadyAt||0)){
        head.textContent='Nomination announced. Voting opens in three seconds — get ready.';
        html='<div class="online-wait-card">🃏 Read the latest policy and nomination. Ballots open shortly.</div>';
      }else{
        head.textContent=`Vote on ${name(g.president)} (Secretary) and ${name(g.nominee)} (Premier). Ballots are secret until all votes are in.`;
        html=button('👍 ДА','vote_yes',null,'yes')+button('👎 НЕТ','vote_no',null,'no');
      }
    }else if(g.phase==='legislative_president'){
      head.textContent='Secretly discard one of these three policies. Only you see them.';
      html=(g.hand||[]).map((p,i)=>policyButton(p,'discard',i)).join('');
    }else if(g.phase==='legislative_chancellor'){
      head.textContent='Choose the policy to enact. Only you see these cards.';
      html=(g.hand||[]).map((p,i)=>policyButton(p,'enact',i)).join('');
      if(g.vetoAvailable)html+=button('🚫 Propose Veto','propose_veto');
    }else if(g.phase==='veto_response'){
      head.textContent='The Premier proposed a veto. Do you consent?';
      html=button('Approve Veto','veto_yes')+button('Reject Veto','veto_no');
    }else if(g.phase==='debrief'){
      head.textContent=g.role==='white'?'Your truthful policy account is recorded automatically. No decision is needed.':
        'Choose a credible public policy account. You can bluff, but self-incriminating or impossible claims are removed.';
      const enacted=g.policyHistory?.at(-1)?.policy;
      if(g.role==='white'){
        html='<div class="online-click-confirmation">✓ White policy account automatically reported truthfully.</div>';
      }else if(g.seat===g.president){
        const truth=g.claimFacts;
        claimActions.push(...safeSecretaryClaimOptions(enacted));
        html=claimActions.map((c,i)=>button(`${truth&&c.drawWhite===truth.drawWhite&&c.passedWhite===truth.passedWhite?'✓ TRUTH · ':''}Drew ${c.drawWhite} White, ${3-c.drawWhite} Communist · Passed ${c.passedWhite} White, ${2-c.passedWhite} Communist`,'claim_option',i)).join('');
      }else{
        const truth=g.claimFacts;
        claimActions.push(...safePremierClaimOptions(enacted));
        html=claimActions.map((c,i)=>button(`${truth&&c.receivedWhite===truth.receivedWhite?'✓ TRUTH · ':''}Received ${c.receivedWhite} White, ${2-c.receivedWhite} Communist`,'claim_option',i)).join('');
      }
    }else if(g.phase==='executive_power'){
      if(g.power==='peek'){
        head.textContent='Top three policies (private knowledge): '+(g.peek||[]).join(', ');
        html=button('Continue','ack_peek');
      }else if(g.power==='investigation_announce'){
        head.textContent=`Your private check of ${name(g.investigationTarget)}: ${g.investigations[g.investigationTarget]}. What will you publicly announce?`;
        if(g.role==='white')html=button(`Declare ${g.investigations[g.investigationTarget]}`,'announce_'+g.investigations[g.investigationTarget]);
        else html=button('Declare White','announce_white')+button('Declare Communist','announce_communist');
      }else{
        head.textContent={investigate:'🔎 YOU ARE SECRETARY: Privately investigate one eligible comrade.',special:'📣 YOU ARE SECRETARY: Select the next Secretary.',execution:'🎯 YOU ARE SECRETARY: Execute one comrade. This decision cannot be undone.'}[g.power]||'Executive power';
        html=g.players.filter(p=>!p.dead&&p.seat!==g.president&&
          (g.power!=='investigate'||(g.eligibleInvestigations||[]).includes(p.seat)))
          .map(p=>button(name(p.seat),g.power==='investigate'?'investigate':g.power==='special'?'special_election':'execute',p.seat)).join('');
      }
    }
    $('online-actions').innerHTML=html;
    if(submitError&&submitError.phaseVersion===g.phaseVersion){
      const alert=document.createElement('div');
      alert.className='online-submit-error';alert.setAttribute('role','alert');
      alert.textContent=submitError.message;
      $('online-actions').prepend(alert);
    }
    if(g.myTurn){
      const others=(g.waiting||[]).filter(p=>p.seat!==g.seat&&!p.bot).map(p=>p.name);
      const waitingOnYou=others.length?` The council is waiting on you and ${others.join(', ')}.`:
        ' The whole council is waiting on you.';
      head.textContent+=waitingOnYou;
    }
  }
  function updateVoteReveal(g){
    const vote=g.votes;
    voteShowing=g.phase==='election_reveal'&&!!vote?.votes;
    if(!voteShowing){voteRevealedCount=0;voteResultReady=false;return;}
    const key=`${vote.round}:${vote.president}:${vote.nominee}`;
    if(lastVoteKey!==key){lastVoteKey=key;voteRevealClientStart=Date.now();}
    // Anchor the animation when this browser first receives the result.
    // With 1.8s polling, using resolvedAt would reveal 8+ votes at once.
    const elapsed=Math.max(0,Date.now()-voteRevealClientStart);
    const count=Object.keys(vote.votes).length;
    voteRevealedCount=Math.min(count,Math.floor(elapsed/200)+1);
    voteResultReady=elapsed>=count*200;
  }
  function showVotes(g){updateVoteReveal(g);renderSeatVotes(g);}
  function renderSeatVotes(g){
    if(!g)return;
    for(const badge of $('online-players').querySelectorAll?.('[data-vote-seat]')||[])
      badge.innerHTML=seatVote(g,Number(badge.dataset.voteSeat));
  }
  function seatVote(g,seat){
    if(g.phase==='voting'&&seat===g.seat&&localVote?.phaseVersion===g.phaseVersion&&!voteShowing){
      return `<span class="vote-reveal-chip ${localVote.yes?'yes':'no'}">${localVote.yes?'ДА':'НЕТ'} ✓</span>`;
    }
    if(!g.votes?.votes||!voteShowing)return '';
    const key=`${g.votes.round}:${g.votes.president}:${g.votes.nominee}`;
    if(lastVoteKey!==key)return '';
    const seats=Object.keys(g.votes.votes).sort((a,b)=>Number(a)-Number(b));
    if(seats.indexOf(String(seat))>=voteRevealedCount)return '';
    const yes=g.votes.votes[seat];
    return `<span class="vote-reveal-chip ${yes?'yes':'no'}">${yes?'ДА':'НЕТ'}</span>`;
  }
  function renderElectionStatus(g){
    if(!g)return;
    const last=g.votes,line=$('online-election');
    const phaseName={nomination:'NOMINATION',voting:'VOTING OPEN',legislative_president:'SECRETARY DECIDING',
      legislative_chancellor:'PREMIER DECIDING',veto_response:'VETO DECISION',debrief:'POLICY DEBRIEF',
      executive_power:g.power==='execution'?'EXECUTION DECISION':g.power==='investigate'?'INVESTIGATION':
        g.power==='special'?'SPECIAL ELECTION':'EXECUTIVE POWER',gameover:'GAME OVER'}[g.phase]||g.phase;
    $('online-phase').textContent=voteShowing?(voteResultReady?(last?.passed?'VOTE PASSED':'VOTE FAILED'):'COUNTING VOTES'):phaseName;
    line.classList.toggle('election-rejected',!!last&&voteShowing&&voteResultReady&&!last.passed);
    line.classList.toggle('election-approved',!!last&&voteShowing&&voteResultReady&&last.passed);
    line.classList.toggle('election-counting',voteShowing&&!voteResultReady);
    line.classList.toggle('election-voting',g.phase==='voting'&&!voteShowing);
    const details=`Round ${g.round} · Secretary: ${esc(name(g.president))}${g.nominee!==null?' · Premier: '+esc(name(g.nominee)):''}`;
    if(voteShowing&&last){
      const yes=Object.values(last.votes).filter(Boolean).length;
      const no=Object.values(last.votes).length-yes;
      line.innerHTML=voteResultReady
        ?`<strong>${last.passed?'✓ GOVERNMENT APPROVED':'⛔ GOVERNMENT REJECTED'}</strong> · ${yes} ДА / ${no} НЕТ · ${details}`
        :`<strong>🗳 COUNTING BALLOTS…</strong> · Revealed ${voteRevealedCount}/${yes+no} · ${details}`;
    }else{
      const status={nomination:'📣 NOMINATING PREMIER',voting:'🗳 VOTING OPEN — BALLOTS SECRET',legislative_president:'🃏 SECRETARY CHOOSING POLICIES',
        legislative_chancellor:'🃏 PREMIER CHOOSING POLICY',veto_response:'🚫 VETO DECISION',debrief:'💬 POLICY CLAIMS',
        executive_power:g.power==='execution'?'🎯 SECRETARY DECIDING EXECUTION':g.power==='investigate'?'🔎 SECRETARY INVESTIGATING':
          g.power==='special'?'📣 SECRETARY CHOOSING SUCCESSOR':'⚡ EXECUTIVE POWER',gameover:'🏁 MATCH COMPLETE'}[g.phase]||g.phase;
      line.innerHTML=`<strong>${status}</strong> · ${details} · Election tracker: ${g.electionTracker}/3`;
    }
  }
  function renderRoundGuide(g){
    const title=$('online-step-title'),detail=$('online-step-detail');
    const result=$('online-last-title'),resultDetail=$('online-last-detail');
    const currentGov=`${name(g.president)} (Secretary)${g.nominee!==null?` + ${name(g.nominee)} (Premier)`:''}`;
    const live={
      nomination:['1 · PREMIER NOMINATION',`${name(g.president)} is selecting a Premier. No vote has begun yet.`],
      voting:['2 · COUNCIL VOTING',`${currentGov} — ${g.doneCount}/${g.requiredCount} votes cast. Votes are secret until counting.`],
      legislative_president:['3 · SECRETARY HAS 3 CARDS',`${name(g.president)} is discarding one secret policy and passing two.`],
      legislative_chancellor:['4 · PREMIER HAS 2 CARDS',`${name(g.chancellor)} is choosing which policy to enact.`],
      veto_response:['4 · VETO DECISION',`${name(g.president)} must accept or reject ${name(g.chancellor)}’s veto proposal.`],
      debrief:['5 · PLAYERS DECLARE THEIR CARDS',`${name(g.president)} and ${name(g.chancellor)} report what they saw. These may be lies.`],
      executive_power:g.power==='investigate'||g.power==='investigation_announce'
        ?['6 · INVESTIGATION',`${name(g.president)} is investigating or declaring a party loyalty.`]
        :g.power==='execution'?['6 · EXECUTION',`${name(g.president)} is choosing whom to execute.`]
        :['6 · EXECUTIVE POWER',`${name(g.president)} is resolving ${g.power||'a special action'}.`],
      gameover:['MATCH FINISHED',g.winReason||'The council has concluded.']
    };
    const now=live[g.phase]||['COUNCIL IN SESSION','Awaiting the next step.'];
    if(voteShowing){
      const counted=g.votes;
      const yes=Object.values(counted?.votes||{}).filter(Boolean).length;
      const no=Object.values(counted?.votes||{}).length-yes;
      title.textContent=voteResultReady?(counted.passed?'✓ VOTE PASSED':'✕ VOTE FAILED'):'🗳 COUNTING VOTES';
      detail.textContent=voteResultReady
        ?`${name(counted.president)} / ${name(counted.nominee)} · ${yes} YES · ${no} NO`
        :`${voteRevealedCount}/${yes+no} ballots revealed, one by one below the players.`;
    }else{title.textContent=now[0];detail.textContent=now[1];}
    const policy=g.policyHistory?.at(-1),vote=g.votingHistory?.at(-1),investigation=g.publicInvestigations?.at(-1);
    const outcomes=[];
    if(vote?.resolvedAt){
      const yes=Object.values(vote.votes||{}).filter(Boolean).length;
      const no=Object.values(vote.votes||{}).length-yes;
      outcomes.push({at:vote.resolvedAt,type:vote.passed?'approved':'rejected',title:vote.passed?'✓ GOVERNMENT ELECTED':'✕ ELECTION FAILED',
        detail:`R${vote.round}: ${name(vote.president)} / ${name(vote.nominee)} · ${yes} YES, ${no} NO`});
    }
    if(policy){
      outcomes.push({at:policy.debriefAt||g.events?.filter(e=>/enacted a .* policy/i.test(e.text)).at(-1)?.at||0,
        type:policy.policy==='white'?'white':'communist',title:policy.policy==='white'?'★ WHITE POLICY ENACTED':'☭ COMMUNIST POLICY ENACTED',
        detail:`R${policy.round}${policy.chaos?' · Chaos draw':` · ${name(policy.president)} / ${name(policy.chancellor)}`} · Claims in council record`});
    }
    if(investigation){
      outcomes.push({at:investigation.at||0,type:'investigation',title:`🔎 DECLARED ${investigation.team.toUpperCase()}`,
        detail:`R${investigation.round} · ${name(investigation.president)} investigated ${name(investigation.target)} (unverified claim)`});
    }
    const lastExecution=g.executions?.at(-1);
    if(lastExecution){
      const recorded=g.events?.filter(e=>e.round===lastExecution.round&&e.text?.includes(`${name(lastExecution.target)} was executed`)).at(-1);
      outcomes.push({at:recorded?.at||0,type:'execution',title:'🎯 EXECUTION',
        detail:`R${lastExecution.round} · ${name(lastExecution.president)} executed ${name(lastExecution.target)}`});
    }
    outcomes.sort((a,b)=>b.at-a.at);
    const latest=outcomes[0];
    $('online-last-card').dataset.kind=latest?.type||'none';
    result.textContent=latest?.title||'No result yet';
    resultDetail.textContent=latest?.detail||'Results will appear here after the first election.';
    if(latest){
      const key=`${latest.type}:${latest.at}:${latest.detail}`;
      if(lastResultHighlight!==key){
        lastResultHighlight=key;
        const age=Date.now()+clockOffset-latest.at;
        if(latest.at&&age>=0&&age<3000){
          $('online-last-card').classList.add('fresh-result');
          scheduleAnimation(()=>$('online-last-card').classList.remove('fresh-result'),
            latest.type==='execution'?5000:4000);
        }
      }
    }
  }
  function roundStage(g){
    if(g.phase==='nomination')return 0;
    if(g.phase==='voting')return 1;
    if(g.phase==='legislative_president'||g.phase==='legislative_chancellor'||g.phase==='veto_response')return 2;
    if(g.phase==='debrief')return 3;
    return 4;
  }
  function renderTimeline(g){
    const stage=roundStage(g);
    const stages=['1 · NOMINATE','2 · VOTE','3 · POLICIES','4 · CLAIMS','5 · POWER'];
    $('online-round-timeline').innerHTML=stages.map((label,i)=>{
      const status=g.phase==='gameover'?'complete':i===stage?'current':i<stage?'complete':'upcoming';
      return `<div class="online-timeline-step ${status}" aria-current="${status==='current'?'step':'false'}"><span>${status==='complete'?'✓':i+1}</span><strong>${label}</strong></div>`;
    }).join('');
    if(g.round!==lastRoundHighlight){
      lastRoundHighlight=g.round;
      $('online-round-timeline').classList.add('fresh-round');
      scheduleAnimation(()=>$('online-round-timeline').classList.remove('fresh-round'),1500);
    }
  }
  function renderGovernment(g){
    const host=$('online-government');
    if(g.phase==='nomination'){
      host.innerHTML=`<div class="government-wait"><b>👑 Secretary ${esc(name(g.president))}</b> is selecting a Premier. <span>No government has been proposed this round.</span></div>`;
      return;
    }
    const sec=g.president,prem=g.nominee??g.chancellor;
    const latest=g.policyHistory?.at(-1);
    const samePolicy=latest&&!latest.chaos&&latest.round===g.round&&latest.president===sec;
    const claims=samePolicy?(latest.claims||g.claims||{}):{};
    const secretaryClaim=claims[sec],premierClaim=claims[prem];
    const draw=secretaryClaim?.match(/Drew (\d+) White and (\d+) Communist/i);
    const passed=secretaryClaim?.match(/passed (\d+) White and (\d+) Communist/i);
    const received=premierClaim?.match(/Received (\d+) White and (\d+) Communist/i);
    const hand=pair=>pair?`<b class="claim-white">${pair[1]}W</b> + <b class="claim-communist">${pair[2]}C</b>`:'Not declared';
    const contradiction=passed&&received&&passed[1]!==received[1];
    const lastVote=g.votingHistory?.at(-1);
    const elected=lastVote?.round===g.round?lastVote.passed:null;
    const votes=lastVote?.round===g.round?
      `${Object.values(lastVote.votes).filter(Boolean).length} YES / ${Object.values(lastVote.votes).filter(v=>!v).length} NO`:'Vote pending';
    host.innerHTML=`<div class="government-people"><div><small>SECRETARY</small><strong>${esc(name(sec))}</strong><span>${draw?'Drew '+hand(draw):'Receives 3 policies'}</span></div>
      <div><small>PREMIER</small><strong>${esc(name(prem))}</strong><span>${received?'Claims '+hand(received):'Receives 2 policies'}</span></div></div>
      <div class="government-outcome"><span class="government-election ${elected===true?'passed':elected===false?'failed':''}">${elected===null?'🗳 '+votes:elected?'✓ ELECTED · '+votes:'✕ REJECTED · '+votes}</span>
      <span>${samePolicy?`Board: <b class="${latest.policy==='white'?'claim-white':'claim-communist'}">${latest.policy==='white'?'★ WHITE':'☭ COMMUNIST'}</b>`:'Policy not enacted yet'}</span>
      ${passed?`<small>Secretary claims passed: ${hand(passed)}</small>`:''}
      ${contradiction?'<strong class="government-contradiction">⚠ SECRETARY / PREMIER CLAIMS CONFLICT</strong>':''}
      <small>Card counts are public claims, not verified hands.</small></div>`;
  }
  function showInvestigation(g){
    const notice=$('online-investigation-banner');
    const last=g.publicInvestigations?.at(-1);
    if(!last)return;
    const key=`${last.round}:${last.president}:${last.target}:${last.team}`;
    if(key===lastInvestigationKey)return;
    lastInvestigationKey=key;
    // Old public checks belong in the record, not as a new popup on rejoin.
    if(last.at&&Date.now()+clockOffset-last.at>8000)return;
    const claimWhite=last.team==='white';
    notice.className=`online-investigation-banner ${claimWhite?'declared-white':'declared-communist'}`;
    notice.innerHTML=`<span class="investigation-kicker">🔎 ROUND ${last.round} · INVESTIGATION ANNOUNCEMENT</span>
      <strong>${esc(name(last.president))} investigated ${esc(name(last.target))}</strong>
      <span class="investigation-verdict">DECLARED ${claimWhite?'★ WHITE':'☭ COMMUNIST'}</span>
      <small>Public statement only — the Secretary could be lying.</small>`;
    // The persistent result strip carries this information without covering
    // the board or blocking the next player's action.
    notice.hidden=true;
  }
  function renderDossier(seat){
    if(!current||seat===null||!current.players?.[seat])return;
    const g=current,p=g.players[seat],history=[];
    let yesCount=0,noCount=0,governments=0,disputes=0;
    for(const v of (g.votingHistory||[])){
      if(Object.hasOwn(v.votes||{},seat)){
        if(v.votes[seat])yesCount++;else noCount++;
        history.push({round:v.round,order:1,text:`Voted ${v.votes[seat]?'ДА (YES)':'НЕТ (NO)'} on ${name(v.president)} / ${name(v.nominee)}. ${v.passed?'Government approved.':'Government rejected.'}`});
      }
      if(v.president===seat)history.push({round:v.round,order:0,text:`As Secretary, nominated ${name(v.nominee)} for Premier.`});
      if(v.nominee===seat&&v.passed)governments++;
      if(v.nominee===seat)history.push({round:v.round,order:0,text:`Nominated for Premier by ${name(v.president)}. ${v.passed?'Elected.':'Not elected.'}`});
    }
    for(const h of (g.policyHistory||[])){
      if(h.chaos)continue;
      const secClaim=h.claims?.[h.president]?.match(/passed (\d+) White/i);
      const premClaim=h.claims?.[h.chancellor]?.match(/Received (\d+) White/i);
      if((h.president===seat||h.chancellor===seat)&&secClaim&&premClaim&&secClaim[1]!==premClaim[1])disputes++;
      if(h.president===seat)history.push({round:h.round,order:2,text:`Served as Secretary; ${h.policy.toUpperCase()} policy enacted. ${h.claims?.[seat]||((g.round===h.round&&g.claims?.[seat])||'No public card claim yet.')}`});
      if(h.chancellor===seat)history.push({round:h.round,order:2,text:`Served as Premier; enacted ${h.policy.toUpperCase()}. ${h.claims?.[seat]||((g.round===h.round&&g.claims?.[seat])||'No public card claim yet.')}`});
    }
    for(const item of (g.publicInvestigations||[])){
      if(item.president===seat)history.push({round:item.round||0,order:3,text:`Investigated ${name(item.target)} and publicly declared them ${item.team.toUpperCase()}. (An announcement is not proof.)`});
      if(item.target===seat)history.push({round:item.round||0,order:3,text:`Investigated by ${name(item.president)}, who publicly declared ${item.team.toUpperCase()}.`});
    }
    for(const item of (g.executions||[])){
      if(item.president===seat)history.push({round:item.round||0,order:4,text:`Executed ${name(item.target)}.`});
      if(item.target===seat)history.push({round:item.round||0,order:4,text:`Executed by ${name(item.president)}.`});
    }
    for(const m of (g.chat||[]).filter(m=>m.seat===seat&&!m.kind))
      history.push({round:0,order:5,text:`Said in chat: “${m.text}”`});
    $('online-dossier-title').textContent=`${p.name} · Council Dossier`;
    const role=visibleRole(seat);
    const unusualVotes=(g.votingHistory||[]).filter(v=>v.votes?.[seat]===false&&v.passed)
      .map(v=>({round:v.round,order:1,text:`Voted NO on the ${name(v.president)} / ${name(v.nominee)} government that the majority approved. This alone does not indicate a faction.`}));
    const notable=history.filter(h=>/contradict|disput|execut|investigat|enacted|Nominated/.test(h.text))
      .concat(unusualVotes).sort((a,b)=>b.round-a.round||b.order-a.order).slice(0,7);
    $('online-dossier-content').innerHTML=`<div class="dossier-summary">
      <span>${p.bot?'🤖 BOT':'👤 HUMAN'}</span><span>${p.dead?'EXECUTED':'ALIVE'}</span>
      <span>${role?esc(roleName(role)):'ROLE UNKNOWN'}</span>
      ${cleared(seat)?'<span class="dossier-cleared">✓ CONFIRMED NOT STALIN</span>':''}
    </div><div class="dossier-stat-grid"><div><strong>${yesCount} / ${noCount}</strong><small>YES / NO</small></div><div><strong>${governments}</strong><small>PREMIER WINS</small></div><div><strong>${disputes}</strong><small>CLAIM DISPUTES</small></div></div>
    <div class="dossier-private-note"><strong>Your private assessment:</strong> ${trusted.has(seat)?'✓ Trust':suspected.has(seat)?'⚠ Suspect':'Neutral'} <small>Private markers are not sent to bots.</small></div>
    ${seat!==g.seat&&!p.dead&&g.phase!=='gameover'?`<div class="dossier-public-actions"><button type="button" data-endorse="trust" data-endorse-seat="${seat}">📣 PUBLICLY TRUST</button><button type="button" data-endorse="suspect" data-endorse-seat="${seat}">📣 PUBLICLY SUSPECT</button></div><small class="dossier-explain">Public statements enter conversation and can influence bots. You can publicly bluff.</small>`:''}
    <h4>Notable Events</h4><div class="dossier-history notable">${notable.length?notable.map(h=>`<p><strong>R${h.round}:</strong> ${esc(h.text)}</p>`).join(''):'<p>No major public events yet.</p>'}</div>
    <h4>Full Public Record</h4><div class="dossier-history">${history.length?
      history.sort((a,b)=>b.round-a.round||b.order-a.order)
        .map(h=>`<p><strong>${h.round?`Round ${h.round}`:'Public statement'}:</strong> ${esc(h.text)}</p>`).join(''):
      '<p>No recorded public actions yet.</p>'}</div>`;
  }
  function showDispute(g){
    const holder=$('online-dispute'),last=g.policyHistory.at(-1);
    const pres=last?.claims?.[last.president]?.match(/passed (\d+) White/i);
    const chanc=last?.claims?.[last.chancellor]?.match(/Received (\d+) White/i);
    const dispute=pres&&chanc&&Number(pres[1])!==Number(chanc[1]);
    const recent=last&&(g.round===last.round||g.round===last.round+1);
    if(!dispute||!recent){holder.textContent='';holder.className='online-dispute';return;}
    const key=`${last.round}:${last.president}:${last.chancellor}`;
    holder.textContent=`⚠ POLICY DISPUTE — ${name(last.president)} and ${name(last.chancellor)} disagree about the cards!`;
    if(lastDisputeKey!==key){lastDisputeKey=key;holder.className='online-dispute active shake';}
    else holder.className='online-dispute active';
  }
  function showPolicyReport(g){
    const panel=$('online-policy-report'),policy=g.policyHistory?.at(-1);
    if(!policy){panel.hidden=true;return;}
    const key=`${policy.round}:${g.policyHistory.length}`;
    if(policyReportKey!==key){policyReportKey=key;dismissedPolicyKey='';policyReportCompleteKey='';}
    if(dismissedPolicyKey===key){panel.hidden=true;return;}
    const secretary=policy.president, premier=policy.chancellor;
    const claims=policy.claims||g.claims||{};
    const secClaim=claims[secretary],premClaim=claims[premier];
    // Don't interrupt the mandatory debrief. Display the full-screen report
    // once both government members have made their public claims (or gameover).
    const finished=policy.chaos||g.phase==='gameover'||(Boolean(secClaim)&&Boolean(premClaim));
    if(!finished){panel.hidden=true;return;}
    policyReportCompleteKey=key;
    const secLine=secClaim?`${esc(name(secretary))} (Secretary) claims: ${esc(secClaim)}`:
      `${esc(name(secretary))} (Secretary): report pending`;
    const premLine=premClaim?`${esc(name(premier))} (Premier) claims: ${esc(premClaim)}`:
      `${esc(name(premier))} (Premier): report pending`;
    // Detailed claims live in the council record; never cover the next
    // decision with an intermission that requires dismissal.
    panel.hidden=true;
    panel.className=`online-policy-report ${policy.policy==='communist'?'red':'white'}`;
    panel.innerHTML=`<div class="policy-report-dialog" role="dialog" aria-modal="true" aria-label="Policy result">
      <button type="button" class="policy-report-close" aria-label="Dismiss policy report">×</button>
      <strong>${policy.policy==='white'?'★ WHITE':'☭ COMMUNIST'} POLICY ENACTED</strong>
      <span class="report-round">Round ${policy.round}${policy.chaos?' · chaos draw':''}</span>
      ${policy.chaos?'<p>No Secretary or Premier chose this policy. It was drawn by chaos.</p>':
      `<p>${secLine}</p><p>${premLine}</p>
      <small>${secClaim&&premClaim?'These are the players’ public claims, not verified private cards.':
        g.phase==='gameover'?'The game ended before both players could report their cards.':
        'Claims appear here when each player reports their cards.'}</small>`}
      <button type="button" class="policy-report-continue">CONTINUE TO THE COUNCIL →</button>
      <span class="policy-report-hint">Or click outside this report to close it.</span></div>`;
  }
  function render(){
    if(!current)return;
    const g=current;
    if(markedRound===null)markedRound=g.round;
    else if(markedRound!==g.round){
      // Trust/Sus are personal notes for the current round only. The dossier
      // retains public history; these temporary highlights do not accumulate.
      trusted.clear();suspected.clear();markedRound=g.round;
    }
    $('online-room').hidden=true;$('online-entry').hidden=true;$('online-match').hidden=false;
    $('online-phase').textContent=({nomination:'Nomination',voting:'Council Election',legislative_president:'Secretary Legislation',
      legislative_chancellor:'Premier Legislation',veto_response:'Veto Response',debrief:'Policy Debrief',
      executive_power:'Executive Power',gameover:'Game Over'})[g.phase]||g.phase;
    $('online-identity').textContent=roleName(g.role);
    $('online-identity').className='identity-tag '+g.role;
    $('online-white').textContent=`${g.whitePolicies} / 5`;
    $('online-communist').textContent=`${g.communistPolicies} / 6`;
    $('online-reported-whites').textContent=`White reported seen: ${g.reportedWhiteSeen??0}/6`;
    if(previousPolicyCounts&& (g.whitePolicies>previousPolicyCounts.white||g.communistPolicies>previousPolicyCounts.communist)){
      policyHighlight={kind:g.whitePolicies>previousPolicyCounts.white?'white':'communist',until:Date.now()+3000};
    }
    previousPolicyCounts={white:g.whitePolicies,communist:g.communistPolicies};
    const flashWhite=policyHighlight?.kind==='white'&&Date.now()<policyHighlight.until;
    const flashRed=policyHighlight?.kind==='communist'&&Date.now()<policyHighlight.until;
    const celebration=$('online-policy-celebration');
    celebration.hidden=!(flashWhite||flashRed);
    celebration.className=`online-policy-celebration ${flashWhite?'white':'communist'}`;
    celebration.textContent=flashWhite?'★ WHITE POLICY ENACTED':flashRed?'☭ COMMUNIST POLICY ENACTED':'';
    $('online-white-slots').innerHTML=Array.from({length:5},(_,i)=>`<div class="track-slot ${i<g.whitePolicies?'filled-white':''} ${flashWhite&&i===g.whitePolicies-1?'new-policy':''}">${i<g.whitePolicies?'★':''}</div>`).join('');
    const powers=g.players.length<=6?['','','PEEK','EXECUTION','EXECUTION','VICTORY']:
      g.players.length<=8?['','INVESTIGATE','SPECIAL','EXECUTION','EXECUTION','VICTORY']:
      ['INVESTIGATE','INVESTIGATE','SPECIAL','EXECUTION','EXECUTION','VICTORY'];
    $('online-communist-slots').innerHTML=Array.from({length:6},(_,i)=>`<div class="track-slot ${i<g.communistPolicies?'filled-communist':''} ${flashRed&&i===g.communistPolicies-1?'new-policy':''} ${i>=g.communistPolicies&&i<5&&powers[i]?'has-power':''}">${i<g.communistPolicies?'☭':''}<span class="power-tag">${i<5?powers[i]:''}</span></div>`).join('');
    $('online-tracker').innerHTML=Array.from({length:3},(_,i)=>`<span class="tracker-dot ${i<g.electionTracker?'active':''}"></span>`).join('');
    $('online-round-badge').textContent=`ROUND ${g.round}`;
    renderTimeline(g);
    renderRoundGuide(g);
    renderGovernment(g);
    renderElectionStatus(g);
    const noteworthy=seat=>{
      const dispute=(g.policyHistory||[]).slice(-4).reverse().find(h=>{
        if(h.chaos||(h.president!==seat&&h.chancellor!==seat))return false;
        const a=h.claims?.[h.president]?.match(/passed (\d+) White/i);
        const b=h.claims?.[h.chancellor]?.match(/Received (\d+) White/i);
        return a&&b&&a[1]!==b[1];
      });
      if(dispute)return '⚡ CLAIM DISPUTE';
      if((g.executions||[]).some(e=>e.president===seat))return '🎯 ORDERED EXECUTION';
      if((g.publicInvestigations||[]).some(e=>e.president===seat))return '🔎 INVESTIGATED';
      return '';
    };
    const seatHtml=p=>{
      const gov=p.seat===g.president?'SECRETARY':(p.seat===(g.nominee??g.chancellor)?'PREMIER':'');
      const known=visibleRole(p.seat);
      return `<div class="player-card online-player ${p.dead?'dead':''} ${p.seat===g.seat?'self':''} ${p.seat===g.president?'president':''} ${p.seat===(g.nominee??g.chancellor)?'chancellor':''} ${g.myTurn&&p.seat===g.seat?'acting':''} ${trusted.has(p.seat)?'is-trusted':''} ${suspected.has(p.seat)?'is-suspect':''} ${known?'known-'+known:''}">
        ${gov?`<div class="player-gov-badge">${gov}</div>`:''}
        <div class="online-avatar">${p.bot?'🤖':'👤'}</div>
        <div class="online-name">${esc(p.name)}${p.seat===g.seat?' (YOU)':''}</div>
        <div class="online-role">${p.dead?'EXECUTED':roleName(known)||'UNKNOWN'}</div>
        ${noteworthy(p.seat)?`<div class="online-noteworthy" title="Recorded public event, not proof of allegiance">${noteworthy(p.seat)}</div>`:''}
        ${cleared(p.seat)?'<div class="online-cleared" title="Elected Premier after three Communist policies without ending the game">✓ NOT STALIN</div>':''}
        <div class="online-seat-vote" data-vote-seat="${p.seat}">${seatVote(g,p.seat)}</div>
        <div class="online-seat-controls"><button type="button" class="online-dossier-open" data-dossier-seat="${p.seat}">📋 DOSSIER</button>
        ${p.seat!==g.seat&&!p.dead&&g.phase!=='gameover'?`<div class="player-card-actions">
          <button class="trust-btn ${trusted.has(p.seat)?'active':''}" data-mark="trust" data-seat="${p.seat}" title="Private marker; only you can see it" aria-label="Privately mark ${esc(p.name)} trusted">✓ TRUST</button>
          <button class="sus-btn ${suspected.has(p.seat)?'active':''}" data-mark="suspect" data-seat="${p.seat}" title="Private marker; only you can see it" aria-label="Privately mark ${esc(p.name)} suspect">? SUS</button>
        </div>`:''}</div>
      </div>`;
    };
    $('online-trusted-count').textContent=`Trusted: ${trusted.size}`;
    $('online-suspect-count').textContent=`Suspects: ${suspected.size}`;
    const rowSize=Math.ceil(g.players.length/2);
    $('online-players').innerHTML=[g.players.slice(0,rowSize),g.players.slice(rowSize)]
      .filter(row=>row.length)
      .map(row=>`<div class="players-row" style="--cols:${row.length}">${row.map(seatHtml).join('')}</div>`).join('');
    showVotes(g);renderElectionStatus(g);showDispute(g);showPolicyReport(g);showInvestigation(g);
    decisions();clock();renderChat();
    $('online-chat-input').disabled=g.phase==='gameover'||g.players[g.seat].dead;
    $('online-new-match').hidden=g.phase!=='gameover';
    if(g.phase==='gameover'&&!gameOverNotified){
      gameOverNotified=true;
      options.onGameOver?.();
    }
    if(dossierSeat!==null)renderDossier(dossierSeat);
  }
  async function start(){
    if(active)return;
    active=true;
    try{await sync();}catch(e){active=false;throw e;}
    if(!current){active=false;throw new Error('Match service is not deployed yet');}
    pollId=setInterval(sync,1800);tickId=setInterval(clock,250);
  }
  $('online-actions').addEventListener('click',e=>{
    const btn=e.target.closest('button[data-type]');if(!btn)return;
    const type=btn.dataset.type,target=Number(btn.dataset.target);
    const action={nominate:{type:'nominate',target},vote_yes:{type:'vote',yes:true},
      vote_no:{type:'vote',yes:false},discard:{type:'discard',index:target},
      enact:{type:'enact',index:target},propose_veto:{type:'propose_veto'},
      veto_yes:{type:'veto',approve:true},veto_no:{type:'veto',approve:false},
      claim_option:claimActions[target],ack_peek:{type:'ack_peek'},
      announce_white:{type:'announce_investigation',team:'white'},
      announce_communist:{type:'announce_investigation',team:'communist'},
      investigate:{type:'investigate',target},special_election:{type:'special_election',target},
      execute:{type:'execute',target}}[type];
    if(action){
      btn.classList.add('chosen');
      submit(action,btn.textContent.trim().replace(/\s+/g,' '));
    }
  });
  $('online-players').addEventListener('click',e=>{
    const dossier=e.target.closest('button[data-dossier-seat]');
    if(dossier){
      dossierSeat=Number(dossier.dataset.dossierSeat);
      $('online-dossier').hidden=false;
      renderDossier(dossierSeat);
      return;
    }
    const btn=e.target.closest('button[data-mark][data-seat]');if(!btn||!current)return;
    const seat=Number(btn.dataset.seat);
    if(!Number.isInteger(seat)||seat===current.seat||current.players[seat]?.dead)return;
    const own=btn.dataset.mark==='trust'?trusted:suspected;
    const other=own===trusted?suspected:trusted;
    if(own.has(seat))own.delete(seat);else{own.add(seat);other.delete(seat);}
    render();
  });
  $('online-dossier-close').addEventListener('click',()=>{
    dossierSeat=null;$('online-dossier').hidden=true;
  });
  $('online-dossier').addEventListener('click',e=>{
    if(e.target===$('online-dossier')){dossierSeat=null;$('online-dossier').hidden=true;}
  });
  $('online-dossier-content').addEventListener('click',e=>{
    const btn=e.target.closest('button[data-endorse-seat]');
    if(!btn||!current||!active)return;
    const seat=Number(btn.dataset.endorseSeat);
    if(seat===current.seat||current.players[seat]?.dead)return;
    const opinion=btn.dataset.endorse==='trust'?'trust':'suspect';
    sendChat(`I ${opinion} ${name(seat)}`);
    $('online-dossier').hidden=true;dossierSeat=null;
    logView='conversation';
    for(const tab of document.querySelectorAll?.('[data-log-view]')||[])
      tab.classList.toggle('active',tab.dataset.logView===logView);
    renderChat();
  });
  for(const tab of document.querySelectorAll?.('[data-log-view]')||[])
    tab.addEventListener('click',()=>{
      logView=tab.dataset.logView;
      for(const button of document.querySelectorAll('[data-log-view]'))
        button.classList.toggle('active',button.dataset.logView===logView);
      renderChat();
    });
  $('online-chat-form').addEventListener('submit',e=>{
    e.preventDefault();const input=$('online-chat-input'),text=input.value.trim();
    if(text&&active){input.value='';sendChat(text);}
  });
  $('online-chat-messages').addEventListener('click',e=>{
    const btn=e.target.closest('button[data-chat-retry]');if(!btn)return;
    const item=outbox.find(m=>m.id===Number(btn.dataset.chatRetry));
    if(item&&item.failed)sendChat(item);
  });
  $('online-policy-report').addEventListener('click',e=>{
    if(e.target!==$('online-policy-report')&&
       !e.target.closest('.policy-report-close, .policy-report-continue'))return;
    dismissedPolicyKey=policyReportKey;$('online-policy-report').hidden=true;
  });
  return {start,isActive:()=>active,stop:()=>{
    active=false;if(pollId)clearInterval(pollId);if(tickId)clearInterval(tickId);
    for(const timer of animationTimers)clearTimeout(timer);animationTimers.clear();
    pollId=tickId=null;current=null;pendingDecision=null;outbox.length=0;
    previousPolicyCounts=null;policyHighlight=null;lastVotePauseActive=null;
    dossierSeat=null;gameOverNotified=false;lastVoteKey='';voteRevealedCount=0;
    voteShowing=false;voteResultReady=false;voteDismissedKey='';
    seenConversation.clear();conversationInitialized=false;unreadConversation=0;submitError=null;
    trusted.clear();suspected.clear();markedRound=null;
    localVote=null;lastInvestigationKey='';lastResultHighlight='';lastRoundHighlight=0;
    $('online-investigation-banner').hidden=true;
    $('online-dossier').hidden=true;
  }};
}
