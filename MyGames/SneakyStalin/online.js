// Lobby and matchmaking; all live-game decisions stay on the Supabase server.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {createOnlineMatchController} from './online/online-match.js?v=2.4';

const SUPABASE_URL = 'https://joqypdrkojtinlflbvur.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_bomqkQiWeVOWiz7yYMhelA_v_n5YPBG';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});
let room = null;
let userId = null;
let refreshTimer = null;
let busy = false;
let onlineVisible = false;
let signInPromise = null;
const $ = id => document.getElementById(id);
const onlineMatch = createOnlineMatchController(supabase,()=>room,{
  onGameOver(){
    // Finished games remain viewable on screen, but should not auto-resume
    // and trap a returning player in their last completed council.
    sessionStorage.removeItem('ss_room_id');
  }
});

function setEntryReady(ready){
  for(const id of ['online-quick','online-create','online-join']) $(id).disabled = !ready;
}

function status(message, error=false){
  $('online-status').textContent = message;
  $('online-status').classList.toggle('online-error',error);
}
function showEntry(){
  $('online-entry').hidden = false;
  $('online-room').hidden = true;
  $('online-match').hidden = true;
}
function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function performSignIn(){
  const {data:{session},error:sessionError} = await supabase.auth.getSession();
  if(sessionError) throw sessionError;
  if(session && session.access_token){ userId = session.user.id; return; }
  const {data,error} = await supabase.auth.signInAnonymously();
  if(error) throw new Error(error.message+' (Enable Anonymous Sign-Ins in Supabase Authentication.)');
  if(!data.session?.access_token || !data.user?.id) throw new Error('Anonymous sign-in did not return a session.');
  userId = data.user.id;
}
async function signedIn(){
  if(!signInPromise){
    signInPromise = performSignIn().catch(e=>{signInPromise=null;throw e;});
  }
  await signInPromise;
  // Confirm the client actually has a valid user JWT before making an RPC.
  const {data,error} = await supabase.auth.getUser();
  if(error || !data.user?.id){
    signInPromise = null;
    throw new Error('Supabase authentication is not ready: '+(error?.message||'No active user'));
  }
  userId = data.user.id;
}
async function rpc(name,args){
  const {data,error} = await supabase.rpc(name,args);
  if(error) throw new Error(error.message);
  return data;
}
function persistRoom(){
  if(room) sessionStorage.setItem('ss_room_id',room.id);
  else sessionStorage.removeItem('ss_room_id');
}
function renderRoom(){
  if(!room)return;
  if(onlineMatch.isActive())return;
  $('online-entry').hidden=true;
  $('online-room').hidden=false;
  const ready=room.status==='ready';
  const humanCount=room.seats.filter(s=>!s.bot).length;
  const total=room.seats.length;
  const remaining=Math.max(0,Math.ceil((new Date(room.starts_at||Date.now()).getTime()-Date.now())/1000));
  $('online-room-title').textContent=room.kind==='private'?'Private Council · '+room.code:'Public Council · '+room.code;
  $('online-timer').textContent=ready
    ? `${humanCount} human${humanCount===1?'':'s'} · ${total-humanCount} bots · ${total} seats ready`
    : room.kind==='public'?`Matchmaking: ${remaining}s remaining · ${humanCount}/10 humans`
    : `${humanCount}/10 humans · Host can fill remaining seats with bots`;
  const seats=new Map(room.seats.map(s=>[s.seat,s]));
  $('online-seats').innerHTML=Array.from({length:10},(_,i)=>{
    const seat=seats.get(i);
    return `<div class="online-seat ${seat?.bot?'is-bot':''}"><span>${i+1}.</span> ${seat?escapeHTML(seat.name):'Waiting for player…'} ${seat?(seat.bot?'🤖':seat.mine?'(You)':'👤'):''}</div>`;
  }).join('');
  const owner=room.owner_id===userId;
  $('online-start').hidden=ready||!owner;
  $('online-start').disabled=!owner;
  $('online-start').textContent=`Fill to 10 With ${10-humanCount} Bot${10-humanCount===1?'':'s'}`;
  $('online-start-humans').hidden=ready||!owner||room.kind!=='private';
  $('online-start-humans').disabled=!owner||humanCount<5;
  $('online-start-humans').textContent=humanCount<5
    ? `Humans Only — Need ${5-humanCount} More`
    : `Start With ${humanCount} Human${humanCount===1?'':'s'} Only`;
  if(ready){
    status(`${total} seats assigned. Connecting to the game server...`);
    if(!onlineMatch.isActive()) onlineMatch.start().catch(e=>status('Game service unavailable: '+e.message,true));
  }else{
    status('Connected. Invite friends or wait for the matchmaking timer.');
  }
}
async function refresh(){
  if(!room || !onlineVisible) return;
  const next=await rpc('ss_room_snapshot',{p_room:room.id});
  if(next){room=next;renderRoom();}
  if(room.status==='waiting'&&room.kind==='public'&&room.starts_at&&Date.now()>=Date.parse(room.starts_at)){
    try {room=await rpc('ss_start_room',{p_room:room.id,p_fill_bots:true});renderRoom();}catch(e){ /* Another client may finish it. */ }
  }
}
function startPolling(){
  if(refreshTimer)clearInterval(refreshTimer);
  refreshTimer=setInterval(()=>refresh().catch(e=>status(e.message,true)),2000);
}
async function enterRoom(args){
  if(busy)return;
  busy=true;
  try{
    status('Checking your connection…');
    await signedIn();
    status('Finding a council…');
    const name=$('online-name').value.trim();
    if(!name||name.length>24)throw new Error('Enter a name up to 24 characters.');
    localStorage.setItem('ss_display_name',name);
    room=await rpc('ss_join_room',{p_name:name,...args});
    persistRoom();
    renderRoom();
    startPolling();
  }catch(e){status(e.message,true);}finally{busy=false;}
}
async function leaveRoom(){
  onlineMatch.stop();
  if(room){
    try{await rpc('ss_leave_room',{p_room:room.id});}catch(e){status(e.message,true);return;}
  }
  room=null;
  persistRoom();
  showEntry();
  status('Choose how you want to join.');
}
function resetFinishedOrActiveGame(){
  onlineMatch.stop();
  if(refreshTimer)clearInterval(refreshTimer);
  refreshTimer=null;
  room=null;
  persistRoom();
  showEntry();
  status('Ready for a new council. Choose a room.');
}
window.openOnlineLobby=async function(){
  onlineVisible=true;
  showEntry();
  setEntryReady(false);
  status('Connecting to Supabase…');
  $('online-name').value=localStorage.getItem('ss_display_name')||'';
  room=null;
  try{
    await signedIn();
    setEntryReady(true);
    const prior=sessionStorage.getItem('ss_room_id');
    if(prior){
      try{room=await rpc('ss_room_snapshot',{p_room:prior});}
      catch{sessionStorage.removeItem('ss_room_id');}
    }
    if(room){renderRoom();startPolling();}
    else status('Connected. Choose how you want to join.');
  }catch(e){status(e.message,true);setEntryReady(true);}
};
$('online-quick').addEventListener('click',()=>enterRoom({p_quick:true}));
$('online-create').addEventListener('click',()=>enterRoom({p_create:true}));
$('online-join').addEventListener('click',()=>enterRoom({p_code:$('online-code').value.trim().toUpperCase().replace(/\s+/g,'-')}));
$('online-start').addEventListener('click',async()=>{
  try{room=await rpc('ss_start_room',{p_room:room.id,p_fill_bots:true});renderRoom();}catch(e){status(e.message,true);}
});
$('online-start-humans').addEventListener('click',async()=>{
  try{room=await rpc('ss_start_room',{p_room:room.id,p_fill_bots:false});renderRoom();}catch(e){status(e.message,true);}
});
$('online-leave').addEventListener('click',leaveRoom);
$('online-exit-match').addEventListener('click',resetFinishedOrActiveGame);
$('online-new-match').addEventListener('click',()=>{
  resetFinishedOrActiveGame();
  enterRoom({p_create:true});
});
$('online-copy').addEventListener('click',async()=>{
  if(room){
    try{await navigator.clipboard.writeText(room.code);status('Copied room code: '+room.code);}
    catch{status('Your invite code is '+room.code);}
  }
});
$('online-back').addEventListener('click',()=>{
  onlineVisible=false;
  if(refreshTimer)clearInterval(refreshTimer);
  window.location.href='../index.html';
});
window.openOnlineLobby();
