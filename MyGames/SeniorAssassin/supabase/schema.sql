-- Isolated Senior Assassin schema in existing Games project.
create table if not exists public.sa_settings (
  id integer primary key default 1 check(id = 1),
  phase text not null default 'registration' check(phase in ('registration','live','paused','finished')),
  invite_code text not null default '',
  starts_at timestamptz not null default '2026-11-15 12:00:00-05',
  started_at timestamptz,
  winner_id uuid,
  updated_at timestamptz not null default now()
);
insert into public.sa_settings (id) values (1) on conflict do nothing;
alter table public.sa_settings add column if not exists starts_at timestamptz not null default '2026-11-15 12:00:00-05';
-- Existing rows may have the old Friday deadline: update only while registering.
update public.sa_settings set starts_at='2026-11-15 12:00:00-05' where id=1 and phase='registration';

create table if not exists public.sa_players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  name_key text not null unique,
  password_plain text not null,
  password_hash text not null,
  alive boolean not null default true,
  target_id uuid references public.sa_players(id),
  kills integer not null default 0,
  cooldown_until timestamptz,
  shield_until timestamptz,
  last_accusation_date date,
  created_at timestamptz not null default now()
);
create table if not exists public.sa_sessions (
  token_hash text primary key,
  player_id uuid references public.sa_players(id) on delete cascade,
  is_admin boolean not null default false,
  expires_at timestamptz not null
);
create table if not exists public.sa_eliminations (
  id uuid primary key default gen_random_uuid(),
  assassin_id uuid not null references public.sa_players(id),
  victim_id uuid not null references public.sa_players(id),
  photo_path text,
  caption text not null default '',
  status text not null default 'pending' check(status in ('pending','confirmed','disputed','rejected')),
  submitted_at timestamptz not null default now(),
  resolved_at timestamptz
);
create table if not exists public.sa_events (
  id bigint generated always as identity primary key,
  type text not null,
  description text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.sa_accusations (
  id uuid primary key default gen_random_uuid(),
  accuser_id uuid not null references public.sa_players(id),
  accused_id uuid not null references public.sa_players(id),
  correct boolean not null,
  created_at timestamptz not null default now()
);

-- Game-master announcements, shown on Home to all registered players.
create table if not exists public.sa_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check(char_length(title) between 1 and 110),
  body text not null check(char_length(body) between 1 and 3000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- No direct browser access; only server-side service-role operations.
alter table public.sa_settings enable row level security;
alter table public.sa_players enable row level security;
alter table public.sa_sessions enable row level security;
alter table public.sa_eliminations enable row level security;
alter table public.sa_events enable row level security;
alter table public.sa_accusations enable row level security;
alter table public.sa_announcements enable row level security;
revoke all on public.sa_settings,public.sa_players,public.sa_sessions,public.sa_eliminations,public.sa_events,public.sa_accusations,public.sa_announcements from anon,authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('sa-photos','sa-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Service-role-only transactional game engine. All changes serialize against
-- the settings row, preventing conflicting inheritance updates.
create or replace function public.sa_mutate(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  s public.sa_settings%rowtype;
  a public.sa_players%rowtype;
  v public.sa_players%rowtype;
  cl public.sa_eliminations%rowtype;
  ids uuid[];
  n integer;
  i integer;
  successor uuid;
  accuser public.sa_players%rowtype;
  accused public.sa_players%rowtype;
  is_right boolean;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('error','Not authorized');
  end if;
  select * into s from public.sa_settings where id=1 for update;
  if p_action='start' then
    if s.phase <> 'registration' then return jsonb_build_object('error','Game has already started'); end if;
    if now()<s.starts_at then return jsonb_build_object('error','Start time has not arrived'); end if;
    select array_agg(id order by random()) into ids from public.sa_players;
    n:=coalesce(array_length(ids,1),0);
    if n<3 then return jsonb_build_object('error','At least 3 players required'); end if;
    for i in 1..n loop
      update public.sa_players set target_id=ids[1+(i%n)] where id=ids[i];
    end loop;
    update public.sa_settings set phase='live',started_at=now(),updated_at=now() where id=1;
    insert into public.sa_events(type,description) values ('start','The hunt has begun!');
    return '{"ok":true}'::jsonb;
  elsif p_action='pause' then
    if s.phase<>'live' then return jsonb_build_object('error','Game is not live'); end if;
    update public.sa_settings set phase='paused' where id=1;
    return '{"ok":true}'::jsonb;
  elsif p_action='resume' then
    if s.phase<>'paused' then return jsonb_build_object('error','Game is not paused'); end if;
    update public.sa_settings set phase='live' where id=1;
    return '{"ok":true}'::jsonb;
  elsif p_action='finish' then
    update public.sa_settings set phase='finished' where id=1;
    return '{"ok":true}'::jsonb;
  elsif p_action='resolve' then
    select * into cl from public.sa_eliminations where id=(p_data->>'id')::uuid for update;
    if cl.id is null or cl.status not in ('pending','disputed') then return jsonb_build_object('error','Claim already resolved'); end if;
    if not (p_data->>'approve')::boolean then
      update public.sa_eliminations set status='rejected',resolved_at=now() where id=cl.id;
      return '{"ok":true}'::jsonb;
    end if;
    if s.phase not in ('live','paused') then return jsonb_build_object('error','Game is not active'); end if;
    select * into a from public.sa_players where id=cl.assassin_id for update;
    select * into v from public.sa_players where id=cl.victim_id for update;
    if not a.alive or not v.alive or a.target_id<>v.id then
      return jsonb_build_object('error','Target chain changed; reject and review this claim');
    end if;
    if a.cooldown_until is not null and cl.submitted_at<a.cooldown_until then return jsonb_build_object('error','Claim was during cooldown'); end if;
    update public.sa_eliminations set status='confirmed',resolved_at=now() where id=cl.id;
    update public.sa_players set alive=false,target_id=null where id=v.id;
    update public.sa_players set kills=kills+1,target_id=case when v.target_id=a.id then null else v.target_id end where id=a.id;
    insert into public.sa_events(type,description) values ('elimination',a.full_name||' eliminated '||v.full_name);
    select count(*) into n from public.sa_players where alive;
    if n=1 then
      update public.sa_settings set phase='finished',winner_id=a.id where id=1;
      insert into public.sa_events(type,description) values ('win',a.full_name||' is the last survivor!');
    end if;
    return '{"ok":true}'::jsonb;
  elsif p_action='failed_attempt' then
    if s.phase<>'live' then return jsonb_build_object('error','Game is not live'); end if;
    select * into v from public.sa_players where id=(p_data->>'victim_id')::uuid for update;
    if not v.alive then return jsonb_build_object('error','You are eliminated'); end if;
    select * into a from public.sa_players where target_id=v.id and alive for update;
    if a.id is null then return jsonb_build_object('error','No assassin found'); end if;
    update public.sa_players set cooldown_until=now()+interval '1 hour' where id=a.id;
    return '{"ok":true}'::jsonb;
  elsif p_action='admin_cooldown' then
    update public.sa_players set cooldown_until=now()+interval '1 hour' where id=(p_data->>'player_id')::uuid;
    return '{"ok":true}'::jsonb;
  elsif p_action='admin_eliminate' then
    if s.phase not in ('live','paused') then return jsonb_build_object('error','Game not active'); end if;
    select * into v from public.sa_players where id=(p_data->>'player_id')::uuid for update;
    if not v.alive then return jsonb_build_object('error','Already eliminated'); end if;
    select * into a from public.sa_players where target_id=v.id and alive for update;
    if a.id is null then return jsonb_build_object('error','No predecessor found'); end if;
    update public.sa_players set target_id=case when v.target_id=a.id then null else v.target_id end where id=a.id;
    update public.sa_players set alive=false,target_id=null where id=v.id;
    insert into public.sa_events(type,description) values('admin',v.full_name||' was removed by the game master');
    select count(*) into n from public.sa_players where alive;
    if n=1 then update public.sa_settings set phase='finished',winner_id=a.id where id=1; end if;
    return '{"ok":true}'::jsonb;
  end if;
  return jsonb_build_object('error','Unknown mutation');
end $$;
revoke all on function public.sa_mutate(text,jsonb) from public,anon,authenticated;
grant execute on function public.sa_mutate(text,jsonb) to service_role;
