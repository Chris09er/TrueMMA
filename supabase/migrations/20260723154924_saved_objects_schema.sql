-- Gruppe C, Phase 1: the unified "saved_*" schema (heart = save + notify).
--
-- Background. Until now three separate concepts lived in five tables with
-- three DIFFERENT identity anchors:
--   * fighter_favorites / event_favorites / event_follows — user_id-only,
--     NO push (favorites & event reminders were local AsyncStorage;
--     event_follows existed purely for cross-device profile visibility).
--   * push_subscriptions / organization_follows — push_token-anchored bell
--     "follows" that actually drive server push.
-- The bell→heart merge collapses all of that into one "saved_*" table per
-- object type: one heart = saved to the list AND notifications on by default,
-- tunable per object in the profile.
--
-- Identity model. The row is anchored on device_id — the ONLY identifier that
-- always exists (generated locally on first launch, like fight_votes'
-- `true-mma:device-id`; no OS notification permission required). user_id and
-- push_token are mutable ATTRIBUTES of that row, not the anchor:
--   * user_id   — set from auth.uid() on login (cross-device), never trusted
--                 from a client parameter.
--   * push_token — set when the OS notification permission is granted. The
--                 whole push audience is simply "rows where push_token is not
--                 null and the relevant notify_* flag is true".
-- unique(device_id, object_id) = one save per install per object.
--
-- Security. Base tables are fully RLS-locked (RLS on, no policies, no
-- anon/authenticated grants) — same treatment as the push bookkeeping tables.
-- ALL access goes through the SECURITY DEFINER RPCs below, so a client can
-- never SELECT another device's push_token. device_id and push_token are
-- still client-self-reported (the accepted low-sensitivity anon trust model
-- from fight_votes / push_subscriptions), but user_id is derived server-side
-- from auth.uid() and cannot be spoofed to write into someone else's account.
--
-- This migration is PHASE 1 only: it creates the new tables + RPCs and leaves
-- the five legacy tables and the existing push triggers untouched. Phase 2
-- rewrites notify_fighter_added_to_fight() / send_league_start_pushes() to
-- read saved_* (adding saved_events as a brand-new per-event push audience);
-- only after that lands do the legacy tables get dropped, so the currently
-- running push functions never reference a missing table.

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------

create table if not exists public.saved_fighters (
  id                 uuid primary key default gen_random_uuid(),
  device_id          text not null,
  fighter_id         uuid not null references public.fighters(id) on delete cascade,
  user_id            uuid references auth.users(id) on delete set null,
  push_token         text,
  notify_new_fight   boolean not null default true,
  notify_fight_start boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (device_id, fighter_id)
);

create table if not exists public.saved_events (
  id                 uuid primary key default gen_random_uuid(),
  device_id          text not null,
  event_id           uuid not null references public.events(id) on delete cascade,
  user_id            uuid references auth.users(id) on delete set null,
  push_token         text,
  notify_event_start boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (device_id, event_id)
);

create table if not exists public.saved_organizations (
  id                 uuid primary key default gen_random_uuid(),
  device_id          text not null,
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  user_id            uuid references auth.users(id) on delete set null,
  push_token         text,
  notify_event_start boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (device_id, organization_id)
);

-- Push-audience lookups scan by object id and filter on push_token; the list
-- RPCs scan by device_id / user_id. Index for both access shapes.
create index if not exists idx_saved_fighters_fighter  on public.saved_fighters (fighter_id) where push_token is not null;
create index if not exists idx_saved_fighters_user     on public.saved_fighters (user_id);
create index if not exists idx_saved_events_event      on public.saved_events (event_id) where push_token is not null;
create index if not exists idx_saved_events_user       on public.saved_events (user_id);
create index if not exists idx_saved_orgs_org          on public.saved_organizations (organization_id) where push_token is not null;
create index if not exists idx_saved_orgs_user         on public.saved_organizations (user_id);

alter table public.saved_fighters      enable row level security;
alter table public.saved_events        enable row level security;
alter table public.saved_organizations enable row level security;

-- No policies, no anon/authenticated grants: locked. Access is via the RPCs.
revoke all on public.saved_fighters      from anon, authenticated;
revoke all on public.saved_events        from anon, authenticated;
revoke all on public.saved_organizations from anon, authenticated;
grant all on public.saved_fighters       to postgres, service_role;
grant all on public.saved_events         to postgres, service_role;
grant all on public.saved_organizations  to postgres, service_role;

-------------------------------------------------------------------------------
-- Write RPCs: save_* / unsave_* / set_*_notify.
-- user_id is taken from auth.uid() (null when anonymous), never a parameter.
-- push_token is coalesced so passing null on a re-save never wipes an existing
-- token; notify flags are left untouched on re-save so profile toggles stick.
-------------------------------------------------------------------------------

create or replace function public.save_fighter(p_device_id text, p_fighter_id uuid, p_push_token text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(trim(p_device_id), '') = '' then
    raise exception 'device_id required';
  end if;

  insert into public.saved_fighters (device_id, fighter_id, user_id, push_token)
  values (p_device_id, p_fighter_id, auth.uid(), p_push_token)
  on conflict (device_id, fighter_id) do update
    set user_id    = coalesce(auth.uid(), public.saved_fighters.user_id),
        push_token = coalesce(excluded.push_token, public.saved_fighters.push_token);
end;
$$;

create or replace function public.save_event(p_device_id text, p_event_id uuid, p_push_token text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(trim(p_device_id), '') = '' then
    raise exception 'device_id required';
  end if;

  insert into public.saved_events (device_id, event_id, user_id, push_token)
  values (p_device_id, p_event_id, auth.uid(), p_push_token)
  on conflict (device_id, event_id) do update
    set user_id    = coalesce(auth.uid(), public.saved_events.user_id),
        push_token = coalesce(excluded.push_token, public.saved_events.push_token);
end;
$$;

create or replace function public.save_organization(p_device_id text, p_organization_id uuid, p_push_token text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(trim(p_device_id), '') = '' then
    raise exception 'device_id required';
  end if;

  insert into public.saved_organizations (device_id, organization_id, user_id, push_token)
  values (p_device_id, p_organization_id, auth.uid(), p_push_token)
  on conflict (device_id, organization_id) do update
    set user_id    = coalesce(auth.uid(), public.saved_organizations.user_id),
        push_token = coalesce(excluded.push_token, public.saved_organizations.push_token);
end;
$$;

create or replace function public.unsave_fighter(p_device_id text, p_fighter_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.saved_fighters where device_id = p_device_id and fighter_id = p_fighter_id;
end; $$;

create or replace function public.unsave_event(p_device_id text, p_event_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.saved_events where device_id = p_device_id and event_id = p_event_id;
end; $$;

create or replace function public.unsave_organization(p_device_id text, p_organization_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.saved_organizations where device_id = p_device_id and organization_id = p_organization_id;
end; $$;

create or replace function public.set_fighter_notify(
  p_device_id text, p_fighter_id uuid, p_notify_new_fight boolean, p_notify_fight_start boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.saved_fighters
     set notify_new_fight = p_notify_new_fight,
         notify_fight_start = p_notify_fight_start
   where device_id = p_device_id and fighter_id = p_fighter_id;
end; $$;

create or replace function public.set_event_notify(p_device_id text, p_event_id uuid, p_notify_event_start boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.saved_events set notify_event_start = p_notify_event_start
   where device_id = p_device_id and event_id = p_event_id;
end; $$;

create or replace function public.set_organization_notify(p_device_id text, p_organization_id uuid, p_notify_event_start boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.saved_organizations set notify_event_start = p_notify_event_start
   where device_id = p_device_id and organization_id = p_organization_id;
end; $$;

-------------------------------------------------------------------------------
-- Identity RPCs.
--   attach_push_token: called when the OS notification permission is granted —
--     stamps this device's token onto all of its saved_* rows so they become
--     push-eligible. Also (re)stamps on token rotation.
--   claim_saves_for_user: called on login — attaches auth.uid() to this
--     device's anonymous rows so they become the account's cross-device list.
--     No-op when anonymous.
-------------------------------------------------------------------------------

create or replace function public.attach_push_token(p_device_id text, p_push_token text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(trim(p_device_id), '') = '' or coalesce(trim(p_push_token), '') = '' then
    return;
  end if;
  update public.saved_fighters      set push_token = p_push_token where device_id = p_device_id;
  update public.saved_events        set push_token = p_push_token where device_id = p_device_id;
  update public.saved_organizations set push_token = p_push_token where device_id = p_device_id;
end; $$;

create or replace function public.claim_saves_for_user(p_device_id text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or coalesce(trim(p_device_id), '') = '' then
    return;
  end if;
  update public.saved_fighters      set user_id = uid where device_id = p_device_id and user_id is null;
  update public.saved_events        set user_id = uid where device_id = p_device_id and user_id is null;
  update public.saved_organizations set user_id = uid where device_id = p_device_id and user_id is null;
end; $$;

-------------------------------------------------------------------------------
-- Read RPCs. Return this device's rows UNION the logged-in user's rows (across
-- devices), deduplicated per object — preferring this device's row so its
-- notify flags win. push_token is deliberately NOT returned; the client only
-- ever needs its own token, which it already holds.
-------------------------------------------------------------------------------

create or replace function public.list_saved_fighters(p_device_id text)
returns table (
  fighter_id uuid,
  notify_new_fight boolean,
  notify_fight_start boolean,
  has_push boolean,
  created_at timestamptz)
language sql security definer set search_path to 'public' as $$
  select distinct on (s.fighter_id)
         s.fighter_id, s.notify_new_fight, s.notify_fight_start,
         s.push_token is not null as has_push, s.created_at
  from public.saved_fighters s
  where s.device_id = p_device_id
     or (auth.uid() is not null and s.user_id = auth.uid())
  order by s.fighter_id, (s.device_id = p_device_id) desc, s.created_at;
$$;

create or replace function public.list_saved_events(p_device_id text)
returns table (
  event_id uuid,
  notify_event_start boolean,
  has_push boolean,
  created_at timestamptz)
language sql security definer set search_path to 'public' as $$
  select distinct on (s.event_id)
         s.event_id, s.notify_event_start,
         s.push_token is not null as has_push, s.created_at
  from public.saved_events s
  where s.device_id = p_device_id
     or (auth.uid() is not null and s.user_id = auth.uid())
  order by s.event_id, (s.device_id = p_device_id) desc, s.created_at;
$$;

create or replace function public.list_saved_organizations(p_device_id text)
returns table (
  organization_id uuid,
  notify_event_start boolean,
  has_push boolean,
  created_at timestamptz)
language sql security definer set search_path to 'public' as $$
  select distinct on (s.organization_id)
         s.organization_id, s.notify_event_start,
         s.push_token is not null as has_push, s.created_at
  from public.saved_organizations s
  where s.device_id = p_device_id
     or (auth.uid() is not null and s.user_id = auth.uid())
  order by s.organization_id, (s.device_id = p_device_id) desc, s.created_at;
$$;

-------------------------------------------------------------------------------
-- Ownership + grants for every RPC. SECURITY DEFINER + owner postgres so they
-- bypass the locked base tables; execute granted to anon + authenticated (the
-- client calls them either logged in or not).
-------------------------------------------------------------------------------

do $$
declare fn text;
begin
  foreach fn in array array[
    'save_fighter(text, uuid, text)',
    'save_event(text, uuid, text)',
    'save_organization(text, uuid, text)',
    'unsave_fighter(text, uuid)',
    'unsave_event(text, uuid)',
    'unsave_organization(text, uuid)',
    'set_fighter_notify(text, uuid, boolean, boolean)',
    'set_event_notify(text, uuid, boolean)',
    'set_organization_notify(text, uuid, boolean)',
    'attach_push_token(text, text)',
    'claim_saves_for_user(text)',
    'list_saved_fighters(text)',
    'list_saved_events(text)',
    'list_saved_organizations(text)'
  ]
  loop
    execute format('alter function public.%s owner to postgres', fn);
    execute format('revoke execute on function public.%s from public', fn);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', fn);
  end loop;
end $$;
