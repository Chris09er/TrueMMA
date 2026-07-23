-- Gruppe C, Phase 6: notification preferences move from PER-OBJECT to
-- PER-CATEGORY.
--
-- Why. Phase 1 (013) put a notify_* flag on every saved_* row, so the profile
-- offered a switch per saved fighter / event / league. In use that turned out to
-- be the wrong altitude: the Merkliste tab became a wall of toggles, and nobody
-- wants to decide "notify me about a new fight" 40 times. The product model is
-- four switches in total, grouped by category:
--   Kämpfer         → notify_new_fight, notify_fight_start
--   Veranstaltungen → notify_event_start
--   Ligen           → notify_league_start
-- The Merkliste tab goes back to being a plain list.
--
-- Storage. A dedicated notification_prefs table, one row per device, rather
-- than fanning a category switch out across every saved_* row. Fan-out was the
-- alternative and was rejected: a newly saved object arrives with the column
-- default (true) and would then contradict a category the user had switched
-- off, so the client would need extra logic to keep the two in sync forever.
-- With a single prefs row there is nothing to drift — the audience queries read
-- the pref directly, and a new save inherits it automatically.
--
-- Identity. device_id-anchored, exactly like saved_* (see 013): push is
-- delivered to a device, so the device owns the preference. user_id is claimed
-- on login by the extended claim_saves_for_user() so the setting survives a
-- reinstall. unique(device_id) = one prefs row per install.
--
-- Defaults / back-compat. A device that has never opened the settings has NO
-- prefs row, and must keep receiving everything. Every audience query therefore
-- LEFT JOINs prefs and wraps the flag in coalesce(..., true) — absence means
-- "all on", which is also the column default. This is what keeps already-saved
-- devices working across this migration without a backfill.
--
-- Consequently the per-row notify_* columns, the three set_*_notify RPCs and the
-- notify columns in the list_saved_* return types all become dead and are
-- dropped at the end of this migration.

-------------------------------------------------------------------------------
-- Table
-------------------------------------------------------------------------------

create table if not exists public.notification_prefs (
  id                  uuid primary key default gen_random_uuid(),
  device_id           text not null unique,
  user_id             uuid references auth.users(id) on delete set null,
  notify_new_fight    boolean not null default true,
  notify_fight_start  boolean not null default true,
  notify_event_start  boolean not null default true,
  notify_league_start boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.notification_prefs is
  'Per-device, per-category push preferences (Gruppe C Phase 6). Absence of a row means all categories on — audience queries coalesce to true.';

-- The audience queries join prefs by device_id; the unique constraint above
-- already provides that index. user_id is looked up by claim on login.
create index if not exists idx_notification_prefs_user on public.notification_prefs (user_id);

alter table public.notification_prefs enable row level security;

-- Locked like saved_* — no policies, no anon/authenticated grants. Access is
-- exclusively via the SECURITY DEFINER RPCs below.
revoke all on public.notification_prefs from anon, authenticated;
grant all on public.notification_prefs to postgres, service_role;

-------------------------------------------------------------------------------
-- Read / write RPCs. user_id comes from auth.uid(), never a parameter.
-------------------------------------------------------------------------------

-- Returns the device's prefs, or the all-on defaults when it has no row yet, so
-- the client never has to special-case "not configured".
create or replace function public.get_notification_prefs(p_device_id text)
returns table (
  notify_new_fight boolean,
  notify_fight_start boolean,
  notify_event_start boolean,
  notify_league_start boolean)
language sql security definer set search_path to 'public' as $$
  select coalesce(p.notify_new_fight,    true),
         coalesce(p.notify_fight_start,  true),
         coalesce(p.notify_event_start,  true),
         coalesce(p.notify_league_start, true)
  from (select 1) dummy
  left join public.notification_prefs p on p.device_id = p_device_id;
$$;

create or replace function public.set_notification_prefs(
  p_device_id           text,
  p_notify_new_fight    boolean,
  p_notify_fight_start  boolean,
  p_notify_event_start  boolean,
  p_notify_league_start boolean)
returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(trim(p_device_id), '') = '' then
    raise exception 'device_id required';
  end if;

  insert into public.notification_prefs (
    device_id, user_id, notify_new_fight, notify_fight_start, notify_event_start, notify_league_start)
  values (
    p_device_id, auth.uid(), p_notify_new_fight, p_notify_fight_start, p_notify_event_start, p_notify_league_start)
  on conflict (device_id) do update
    set user_id             = coalesce(auth.uid(), public.notification_prefs.user_id),
        notify_new_fight    = excluded.notify_new_fight,
        notify_fight_start  = excluded.notify_fight_start,
        notify_event_start  = excluded.notify_event_start,
        notify_league_start = excluded.notify_league_start,
        updated_at          = now();
end; $$;

-------------------------------------------------------------------------------
-- claim_saves_for_user(): now also claims the prefs row, so the category
-- settings follow the account onto a reinstall. Otherwise byte-for-byte 013.
-------------------------------------------------------------------------------

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
  update public.notification_prefs  set user_id = uid where device_id = p_device_id and user_id is null;
end; $$;

-------------------------------------------------------------------------------
-- notify_fighter_added_to_fight(): audience now gated by the DEVICE's
-- notify_new_fight pref instead of the per-row flag.
-------------------------------------------------------------------------------

create or replace function public.notify_fighter_added_to_fight() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  fighter_name_1 text;
  fighter_name_2 text;
  messages jsonb;
begin
  select name into fighter_name_1 from fighters where id = new.fighter1_id;
  select name into fighter_name_2 from fighters where id = new.fighter2_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'to', s.push_token,
    'title', 'Neuer Fight angekündigt',
    'body', fighter_name_1 || ' vs. ' || fighter_name_2
  )), '[]'::jsonb)
  into messages
  from public.saved_fighters s
  left join public.notification_prefs p on p.device_id = s.device_id
  where s.fighter_id in (new.fighter1_id, new.fighter2_id)
    and s.push_token is not null
    and coalesce(p.notify_new_fight, true);

  if jsonb_array_length(messages) > 0 then
    perform public.send_expo_push_chunked(messages, 'fighter_follow');
  end if;

  return new;
end;
$$;

alter function public.notify_fighter_added_to_fight() owner to postgres;
revoke execute on function public.notify_fighter_added_to_fight() from public, anon, authenticated;
grant execute on function public.notify_fighter_added_to_fight() to service_role, supabase_auth_admin;

-------------------------------------------------------------------------------
-- send_league_start_pushes(): the three audiences are now gated by the device's
-- category prefs — notify_league_start (org savers), notify_event_start (event
-- savers), notify_fight_start (fighter savers). Phase 1 (reconcile) is
-- byte-for-byte the 014 version; only Phase 2's audience queries change.
-------------------------------------------------------------------------------

create or replace function public.send_league_start_pushes()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  rec record;
  resp record;
  messages jsonb;
  event_messages jsonb;
  fighter_messages jsonb;
  new_request_ids bigint[];
  org_name text;
  req_id bigint;
  all_succeeded boolean;
  any_unresolved boolean;
begin
  if not pg_try_advisory_lock(hashtext('league-start-pushes')::bigint) then
    raise notice 'send_league_start_pushes: previous run still in progress, skipping tick';
    return;
  end if;

  ---------------------------------------------------------------------------
  -- Phase 1: reconcile requests issued by a previous tick.
  ---------------------------------------------------------------------------
  for rec in
    select id, league_start_push_request_ids, league_start_push_attempted_at
    from public.events
    where league_start_push_sent_at is null
      and league_start_push_request_ids is not null
  loop
    all_succeeded := true;
    any_unresolved := false;

    foreach req_id in array rec.league_start_push_request_ids
    loop
      select status_code, error_msg, timed_out
        into resp
      from net._http_response
      where id = req_id;

      if not found then
        any_unresolved := true;
        all_succeeded := false;
      elsif resp.status_code between 200 and 299 then
        -- this chunk ok
      else
        all_succeeded := false;
        raise notice 'League-start push chunk % failed for event % (status %, timed_out %, error %) — will retry',
          req_id, rec.id, resp.status_code, resp.timed_out, resp.error_msg;
      end if;
    end loop;

    if all_succeeded then
      update public.events
      set league_start_push_sent_at = now()
      where id = rec.id;
    elsif not any_unresolved
       or coalesce(rec.league_start_push_attempted_at, 'epoch'::timestamptz) < now() - interval '15 minutes' then
      update public.events
      set league_start_push_request_ids = null,
          league_start_push_attempted_at = null
      where id = rec.id;
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- Phase 2: issue pushes for events that just went live.
  ---------------------------------------------------------------------------
  for rec in select * from public.events_pending_league_start_push
  loop
    org_name := coalesce(rec.org_short_name, '');

    -- org savers
    select coalesce(jsonb_agg(jsonb_build_object(
             'to', s.push_token,
             'title', 'Es geht los!',
             'body', concat_ws(': ', nullif(org_name, ''), rec.name) || ' startet jetzt.'
           )), '[]'::jsonb)
      into messages
    from public.saved_organizations s
    left join public.notification_prefs p on p.device_id = s.device_id
    where s.organization_id = rec.organization_id
      and s.push_token is not null
      and coalesce(p.notify_league_start, true);

    -- event savers
    select coalesce(jsonb_agg(jsonb_build_object(
             'to', s.push_token,
             'title', 'Es geht los!',
             'body', rec.name || ' startet jetzt.'
           )), '[]'::jsonb)
      into event_messages
    from public.saved_events s
    left join public.notification_prefs p on p.device_id = s.device_id
    where s.event_id = rec.id
      and s.push_token is not null
      and coalesce(p.notify_event_start, true);

    -- fighter savers with a fight on this card
    select coalesce(jsonb_agg(jsonb_build_object(
             'to', s.push_token,
             'title', 'Es geht los!',
             'body', fi.name || ' kämpft jetzt bei ' || rec.name || '.'
           )), '[]'::jsonb)
      into fighter_messages
    from public.fights ft
    join public.saved_fighters s
      on s.fighter_id = ft.fighter1_id or s.fighter_id = ft.fighter2_id
    join public.fighters fi on fi.id = s.fighter_id
    left join public.notification_prefs p on p.device_id = s.device_id
    where ft.event_id = rec.id
      and ft.status is distinct from 'cancelled'
      and s.push_token is not null
      and coalesce(p.notify_fight_start, true);

    if jsonb_array_length(messages) = 0
       and jsonb_array_length(event_messages) = 0
       and jsonb_array_length(fighter_messages) = 0 then
      update public.events
      set league_start_push_sent_at = now()
      where id = rec.id;
    else
      new_request_ids :=
        public.send_expo_push_chunked(messages, 'league_start')
        || public.send_expo_push_chunked(event_messages, 'event_start')
        || public.send_expo_push_chunked(fighter_messages, 'fighter_follow');

      update public.events
      set league_start_push_request_ids = new_request_ids,
          league_start_push_attempted_at = now()
      where id = rec.id;
    end if;
  end loop;

  perform pg_advisory_unlock(hashtext('league-start-pushes')::bigint);

exception
  when others then
    perform pg_advisory_unlock(hashtext('league-start-pushes')::bigint);
    raise;
end;
$$;

alter function public.send_league_start_pushes() owner to postgres;
revoke execute on function public.send_league_start_pushes() from public, anon, authenticated;
grant execute on function public.send_league_start_pushes() to postgres, service_role;

-------------------------------------------------------------------------------
-- Retire the per-object notify model.
--
-- The list_saved_* return types change, so they have to be dropped and
-- recreated rather than replaced. Everything below is the 013 body minus the
-- notify columns.
-------------------------------------------------------------------------------

drop function if exists public.set_fighter_notify(text, uuid, boolean, boolean);
drop function if exists public.set_event_notify(text, uuid, boolean);
drop function if exists public.set_organization_notify(text, uuid, boolean);

drop function if exists public.list_saved_fighters(text);
drop function if exists public.list_saved_events(text);
drop function if exists public.list_saved_organizations(text);

create function public.list_saved_fighters(p_device_id text)
returns table (
  fighter_id uuid,
  has_push boolean,
  created_at timestamptz)
language sql security definer set search_path to 'public' as $$
  select distinct on (s.fighter_id)
         s.fighter_id, s.push_token is not null as has_push, s.created_at
  from public.saved_fighters s
  where s.device_id = p_device_id
     or (auth.uid() is not null and s.user_id = auth.uid())
  order by s.fighter_id, (s.device_id = p_device_id) desc, s.created_at;
$$;

create function public.list_saved_events(p_device_id text)
returns table (
  event_id uuid,
  has_push boolean,
  created_at timestamptz)
language sql security definer set search_path to 'public' as $$
  select distinct on (s.event_id)
         s.event_id, s.push_token is not null as has_push, s.created_at
  from public.saved_events s
  where s.device_id = p_device_id
     or (auth.uid() is not null and s.user_id = auth.uid())
  order by s.event_id, (s.device_id = p_device_id) desc, s.created_at;
$$;

create function public.list_saved_organizations(p_device_id text)
returns table (
  organization_id uuid,
  has_push boolean,
  created_at timestamptz)
language sql security definer set search_path to 'public' as $$
  select distinct on (s.organization_id)
         s.organization_id, s.push_token is not null as has_push, s.created_at
  from public.saved_organizations s
  where s.device_id = p_device_id
     or (auth.uid() is not null and s.user_id = auth.uid())
  order by s.organization_id, (s.device_id = p_device_id) desc, s.created_at;
$$;

alter table public.saved_fighters      drop column if exists notify_new_fight;
alter table public.saved_fighters      drop column if exists notify_fight_start;
alter table public.saved_events        drop column if exists notify_event_start;
alter table public.saved_organizations drop column if exists notify_event_start;

-------------------------------------------------------------------------------
-- Ownership + grants for the new and recreated RPCs.
-------------------------------------------------------------------------------

do $$
declare fn text;
begin
  foreach fn in array array[
    'get_notification_prefs(text)',
    'set_notification_prefs(text, boolean, boolean, boolean, boolean)',
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
