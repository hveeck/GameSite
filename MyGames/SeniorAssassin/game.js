const $=id=>document.getElementById(id);
const tokenKey='senior-assassin-session';
let token=localStorage.getItem(tokenKey)||'',mode='register',view='dashboard',state=null,loading=false,inviteVerified=false,targetRevealed=false,unlockedData=null;
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>s?new Date(s).toLocaleString():'—';
const toast=s=>{$('toast').textContent=s;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',4400)};
async function api(action,body={}){
  const response=await fetch(window.SA_CONFIG.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,...body})});
  const result=await response.json();if(!response.ok||result.error)throw Error(result.error||'Request failed');return result;
}
async function refresh(){
  try {const currentToken=token;const next=await api('state');if(token!==currentToken)return;state=next;showApp();if(view!=='chat'||!$('chatForm'))render()}catch(e){if(String(e.message).includes('log in'))logout(false);else toast(e.message)}
}
function logout(remote=true){$('eliminationDialog')?.close();if(remote&&token)api('logout').catch(()=>{});token='';view='dashboard';$('content').replaceChildren();targetRevealed=false;unlockedData=null;localStorage.removeItem(tokenKey);state=null;$('appView').hidden=true;$('authView').hidden=false}
function setMode(m){mode=m;inviteVerified=false;for(const x of ['login','register'])$(x+'Tab').classList.toggle('active',x===m);$('inviteStep').hidden=m!=='register';$('accountStep').hidden=m==='register';$('authName').required=m==='login';$('authPassword').required=m==='login';$('authSubmit').textContent=m==='register'?'Create account →':'Log in →';$('authHint').textContent=m==='register'?'Choose a throwaway password you do not use on any other site.':'Use your full name and password.'}
['login','register'].forEach(m=>$(m+'Tab').onclick=()=>setMode(m));
$('verifyInvite').onclick=async()=>{try{await api('check_invite',{invite:$('authInvite').value});inviteVerified=true;$('inviteStep').hidden=true;$('accountStep').hidden=false;$('authName').required=true;$('authPassword').required=true;toast('Invitation accepted! Create your account.')}catch(e){toast(e.message)}};
$('authForm').onsubmit=async e=>{e.preventDefault();if(loading)return;if(mode==='register'&&!inviteVerified)return toast('Enter the invitation code first');loading=true;$('authSubmit').disabled=true;try{const data=await api(mode==='register'?'register':'login',{name:$('authName').value,password:$('authPassword').value,invite:$('authInvite').value});token=data.token;localStorage.setItem(tokenKey,token);$('authPassword').value='';await refresh()}catch(err){toast(err.message)}finally{loading=false;$('authSubmit').disabled=false}};
async function publicStatus(){try{const s=await api('status');const closed=s.phase!=='registration'||Date.now()>=new Date(s.starts_at).getTime();$('phaseBadge').textContent=closed?'GAME LIVE':s.phase.toUpperCase();$('startNotice').textContent=!closed?`${s.players} player${s.players===1?'':'s'} joined · Registration closes ${date(s.starts_at)}`:'Registration is closed. Log in to play.';if(closed){setMode('login');$('registerTab').hidden=true}}catch(e){/* backend may not be connected yet */}}
$('logout').onclick=()=>logout();
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;targetRevealed=false;render();window.scrollTo({top:0,behavior:'smooth'})});
function showApp(){$('authView').hidden=true;$('appView').hidden=false}
function render(){
  if(!state)return;
  $('phaseBadge').textContent=state.phase.toUpperCase();$('welcome').textContent=state.me?'Welcome, '+state.me.name.split(' ')[0]:'Command center';
  const alive=state.players.filter(p=>p.alive).length;$('aliveCount').textContent=alive;$('outCount').textContent=state.players.length-alive;$('killCount').textContent=state.me?.kills??'—';
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const renderers={dashboard,feed,players:leaderboard,chat,rules};$('content').innerHTML=(renderers[view]||dashboard)();bind();if(view==='chat')bindChat();
}
function chat(){
  return `<section class="card chat-card"><h2>Game chat</h2><div id="chatLog" class="chat-log" tabindex="0" role="log" aria-label="Game messages"></div><p id="chatStatus" class="small muted" role="status">Loading messages…</p><form id="chatForm"><label for="chatInput">Message</label><textarea id="chatInput" maxlength="500" rows="2" required placeholder="Write a message"></textarea><button class="primary" type="submit">Send</button></form></section>`;
}
let chatRequest=0;
async function loadChat(){
  const log=$('chatLog'), currentToken=token;
  if(!log||!currentToken||view!=='chat')return;
  const request=++chatRequest;
  try {
    const {messages}=await api('chat_list');
    if(request!==chatRequest||$('chatLog')!==log||token!==currentToken)return;
    const ids=messages.map(message=>message.id).join(',');
    if(log.dataset.messages!==ids){
      const atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<30;
      log.innerHTML=messages.map(message=>`<article class="chat-message"><div class="row"><strong>${escapeHtml(message.author_name)}</strong><time class="small muted">${escapeHtml(date(message.created_at))}</time></div><p>${escapeHtml(message.body)}</p>${state.is_admin?`<button class="ghost compact" data-chat-delete="${escapeHtml(message.id)}" type="button">Delete</button>`:''}</article>`).join('')||'<p class="muted">No messages yet.</p>';
      log.dataset.messages=ids;
      if(atBottom)log.scrollTop=log.scrollHeight;
    }
    if(!$('chatStatus').dataset.actionError)$('chatStatus').textContent='';
  }catch(error){
    if(request===chatRequest&&$('chatLog')===log&&token===currentToken)$('chatStatus').textContent=error.message;
  }
}
function bindChat(){
  const form=$('chatForm'), input=$('chatInput'), status=$('chatStatus'), log=$('chatLog');
  form.onsubmit=async event=>{
    event.preventDefault();
    const button=form.querySelector('button'), message=input.value.trim();
    if(!message||button.disabled)return;
    button.disabled=true;
    delete status.dataset.actionError;
    try {
      await api('chat_send',{message});
      if(input.value.trim()===message)input.value='';
      await loadChat();
    }catch(error){status.dataset.actionError='true';status.textContent=error.message}
    finally{button.disabled=false}
  };
  log.onclick=async event=>{
    const button=event.target.closest('[data-chat-delete]');
    if(!button||button.disabled||!confirm('Delete this message?'))return;
    button.disabled=true;
    delete status.dataset.actionError;
    try{await api('chat_delete',{id:button.dataset.chatDelete});await loadChat()}
    catch(error){status.dataset.actionError='true';status.textContent=error.message}
    finally{button.disabled=false}
  };
  loadChat();
}
setInterval(()=>{if(view==='chat'&&!document.hidden)loadChat()},4000);
function announcements(){
  const items=state.announcements||[];
  return `<section class="card announcements"><div class="row"><h2>📣 ANNOUNCEMENTS</h2><span class="pill">${items.length} updates</span></div>${items.length?items.map(a=>`<article class="announcement"><div class="row"><strong>${escapeHtml(a.title)}</strong>${a.pinned?'<span class="status">PINNED</span>':''}</div><p class="small muted">${date(a.created_at)}</p><p class="announcement-body">${escapeHtml(a.body)}</p></article>`).join(''):'<p class="muted">No announcements yet.</p>'}</section>`;
}
function admin(){
  const players=unlockedData?.admin_players||[];
  return `<div class="grid"><div><section class="card"><span class="eyebrow">ORGANIZER</span><h2>Post an update</h2><p class="muted">Players will see announcements on Home. Use this for rule changes, safety notices and game news.</p><label>Headline<input id="announceTitle" maxlength="110" placeholder="Important game update"></label><label>Announcement<textarea id="announceText" rows="5" maxlength="3000" placeholder="Write your message..."></textarea></label><label class="checkrow"><input type="checkbox" id="announcePin"> Pin to top</label><button class="primary wide" data-action="announce_publish">Publish announcement</button></section>${announcements()}<section class="card"><h2>Manage announcements</h2>${(state.announcements||[]).map(a=>`<div class="item"><strong>${escapeHtml(a.title)}</strong><div class="actions"><button class="secondary compact" data-ann-edit="${a.id}">Edit</button><button class="danger compact" data-ann-delete="${a.id}">Delete</button></div></div>`).join('')||'<p class="muted">No announcements yet.</p>'}</section></div><div><section class="card"><h2>Organizer controls</h2><p class="muted">Your private organizer account. Targets, passwords and full game data stay locked until you unlock them below.</p><label>Invitation code<input id="inviteCode" placeholder="At least 6 characters"></label><button class="secondary" data-action="invite" ${state.phase!=='registration'?'disabled':''}>Save invitation code</button><div class="actions"><button class="secondary" data-action="start" ${state.phase!=='registration'?'disabled':''}>Start game (after deadline)</button><button class="secondary" data-action="${state.phase==='paused'?'resume':'pause'}" ${!['live','paused'].includes(state.phase)?'disabled':''}>${state.phase==='paused'?'Resume':'Pause'}</button><button class="danger" data-action="finish" ${state.phase==='finished'?'disabled':''}>End game</button></div></section><section class="card"><h2>Pending elimination claims</h2>${(state.pending||[]).length?state.pending.map(e=>`<div class="item"><strong>${escapeHtml(e.assassin)} → ${escapeHtml(e.victim)}</strong><p>${escapeHtml(e.caption)} · ${escapeHtml(e.status)}</p>${e.photo_url?`<img class="evidence-photo" src="${escapeHtml(e.photo_url)}" alt="Evidence">`:''}<div class="actions"><button class="primary" data-resolve="${e.id}" data-approve="true">Approve</button><button class="danger" data-resolve="${e.id}" data-approve="false">Reject</button></div></div>`).join(''):'<p class="muted">No pending claims.</p>'}</section><section class="card"><h2>🔒 Full game data</h2>${!unlockedData?'<p class="muted">Reveal assignments, who is hunting whom, all player passwords, and game history.</p><button class="primary wide" data-action="unlock_data">Unlock Game Data</button>':`<div class="actions"><button class="secondary" data-action="lock_data">Lock Game Data</button><button class="secondary" data-action="export">Download password list .txt</button></div><p class="small muted">Sensitive information: keep it private. Don't upload it to GitHub.</p>${players.map(p=>`<div class="item"><strong>${escapeHtml(p.name)}</strong><p class="small">${p.alive?'ALIVE':'OUT'} · Kills: ${p.kills}</p><p>Target: <b>${escapeHtml(p.target||'—')}</b><br>Hunted by: <b>${escapeHtml(p.hunter||'—')}</b><br>Password: <code>${escapeHtml(p.password||'—')}</code></p><div class="actions"><button class="ghost" data-reset="${p.id}">Reset password</button><button class="danger" data-eliminate="${p.id}" ${!p.alive?'disabled':''}>Remove</button></div></div>`).join('')}<h3>Full activity history</h3>${(unlockedData.all_events||[]).map(e=>`<p class="small">${date(e.created_at)} · ${escapeHtml(e.description)}</p>`).join('')||'<p class="muted">No events yet.</p>'}`}</section></div></div>`;
}
function dashboard(){const me=state.me,alive=state.players.filter(p=>p.alive).length;
  if(!me)return admin();
  const live=state.phase==='live';
  const assignment=state.phase==='registration'
    ? `<div class="target-lock">◷</div><h2>THE HUNT BEGINS SUNDAY</h2><p class="muted">November 15 at 12:00 PM Eastern. Your secret assignment will appear here.</p>`
    : !me.alive?`<div class="target-lock red">✕</div><h2 class="red">YOU'VE BEEN ELIMINATED</h2><p class="muted">You can still follow the competition and view the elimination feed.</p>`
    : state.phase==='finished'?`<div class="target-lock gold">★</div><h2>THE HUNT IS OVER</h2><p>Winner: <b class="gold">${escapeHtml(state.winner)}</b></p>`
    : targetRevealed?`<div class="target-lock gold">◎</div><div class="target">${escapeHtml(me.target||'No target')}</div><p class="muted">Your current target. Keep this confidential.</p><button class="secondary wide" data-action="hide_target">◉ Hide target</button>`
    : `<div class="target-lock">♧</div><h2>TARGET CONCEALED</h2><p class="muted">Make sure nobody is looking at your screen.</p><button class="primary wide" data-action="reveal_target">◉ Reveal my target</button>`;
  return `<div class="grid"><div><section class="card assignment-card"><span class="eyebrow">YOUR SECRET ASSIGNMENT</span><div class="assignment-center">${assignment}</div></section>
    ${live&&me.alive?`<button class="primary wide action-main" data-action="claim">▣ &nbsp; Submit an elimination</button>`:''}</div>
    <div><section class="card"><span class="eyebrow">HUNT STATUS</span><h2>${alive} PLAYERS REMAIN</h2><p class="muted">${state.players.length-alive} eliminated of ${state.players.length} total players.</p>${state.winner?`<div class="notice">Last survivor: ${escapeHtml(state.winner)}</div>`:''}</section><section class="card"><div class="row"><h2>RECENT ACTIVITY</h2><button class="ghost compact" data-goto="feed">See all</button></div>${state.events.slice(0,5).map(e=>`<div class="item"><strong>${escapeHtml(e.description)}</strong><p class="small">${date(e.created_at)}</p></div>`).join('')||'<div class="empty">The hunt is quiet... for now.</div>'}</section>${announcements()}</div></div>`;
}
function feed(){const events=state.eliminations;return `<section class="card feed-card"><div class="row"><div><span class="eyebrow">THE HUNT ARCHIVE</span><h2>GAME HISTORY</h2></div><span class="pill">${events.filter(e=>e.status==='confirmed').length} confirmed</span></div><p class="muted">Confirmed eliminations appear here. Reports awaiting review are visible to the players involved and the Game Master.</p>${events.length?events.map(e=>`<article class="kill-post"><div class="kill-post-head"><div class="kill-icon">✕</div><div><strong>${escapeHtml(e.assassin)} <span class="red">${e.status==='voided'?'reported an elimination of':'eliminated'}</span> ${escapeHtml(e.victim)}</strong><p class="small muted">${date(e.submitted_at)}</p></div><span class="status ${e.status==='confirmed'?'':'pending'}">${escapeHtml(e.status.toUpperCase())}</span></div>${e.photo_url?`<img class="evidence-photo" src="${escapeHtml(e.photo_url)}" alt="Clothespin elimination evidence" loading="lazy">`:`<div class="photo-placeholder">▧<span>No photo submitted</span></div>`}${e.caption?`<p class="kill-caption">“${escapeHtml(e.caption)}”</p>`:''}${e.can_void?`<div class="actions"><button class="danger" data-void="${e.id}">Void elimination</button></div>`:state.me?.id===e.victim_id&&['pending','disputed'].includes(e.status)?`<div class="actions"><button class="primary" data-resolve="${e.id}" data-approve="true">Confirm elimination</button><button class="danger" data-resolve="${e.id}" data-approve="false">Dispute</button></div>`:''}</article>`).join(''):'<div class="empty">No eliminations yet. The first photo will appear here after confirmation.</div>'}</section>`}
function leaderboard(){const sorted=[...state.players].sort((a,b)=>Number(b.alive)-Number(a.alive)||b.kills-a.kills||a.name.localeCompare(b.name));return `<section class="card roster-card"><div class="row"><div><span class="eyebrow">THE COMPETITION</span><h2>ALL PLAYERS</h2></div><span class="pill">${sorted.length} registered</span></div><p class="muted">Everyone in the game, living or eliminated. Secret assignments stay private.</p>${sorted.map((p,i)=>`<div class="roster-row"><div class="roster-rank">${String(i+1).padStart(2,'0')}</div><div class="roster-person"><strong>${escapeHtml(p.name)}${p.id===state.me?.id?' <span class="gold">(you)</span>':''}</strong><span>${p.kills} elimination${p.kills===1?'':'s'}</span></div><span class="status ${p.alive?'':'dead'}">${p.alive?'ALIVE':'OUT'}</span></div>`).join('')}</section>`}
function rules(){return `<section class="card"><span class="eyebrow">OFFICIAL RULES</span><h2>Rules of the hunt</h2>${[
  ['The mission','Each player receives exactly one secret target. Never share someone else’s assignment.'],
  ['The elimination','Secretly attach a normal clothespin to your target’s outer clothing, bag, or hair.'],
  ['Caught in the act','If your target notices you trying to attach the clothespin before it is attached, the attempt fails immediately. No chasing, grabbing, blocking, tackling, or physical restraint.'],
  ['Proof and confirmation','Use Submit an elimination to send a short description and an optional photo. Check History for the result.'],
  ['Inheritance','After a confirmed elimination, you automatically inherit the eliminated player’s target.'],
  ['Shrine, CATS and prayer','No clipping in the Shrine, on the Shrine lawn, on the Shrine patio, anywhere in CATS, or during any organized prayer time, or during organized CCM events. These are completely off limits.'],
  ['No creepy behavior','Do not go to someone of another gender’s house or living space to hunt them. No stalking, following someone home, waiting outside bedrooms, entering residences uninvited, or any other invasive behavior.'],
  ['Consent and common sense','Everyone can decline an interaction or stop an attempt. Respect campus policies and bystanders. Do not pursue anyone who asks you to stop. No force, harassment, or dangerous chases.'],
  ['Victory','The last living player wins. Most eliminations earns a separate title.']].map(([h,p])=>`<div class="rule"><b>${h}</b><p>${p}</p></div>`).join('')}</section>`}

function bind(){
  document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{view=b.dataset.goto;render()});
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>doAction(b.dataset.action));
  document.querySelectorAll('[data-void]').forEach(b=>b.onclick=async()=>{
    if(b.disabled||!confirm('Void this elimination and restore the assignments?'))return;
    b.disabled=true;
    try{await perform('void_elimination',{id:b.dataset.void},'Elimination voided')}
    finally{b.disabled=false}
  });
  document.querySelectorAll('[data-resolve]').forEach(b=>b.onclick=()=>perform('resolve',{id:b.dataset.resolve,approve:b.dataset.approve==='true'},'Claim updated'));
  document.querySelectorAll('[data-ann-edit]').forEach(b=>b.onclick=()=>{const a=state.announcements.find(x=>x.id===b.dataset.annEdit);if(!a)return;const title=prompt('Announcement headline',a.title);if(title===null)return;const text=prompt('Announcement message',a.body);if(text===null)return;const pinned=confirm('Pin this announcement to the top?');perform('announce_update',{id:a.id,title,text,pinned},'Announcement updated')});
  document.querySelectorAll('[data-ann-delete]').forEach(b=>b.onclick=()=>{if(confirm('Delete this announcement?'))perform('announce_delete',{id:b.dataset.annDelete},'Announcement deleted')});
  document.querySelectorAll('[data-reset]').forEach(b=>b.onclick=async()=>{const pass=prompt('New temporary password (at least 8 characters):');if(pass)await perform('reset_password',{player_id:b.dataset.reset,password:pass},'Password reset')});
  document.querySelectorAll('[data-eliminate]').forEach(b=>b.onclick=()=>{if(confirm('Remove this player from the game?'))perform('admin_eliminate',{player_id:b.dataset.eliminate},'Player removed')});
}
async function perform(action,payload,message){try{const out=await api(action,payload);if(['reset_password','admin_eliminate','void_elimination'].includes(action))unlockedData=null;toast(out.message||message||'Done');await refresh()}catch(e){toast(e.message)}}
function openEliminationForm(){
  if($('eliminationDialog'))return;
  const {target,target_id}=state.me;
  if(!target)return toast('Reload to check your current target.');
  const sessionToken=token;
  const dialog=document.createElement('dialog');
  dialog.id='eliminationDialog';
  dialog.className='elimination-dialog card';
  dialog.setAttribute('aria-labelledby','eliminationTitle');
  dialog.innerHTML=`<form><h2 id="eliminationTitle">Submit elimination</h2><p>Target: <b>${escapeHtml(target)}</b></p><p class="muted">${target_id?'This elimination counts immediately.':'Your report will appear in History for review.'}</p><label>Description <span class="muted">(optional)</span><textarea name="caption" maxlength="400" rows="3"></textarea></label><label>Photo <span class="muted">(optional, JPG, PNG or WebP up to 5 MB)</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><button class="ghost compact" type="button" data-clear-photo hidden>Remove photo</button><p class="elimination-status" role="status" aria-live="polite"></p><div class="actions"><button class="secondary" type="button" data-cancel>Cancel</button><button class="primary" type="submit">Submit elimination</button></div></form>`;
  const form=dialog.querySelector('form');
  const submit=form.querySelector('[type="submit"]');
  const cancel=form.querySelector('[data-cancel]');
  const clearPhoto=form.querySelector('[data-clear-photo]');
  const status=form.querySelector('[role="status"]');
  const photoInput=form.elements.namedItem('photo');
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.addEventListener('cancel',event=>{if(submit.disabled)event.preventDefault()});
  cancel.onclick=()=>dialog.close();
  photoInput.onchange=()=>{status.textContent='';clearPhoto.hidden=!photoInput.files.length};
  clearPhoto.onclick=()=>{photoInput.value='';photoInput.onchange()};
  form.onsubmit=async event=>{
    event.preventDefault();
    if(submit.disabled||token!==sessionToken)return;
    const photo=photoInput.files[0];
    if(photo&&photo.size>5*1024*1024){status.textContent='Photo exceeds 5 MB. Choose a smaller photo or clear the attachment.';return}
    if(photo&&!['image/jpeg','image/png','image/webp'].includes(photo.type)){
      status.textContent='Choose a JPG, PNG, or WebP photo, or clear the attachment.';
      return;
    }
    const caption=form.elements.namedItem('caption').value;
    submit.disabled=cancel.disabled=true;
    status.textContent='Submitting…';
    try{
      const encoded=photo?await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result);
        reader.onerror=reader.onabort=()=>reject(new Error('Could not read the photo. Choose another file or clear the attachment.'));
        reader.readAsDataURL(photo);
      }):null;
      if(token!==sessionToken)return;
      const result=await api('submit',{target_id,caption,photo:encoded});
      if(token!==sessionToken)return;
      dialog.close();
      targetRevealed=false;
      view='feed';
      toast(result.message||'Elimination submitted.');
      await refresh();
    }catch(error){
      status.textContent=error.message==='Failed to fetch'
        ?'Connection interrupted. Check History before trying again.'
        :error.message;
    }finally{submit.disabled=cancel.disabled=false}
  };
  document.body.append(dialog);
  dialog.showModal();
}
async function doAction(action){
  if(action==='announce_publish')return perform('announce_create',{title:$('announceTitle').value,text:$('announceText').value,pinned:$('announcePin').checked},'Announcement published');
  if(action==='unlock_data'){const password=prompt('Organizer password to unlock full game data:');if(!password)return;try{unlockedData=await api('admin_data',{password});render();toast('Full game data unlocked')}catch(e){toast(e.message)}return}
  if(action==='lock_data'){unlockedData=null;render();return}
  if(action==='reveal_target'){targetRevealed=true;render();return}
  if(action==='hide_target'){targetRevealed=false;render();return}
  if(action==='claim')return openEliminationForm();
  if(action==='invite')return perform('set_invite',{invite:$('inviteCode').value},'Invite code saved');
  if(action==='export'){const lines=['SENIOR ASSASSIN — PRIVATE PASSWORD LIST','Do not share this file or upload it to GitHub.','',...(unlockedData?.admin_players||[]).map(p=>`${p.name} | ${p.password}`)];const blob=new Blob([lines.join('\n')],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='senior-assassin-private-passwords.txt';a.click();URL.revokeObjectURL(url);return}
  if(action==='start'&&!confirm('Start the game and secretly assign targets to every registered player?'))return;
  if(action==='finish'&&!confirm('End the game now?'))return;
  return perform(action,{},'Game updated');
}
if(token)refresh();else setMode('register');
publicStatus();
setInterval(()=>{if(token&&state)refresh()},30000);
