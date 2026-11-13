import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const encoder = new TextEncoder();
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const fail = (message: string, status = 400) => reply({ error: message }, status);
const iso = () => new Date().toISOString();
const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
const clean = (v: unknown) => String(v ?? '').trim();
const check = (r: { error?: { message: string } | null }) => { if(r.error) throw new Error(r.error.message); };
async function session(token: string) {
  if(!token) return null;
  const { data } = await db.from('sa_sessions').select('*').eq('token_hash',await hash(token)).gt('expires_at',iso()).maybeSingle();
  return data;
}
async function newSession(player_id: string | null, is_admin = false) {
  const token = secret();
  check(await db.from('sa_sessions').insert({ token_hash:await hash(token),player_id,is_admin,expires_at:new Date(Date.now()+30*86400000).toISOString() }));
  return token;
}
async function settings() { const {data,error}=await db.from('sa_settings').select('*').eq('id',1).single();check({error});return data!; }
async function player(id:string) { const {data,error}=await db.from('sa_players').select('*').eq('id',id).single();check({error});return data!; }
async function players() { const {data,error}=await db.from('sa_players').select('*').order('created_at');check({error});return data!; }
async function publicState(me?: string, admin=false) {
  const s=await settings(), all=await players();
  const {data:elims}=await db.from('sa_eliminations').select('*').order('submitted_at',{ascending:false});
  const {data:events}=await db.from('sa_events').select('*').order('created_at',{ascending:false}).limit(30);
  const {data:announcements,error:announcementError}=await db.from('sa_announcements').select('id,title,body,pinned,created_at,updated_at').order('pinned',{ascending:false}).order('created_at',{ascending:false}).limit(50);check({error:announcementError});
  const names=new Map(all.map(p=>[p.id,p.full_name]));
  const mapped=await Promise.all((elims||[]).filter(e=>admin||e.status==='confirmed'||e.assassin_id===me||e.victim_id===me).map(async e=>({
    id:e.id,assassin_id:e.assassin_id,victim_id:e.victim_id,assassin:names.get(e.assassin_id),victim:names.get(e.victim_id),caption:e.caption,status:e.status,submitted_at:e.submitted_at,
    photo_url:e.photo_path?(await db.storage.from('sa-photos').createSignedUrl(e.photo_path,3600)).data?.signedUrl:null
  })));
  const own=all.find(p=>p.id===me);
  return {phase:s.phase,started_at:s.started_at,starts_at:s.starts_at,winner:s.winner_id?names.get(s.winner_id):null,invite_set:!!s.invite_code,
    me:own?{id:own.id,name:own.full_name,alive:own.alive,kills:own.kills,cooldown_until:own.cooldown_until,shield_until:own.shield_until,last_accusation_date:own.last_accusation_date,target:own.alive&&own.target_id?names.get(own.target_id):null}:null,
    players:all.map(p=>({id:p.id,name:p.full_name,alive:p.alive,kills:p.kills})),eliminations:mapped,events:events||[],announcements:announcements||[],is_admin:admin,
    ...(admin?{pending:mapped.filter(e=>e.status==='pending'||e.status==='disputed')}: {})};
}

// Game mutations use a short-lived global advisory lock through the database RPC below.
// No mutation is accepted from an unauthenticated browser.
async function locked(action:string,payload:Record<string,unknown>) {
  const {data,error}=await db.rpc('sa_mutate',{p_action:action,p_data:payload});check({error});
  if(data?.error) throw new Error(data.error);
  return data;
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response(null,{headers});
  if(req.method!=='POST') return fail('POST required',405);
  try {
    const body=await req.json();const action=clean(body.action);const token=clean(body.token);
    const before=await settings();
    if(before.phase==='registration'&&new Date(before.starts_at)<=new Date()) {
      try { await locked('start',{}); } catch(e) { console.error('Scheduled start:',e); }
    }
    if(action==='status') { const s=await settings();const {count}=await db.from('sa_players').select('id',{count:'exact',head:true});return reply({phase:s.phase,starts_at:s.starts_at,players:count??0}); }
    if(action==='check_invite') {const s=await settings();return s.phase==='registration'&&clean(body.invite)===s.invite_code&&!!s.invite_code?reply({ok:true}):fail('Incorrect code or registration has closed');}
    if(action==='register') {
      const s=await settings();if(s.phase!=='registration'||new Date(s.starts_at)<=new Date()) return fail('Registration is closed');
      if(!s.invite_code || clean(body.invite)!==s.invite_code) return fail('Incorrect invitation code');
      const name=clean(body.name).replace(/\s+/g,' '), password=String(body.password??'');
      if(name.length<3||name.length>60||password.length<8||password.length>120) return fail('Enter a full name and a password of at least 8 characters');
      const normalized=name.toLocaleLowerCase('en-US');
      if(normalized==='game master')return fail('This name is reserved. Use your full name.');
      const {data:existing}=await db.from('sa_players').select('id').eq('name_key',normalized).maybeSingle();if(existing) return fail('That name is already registered');
      const result=await db.from('sa_players').insert({full_name:name,name_key:normalized,password_plain:password,password_hash:await hash(password)}).select('id').single();check(result);
      return reply({token:await newSession(result.data!.id),message:'Welcome to the game!'});
    }
    if(action==='login' && clean(body.name).toLocaleLowerCase('en-US')==='game master') {
      const configured=Deno.env.get('SA_ADMIN_PASSWORD');
      if(!configured||configured.length<8)return fail('Admin password is not configured',503);
      if(await hash(String(body.password??''))!==await hash(configured))return fail('Incorrect name or password',401);
      return reply({token:await newSession(null,true)});
    }
    if(action==='login') {
      const name=clean(body.name).replace(/\s+/g,' ').toLocaleLowerCase('en-US');
      const {data}=await db.from('sa_players').select('id,password_hash').eq('name_key',name).maybeSingle();
      if(!data||data.password_hash!==await hash(String(body.password??''))) return fail('Incorrect name or password',401);
      return reply({token:await newSession(data.id)});
    }
    if(action==='admin_login') {
      const configured=Deno.env.get('SA_ADMIN_PASSWORD');
      if(!configured||configured.length<8) return fail('Admin password has not been configured',503);
      if(await hash(clean(body.password))!==await hash(configured)) return fail('Incorrect admin password',401);
      return reply({token:await newSession(null,true)});
    }
    const sess=await session(token);if(!sess) return fail('Please log in again',401);
    if(action==='state') return reply(await publicState(sess.player_id,sess.is_admin));
    if(action==='logout') {check(await db.from('sa_sessions').delete().eq('token_hash',await hash(token)));return reply({ok:true});}
    if(action==='submit') {
      if(sess.is_admin)return fail('Use a player account');
      const p=await player(sess.player_id);const s=await settings();
      if(s.phase!=='live'||!p.alive||!p.target_id)return fail('No active target');
      if(p.cooldown_until && new Date(p.cooldown_until)>new Date())return fail('You are on cooldown');
      if(p.shield_until && new Date(p.shield_until)>new Date()){} // shield affects the target, not attacker
      const victim=await player(p.target_id);
      if(victim.shield_until&&new Date(victim.shield_until)>new Date()) return fail('Your target is protected');
      const {data:existing}=await db.from('sa_eliminations').select('id').eq('victim_id',p.target_id).in('status',['pending','disputed']).maybeSingle();
      if(existing)return fail('This target already has a pending claim');
      let path:null|string=null;
      if(body.photo && typeof body.photo==='string') {
        const match=body.photo.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
        if(!match)return fail('Use a JPG, PNG, or WebP photo');
        const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));if(bytes.length>5*1024*1024)return fail('Photo is too large');
        path=`${p.id}/${crypto.randomUUID()}.${match[1].split('/')[1]}`;
        check(await db.storage.from('sa-photos').upload(path,bytes,{contentType:match[1]}));
      }
      check(await db.from('sa_eliminations').insert({assassin_id:p.id,victim_id:p.target_id,photo_path:path,caption:clean(body.caption).slice(0,400)}));
      return reply({ok:true,message:'Claim submitted. Waiting for confirmation.'});
    }
    if(action==='resolve') {
      const id=clean(body.id),approve=!!body.approve;
      const {data:claim}=await db.from('sa_eliminations').select('*').eq('id',id).single();if(!claim)return fail('Claim not found');
      if(!sess.is_admin && sess.player_id!==claim.victim_id)return fail('Only the target or admin may decide',403);
      if(!['pending','disputed'].includes(claim.status))return fail('Already resolved');
      if(!approve&&!sess.is_admin) {check(await db.from('sa_eliminations').update({status:'disputed'}).eq('id',id));return reply({ok:true,message:'Disputed. An admin will review.'});}
      return reply(await locked('resolve',{id,approve}));
    }
    if(action==='failed_attempt') {
      if(sess.is_admin)return fail('Use player login');
      return reply(await locked('failed_attempt',{victim_id:sess.player_id}));
    }
    if(!sess.is_admin)return fail('Admin only',403);
    if(action==='admin_data') {
      const configured=Deno.env.get('SA_ADMIN_PASSWORD');
      if(!configured || await hash(String(body.password??''))!==await hash(configured))return fail('Incorrect organizer password',401);
      const all=await players();const names=new Map(all.map(p=>[p.id,p.full_name]));
      const {data:accusations}=await db.from('sa_accusations').select('*').order('created_at',{ascending:false}).limit(100);
      const {data:allEvents}=await db.from('sa_events').select('*').order('created_at',{ascending:false}).limit(500);
      return reply({admin_players:all.map(p=>({id:p.id,name:p.full_name,password:p.password_plain,alive:p.alive,target:names.get(p.target_id)||null,hunter:all.find(q=>q.alive&&q.target_id===p.id)?.full_name||null,kills:p.kills,cooldown_until:p.cooldown_until,shield_until:p.shield_until,created_at:p.created_at})),accusations:accusations||[],all_events:allEvents||[]});
    }
    if(action==='announce_create') {
      const title=clean(body.title).slice(0,110),text=clean(body.text).slice(0,3000);
      if(!title||!text)return fail('Title and message required');
      check(await db.from('sa_announcements').insert({title,body:text,pinned:body.pinned===true}));
      return reply({ok:true,message:'Announcement published'});
    }
    if(action==='announce_update') {
      const id=clean(body.id),title=clean(body.title).slice(0,110),text=clean(body.text).slice(0,3000);
      if(!/^[0-9a-f-]{36}$/i.test(id)||!title||!text)return fail('Invalid announcement');
      const result=await db.from('sa_announcements').update({title,body:text,pinned:body.pinned===true,updated_at:iso()}).eq('id',id).select('id');check(result);
      if(!result.data?.length)return fail('Announcement not found',404);
      return reply({ok:true,message:'Announcement updated'});
    }
    if(action==='announce_delete') {
      const id=clean(body.id);if(!/^[0-9a-f-]{36}$/i.test(id))return fail('Invalid announcement');
      check(await db.from('sa_announcements').delete().eq('id',id));return reply({ok:true,message:'Announcement deleted'});
    }

    if(action==='set_invite') {
      if((await settings()).phase!=='registration')return fail('Cannot change invitations after starting');
      const invite=clean(body.invite);if(invite.length<6)return fail('Code must be at least 6 characters');
      check(await db.from('sa_settings').update({invite_code:invite,updated_at:iso()}).eq('id',1));return reply({ok:true});
    }
    if(action==='start'||action==='pause'||action==='resume'||action==='finish'||action==='admin_cooldown'||action==='admin_eliminate')return reply(await locked(action,{player_id:clean(body.player_id)}));
    if(action==='reset_password') {
      const id=clean(body.player_id),pass=clean(body.password);if(pass.length<8)return fail('Minimum 8 characters');
      check(await db.from('sa_players').update({password_plain:pass,password_hash:await hash(pass)}).eq('id',id));
      check(await db.from('sa_sessions').delete().eq('player_id',id));return reply({ok:true});
    }
    return fail('Unknown action');
  }catch(e){console.error(e);return fail(e instanceof Error?e.message:'Server error',500);}
});
