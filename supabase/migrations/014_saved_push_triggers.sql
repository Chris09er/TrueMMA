-- Gruppe C, Phase 2: re-point the push path at the saved_* tables.
--
-- Phase 1 (013) created saved_fighters/saved_events/saved_organizations but
-- nothing read them yet. This migration rewrites the four SQL functions that
-- drive push so the merged "heart" model actually delivers:
--   * notify_fighter_added_to_fight()  — "Neuer Fight angekündigt" on booking
--   * send_league_start_pushes()       — "Es geht los!" when an event starts
--   * reconcile_push_send_batches()    — dead-token cleanup at send time
--   * reconcile_push_receipts()        — dead-token cleanup at receipt time
--
-- The hardened chunking/receipts machinery (008) is untouched — only the
-- SOURCE queries change: instead of push_subscriptions / organization_follows,
-- the audiences come from saved_* filtered on the per-type notify_* flag and a
-- non-null push_token.
--
-- Two behavioural changes worth calling out:
--
-- 1. saved_events becomes a BRAND-NEW push audience. Events had no server push
--    before Gruppe C — only org-level league-start. Saving an event now sends
--    its own "Es geht los!" when that specific event starts, reusing the exact
--    same events_pending_league_start_push gate (a saved event, a saved org
--    whose event it is, and a saved fighter on the card can therefore each fire
--    at the same moment — up to three messages. This is the same duplicate the
--    org+fighter overlap already produced in 009, accepted as minor rather than
--    adding cross-audience dedup; it is now three-way.) Tagged 'event_start',
--    which requires widening the push_send_batches.source CHECK.
--
-- 2. Dead-token (DeviceNotRegistered) cleanup changes shape. In the old model
--    the follow row WAS the push subscription, so deleting it on an uninstall
--    was correct. Now a saved_* row is ALSO the user's list entry, so blindly
--    deleting it would wipe a logged-in user's saved list on an uninstall — a
--    regression versus the old favorites, which survived. retire_dead_push_
--    token() therefore DELETEs only anonymous rows (user_id null — that device
--    is gone and unreachable, the row can never be seen again) and merely
--    NULLs the token on logged-in rows (their saved list survives cross-device;
--    push just stops until a live device re-attaches a token).
--
-- The five legacy tables are intentionally NOT dropped here — that is a
-- separate follow-up once this has been verified on a real build, so a rollback
-- of this migration doesn't strand data. After this runs, nothing reads them.

-------------------------------------------------------------------------------
-- Widen the send-batch source tag for the new event-start audience.
-------------------------------------------------------------------------------

alter table public.push_send_batches drop constraint push_send_batches_source_check;
alter table public.push_send_batches add constraint push_send_batches_source_check
  check (source in ('fighter_follow', 'league_start', 'event_start'));

-------------------------------------------------------------------------------
-- retire_dead_push_token(): shared DeviceNotRegistered handler. Called from
-- both reconcile paths (each already SECURITY DEFINER, owner postgres), so this
-- runs in the postgres context and needs no elevation of its own.
-------------------------------------------------------------------------------

create or replace function public.retire_dead_push_token(dead_token text)
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  -- Anonymous rows for a dead token are unreachable forever (device_id went
  -- with the uninstall, no account to re-attach to) → remove them.
  delete from public.saved_fighters      where push_token = dead_token and user_id is null;
  delete from public.saved_events        where push_token = dead_token and user_id is null;
  delete from public.saved_organizations where push_token = dead_token and user_id is null;
  -- Logged-in rows survive as the account's cross-device saved list; just clear
  -- the dead token so they stop generating push until a live device re-attaches.
  update public.saved_fighters      set push_token = null where push_token = dead_token;
  update public.saved_events        set push_token = null where push_token = dead_token;
  update public.saved_organizations set push_token = null where push_token = dead_token;
end;
$$;

alter function public.retire_dead_push_token(text) owner to postgres;
revoke execute on function public.retire_dead_push_token(text) from public, anon, authenticated;
grant execute on function public.retire_dead_push_token(text) to postgres, service_role;

-------------------------------------------------------------------------------
-- notify_fighter_added_to_fight(): "Neuer Fight angekündigt" on fight insert.
-- Audience: saved_fighters for either fighter, with a token and notify_new_fight.
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
  where s.fighter_id in (new.fighter1_id, new.fighter2_id)
    and s.push_token is not null
    and s.notify_new_fight;

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
-- send_league_start_pushes(): three audiences when an event goes live —
--   league_start : savers of the org (notify_event_start)
--   event_start  : savers of THIS event (notify_event_start)   [NEW]
--   fighter_follow: savers of a fighter on this card (notify_fight_start)
-- Phase 1 (reconcile) is byte-for-byte the 009 version; only Phase 2's audience
-- queries change.
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
    where s.organization_id = rec.organization_id
      and s.push_token is not null
      and s.notify_event_start;

    -- event savers (new audience)
    select coalesce(jsonb_agg(jsonb_build_object(
             'to', s.push_token,
             'title', 'Es geht los!',
             'body', rec.name || ' startet jetzt.'
           )), '[]'::jsonb)
      into event_messages
    from public.saved_events s
    where s.event_id = rec.id
      and s.push_token is not null
      and s.notify_event_start;

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
    where ft.event_id = rec.id
      and ft.status is distinct from 'cancelled'
      and s.push_token is not null
      and s.notify_fight_start;

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
-- reconcile_push_send_batches(): unchanged except the DeviceNotRegistered
-- branch now calls retire_dead_push_token() against saved_*.
-------------------------------------------------------------------------------

create or replace function public.reconcile_push_send_batches()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  batch record;
  resp record;
  entry jsonb;
  idx int;
  token text;
  tix_id text;
  tix_status text;
  err_code text;
begin
  for batch in select * from public.push_send_batches
  loop
    select status_code, content
      into resp
    from net._http_response
    where id = batch.net_request_id;

    if not found then
      continue;
    end if;

    if resp.status_code between 200 and 299 then
      idx := 1;
      for entry in select * from jsonb_array_elements((resp.content::jsonb) -> 'data')
      loop
        token := batch.push_tokens[idx];
        tix_status := entry ->> 'status';
        tix_id := entry ->> 'id';
        err_code := entry -> 'details' ->> 'error';

        if tix_id is not null then
          insert into public.push_tickets (ticket_id, push_token, send_status, send_error_code)
          values (tix_id, token, tix_status, err_code)
          on conflict (ticket_id) do nothing;
        elsif err_code = 'DeviceNotRegistered' then
          perform public.retire_dead_push_token(token);
        else
          raise notice 'push send error for token % (batch %): % / %', token, batch.net_request_id, tix_status, err_code;
        end if;

        idx := idx + 1;
      end loop;
    else
      raise notice 'push send batch % failed with status %, dropping (no per-message tracking possible)', batch.net_request_id, resp.status_code;
    end if;

    delete from public.push_send_batches where net_request_id = batch.net_request_id;
  end loop;
end;
$$;

alter function public.reconcile_push_send_batches() owner to postgres;
revoke execute on function public.reconcile_push_send_batches() from public, anon, authenticated;
grant execute on function public.reconcile_push_send_batches() to postgres, service_role;

-------------------------------------------------------------------------------
-- reconcile_push_receipts(): unchanged except the DeviceNotRegistered branch.
-------------------------------------------------------------------------------

create or replace function public.reconcile_push_receipts()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  batch record;
  resp record;
  key text;
  entry jsonb;
  r_status text;
  err_code text;
  dead_token text;
begin
  for batch in select * from public.push_receipt_batches
  loop
    select status_code, content
      into resp
    from net._http_response
    where id = batch.net_request_id;

    if not found then
      continue;
    end if;

    if resp.status_code between 200 and 299 then
      for key, entry in select * from jsonb_each((resp.content::jsonb) -> 'data')
      loop
        r_status := entry ->> 'status';
        err_code := entry -> 'details' ->> 'error';

        update public.push_tickets
        set receipt_status = r_status,
            receipt_error_code = err_code,
            receipt_checked_at = now()
        where ticket_id = key
        returning push_token into dead_token;

        if err_code = 'DeviceNotRegistered' and dead_token is not null then
          perform public.retire_dead_push_token(dead_token);
        end if;
      end loop;
    else
      raise notice 'push receipt batch % failed with status %, tickets will be retried', batch.net_request_id, resp.status_code;
      update public.push_tickets
      set receipt_checked_at = null
      where ticket_id = any(batch.ticket_ids)
        and receipt_status is null;
    end if;

    delete from public.push_receipt_batches where net_request_id = batch.net_request_id;
  end loop;
end;
$$;

alter function public.reconcile_push_receipts() owner to postgres;
revoke execute on function public.reconcile_push_receipts() from public, anon, authenticated;
grant execute on function public.reconcile_push_receipts() to postgres, service_role;
