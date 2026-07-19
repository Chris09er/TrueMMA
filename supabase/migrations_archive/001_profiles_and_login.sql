-- Login / Profil feature: profiles table, event_follows table,
-- push_subscriptions.user_id. Run manually in the Supabase SQL Editor
-- (this project has no CLI-based migration runner — see docs/ARCHITECTURE.md).

-- 1. profiles ----------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text unique,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "select own profile" on profiles
  for select using (auth.uid() = id);

create policy "insert own profile" on profiles
  for insert with check (auth.uid() = id);

create policy "update own profile" on profiles
  for update using (auth.uid() = id);

-- Auto-create an (empty) profile row on signup so the app never has to
-- special-case "no profile row yet" — nickname stays null until the user
-- sets one.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 2. push_subscriptions.user_id -----------------------------------------
alter table push_subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- IMPORTANT: before running the CREATE POLICY statements below, first run
--   select policyname from pg_policies where tablename = 'push_subscriptions';
-- and drop whatever the three existing `using (true)` policies are actually
-- named (their names weren't recorded anywhere in this repo), e.g.:
--   drop policy "<actual name>" on push_subscriptions;
-- Skipping this step leaves the old fully-open policies active alongside
-- the new scoped ones — since Postgres RLS policies are OR'd together, the
-- old ones would keep letting anyone read/write any row regardless of
-- user_id, silently defeating the scoping below.

create policy "push_subscriptions insert" on push_subscriptions
  for insert with check (user_id is null or user_id = auth.uid());

create policy "push_subscriptions select" on push_subscriptions
  for select using (user_id is null or user_id = auth.uid());

create policy "push_subscriptions delete" on push_subscriptions
  for delete using (user_id is null or user_id = auth.uid());

-- 3. event_follows --------------------------------------------------------
create table if not exists event_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

alter table event_follows enable row level security;

create policy "manage own event follows" on event_follows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
