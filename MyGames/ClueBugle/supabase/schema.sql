-- Run this once in the SQL editor of the NEW ClueBugle Supabase project.
create table if not exists public.cluebugle_rooms (
  code text primary key,
  version bigint not null default 0,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists cluebugle_rooms_updated_at_idx on public.cluebugle_rooms(updated_at);
alter table public.cluebugle_rooms enable row level security;
-- No browser role gets direct table access. The Edge Function uses the service-role key.
revoke all on public.cluebugle_rooms from anon, authenticated;

