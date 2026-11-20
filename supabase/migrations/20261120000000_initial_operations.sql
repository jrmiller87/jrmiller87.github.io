-- NO DICE OPERATIONS / DATABASE FOUNDATION
-- Apply in the Supabase SQL Editor AFTER creating a Supabase project.
-- Designed for Supabase Auth (Discord OAuth), GitHub Pages frontend, and
-- a future trusted Discord bot / Supabase Edge Function for XP awards.
-- No privileged writes are permitted directly from a browser.

create table if not exists public.operator_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Operator'
    check (char_length(display_name) between 1 and 40),
  avatar_url text,
  profile_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_missions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text not null default '',
  xp_reward integer not null default 0 check (xp_reward between 0 and 100000),
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.operations_xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.operator_profiles(user_id) on delete cascade,
  amount integer not null check (amount > 0 and amount <= 100000),
  source text not null,
  source_reference text,
  awarded_at timestamptz not null default now()
);
create index if not exists operations_xp_events_user_idx
  on public.operations_xp_events (user_id, awarded_at desc);
create unique index if not exists operations_xp_events_dedupe_idx
  on public.operations_xp_events (source, source_reference)
  where source_reference is not null;

create table if not exists public.operations_mission_completions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.operator_profiles(user_id) on delete cascade,
  mission_id uuid not null references public.operations_missions(id),
  completed_at timestamptz not null default now(),
  unique (user_id, mission_id)
);
create index if not exists operations_mission_completions_user_idx
  on public.operations_mission_completions (user_id);

create table if not exists public.operations_badges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  visible boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.operations_member_badges (
  user_id uuid not null references public.operator_profiles(user_id) on delete cascade,
  badge_id uuid not null references public.operations_badges(id),
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- Initial profiles are created by Supabase Auth, never browser-written.
-- Keep SECURITY DEFINER functions in a non-exposed schema, not public.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create or replace function private.operations_create_profile()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.operator_profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'full_name',''),
                  nullif(new.raw_user_meta_data ->> 'name',''),
                  nullif(new.raw_user_meta_data ->> 'user_name',''),
                  'Operator'), 40),
    nullif(new.raw_user_meta_data ->> 'avatar_url','')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists operations_on_auth_user_created on auth.users;
create trigger operations_on_auth_user_created
after insert on auth.users
for each row execute function private.operations_create_profile();
revoke all on function private.operations_create_profile() from public, anon, authenticated;

-- Backfill users who may have signed in before this migration was applied.
insert into public.operator_profiles (user_id, display_name, avatar_url)
select id,
  left(coalesce(nullif(raw_user_meta_data ->> 'full_name',''),
                nullif(raw_user_meta_data ->> 'name',''),
                nullif(raw_user_meta_data ->> 'user_name',''),
                'Operator'),40),
  nullif(raw_user_meta_data ->> 'avatar_url','')
from auth.users on conflict (user_id) do nothing;

-- Row Level Security is mandatory for every browser-accessible table.
alter table public.operator_profiles enable row level security;
alter table public.operations_missions enable row level security;
alter table public.operations_xp_events enable row level security;
alter table public.operations_mission_completions enable row level security;
alter table public.operations_badges enable row level security;
alter table public.operations_member_badges enable row level security;

-- Start from least privilege. XP, completions, and badges are written
-- ONLY by a future trusted service with server-side authentication.
revoke all on public.operator_profiles from anon, authenticated;
revoke all on public.operations_missions from anon, authenticated;
revoke all on public.operations_xp_events from anon, authenticated;
revoke all on public.operations_mission_completions from anon, authenticated;
revoke all on public.operations_badges from anon, authenticated;
revoke all on public.operations_member_badges from anon, authenticated;

grant select on public.operator_profiles to anon, authenticated;
grant update (display_name, profile_public) on public.operator_profiles to authenticated;
grant select on public.operations_missions to anon, authenticated;
grant select on public.operations_xp_events to authenticated;
grant select on public.operations_mission_completions to authenticated;
grant select on public.operations_badges to anon, authenticated;
grant select on public.operations_member_badges to authenticated;

-- Default private; public profiles are opt-in.
create policy "View own or opted-in profiles" on public.operator_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id or profile_public);
create policy "View opted-in profiles without logging in" on public.operator_profiles
  for select to anon using (profile_public);
create policy "Edit own public profile fields" on public.operator_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Read published missions" on public.operations_missions
  for select to anon, authenticated using (published);

create policy "Read own XP ledger" on public.operations_xp_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own mission completions" on public.operations_mission_completions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Read visible badge definitions" on public.operations_badges
  for select to anon, authenticated using (visible);
create policy "Read own earned badges" on public.operations_member_badges
  for select to authenticated using ((select auth.uid()) = user_id);

-- Do not add INSERT/UPDATE/DELETE policies for client XP or badge tables.
-- Verify authorization and event idempotency in trusted server functions.
-- No service_role/secret keys belong in GitHub Pages, JavaScript, or git.
