-- Push delivery: chunk to Expo's 100-message limit, read delivery receipts,
-- clean up stale (DeviceNotRegistered) tokens.
--
-- Why: notify_fighter_added_to_fight() and send_league_start_pushes() each
-- build ONE net.http_post containing every matching subscriber. Expo's push
-- API caps a single request at 100 messages — a hard cliff, not a gradual
-- degradation, and both paths are past it the moment a fighter/org has more
-- than 100 followers. Separately, Expo returns HTTP 200 even when individual
-- messages fail (most importantly DeviceNotRegistered, i.e. the app was
-- uninstalled) — reading that requires polling Expo's /getReceipts endpoint
-- ~15+ minutes after sending, which neither path does today, so stale tokens
-- accumulate in push_subscriptions/organization_follows forever.
--
-- Both gaps share one missing piece: neither path tracks individual messages
-- past the point of firing net.http_post. This migration adds that tracking
-- once, shared by both callers, instead of patching each path separately.
--
-- Pipeline (mirrors the two-phase async pattern 006 already established for
-- pg_net, extended one step further to cover receipts too):
--   1. send_expo_push_chunked()       — splits messages into <=100 chunks,
--                                        fires net.http_post per chunk,
--                                        records each request in
--                                        push_send_batches.
--   2. reconcile_push_send_batches()  — once a batch's response lands in
--                                        net._http_response, parses Expo's
--                                        per-message tickets into
--                                        push_tickets (one row per message).
--   3. request_push_receipts()        — >=20 min after a ticket was created,
--                                        batches ticket ids (<=1000, Expo's
--                                        limit) and POSTs /getReceipts,
--                                        recording the request in
--                                        push_receipt_batches.
--   4. reconcile_push_receipts()      — once a receipt-batch response lands,
--                                        updates push_tickets and deletes any
--                                        push_subscriptions/
--                                        organization_follows row whose token
--                                        came back DeviceNotRegistered.
-- push_maintenance() runs all four in order and is what pg_cron calls.

-------------------------------------------------------------------------------
-- Tables. All three are purely operational bookkeeping, never read by the
-- app — RLS enabled, no policies, no anon/authenticated grants, same
-- treatment as events_pending_league_start_push (007).
-------------------------------------------------------------------------------

create table if not exists public.push_send_batches (
  net_request_id bigint primary key,
  push_tokens text[] not null,
  source text not null check (source in ('fighter_follow', 'league_start')),
  created_at timestamptz not null default now()
);

alter table public.push_send_batches enable row level security;
revoke all on public.push_send_batches from anon, authenticated;
grant all on public.push_send_batches to postgres, service_role;

create table if not exists public.push_tickets (
  ticket_id text primary key,
  push_token text not null,
  send_status text not null check (send_status in ('ok', 'error')),
  send_error_code text,
  created_at timestamptz not null default now(),
  receipt_status text check (receipt_status in ('ok', 'error')),
  receipt_error_code text,
  receipt_checked_at timestamptz
);

comment on table public.push_tickets is
  'One row per individual Expo push message ticket, populated by reconcile_push_send_batches(). receipt_checked_at null = /getReceipts not polled yet.';

-- request_push_receipts() batches on exactly this predicate every tick.
create index if not exists idx_push_tickets_pending_receipt
  on public.push_tickets (created_at)
  where receipt_checked_at is null;

alter table public.push_tickets enable row level security;
revoke all on public.push_tickets from anon, authenticated;
grant all on public.push_tickets to postgres, service_role;

create table if not exists public.push_receipt_batches (
  net_request_id bigint primary key,
  ticket_ids text[] not null,
  created_at timestamptz not null default now()
);

alter table public.push_receipt_batches enable row level security;
revoke all on public.push_receipt_batches from anon, authenticated;
grant all on public.push_receipt_batches to postgres, service_role;

-------------------------------------------------------------------------------
-- send_expo_push_chunked(): shared replacement for both paths' inline
-- net.http_post. Returns the request ids it generated so a caller that needs
-- its own "did this succeed" tracking (send_league_start_pushes) can record
-- them; a caller that doesn't (notify_fighter_added_to_fight) just discards
-- the return value via `perform`.
-------------------------------------------------------------------------------

create or replace function public.send_expo_push_chunked(messages jsonb, source text)
returns bigint[]
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  chunk jsonb;
  chunk_tokens text[];
  request_id bigint;
  request_ids bigint[] := '{}';
  i int;
  n int;
begin
  n := jsonb_array_length(messages);
  i := 0;
  while i < n loop
    select jsonb_agg(m)
      into chunk
    from jsonb_array_elements(messages) with ordinality as t(m, ord)
    where ord > i and ord <= i + 100;

    select array_agg(m ->> 'to')
      into chunk_tokens
    from jsonb_array_elements(chunk) as m;

    request_id := net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      body := chunk
    );

    insert into public.push_send_batches (net_request_id, push_tokens, source)
    values (request_id, chunk_tokens, source);

    request_ids := request_ids || request_id;
    i := i + 100;
  end loop;

  return request_ids;
end;
$$;

alter function public.send_expo_push_chunked(jsonb, text) owner to postgres;
revoke execute on function public.send_expo_push_chunked(jsonb, text) from public, anon, authenticated;
grant execute on function public.send_expo_push_chunked(jsonb, text) to postgres, service_role;

-------------------------------------------------------------------------------
-- reconcile_push_send_batches(): batch response -> per-message tickets.
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
      -- Response not in yet; picked up again next tick. No grace-period
      -- give-up here, unlike league-start's own tracking — an unreconciled
      -- batch has no user-facing deadline, it just stays pending.
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
          -- Expo already knows this token is dead at send time (no ticket
          -- issued) — no receipt to wait for, clean up immediately.
          delete from public.push_subscriptions where push_token = token;
          delete from public.organization_follows where push_token = token;
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
-- request_push_receipts(): poll /getReceipts for tickets old enough to check.
-------------------------------------------------------------------------------

create or replace function public.request_push_receipts()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ids text[];
  request_id bigint;
begin
  loop
    select array_agg(ticket_id)
      into ids
    from (
      select ticket_id
      from public.push_tickets
      where receipt_checked_at is null
        and created_at < now() - interval '20 minutes'
      limit 1000
    ) t;

    exit when ids is null or array_length(ids, 1) = 0;

    request_id := net.http_post(
      url := 'https://exp.host/--/api/v2/push/getReceipts',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      body := jsonb_build_object('ids', to_jsonb(ids))
    );

    insert into public.push_receipt_batches (net_request_id, ticket_ids)
    values (request_id, ids);

    -- Stamp checked_at now (not once the receipt reconciles) so the same
    -- tickets aren't re-selected into another /getReceipts request next
    -- tick while this one is still in flight. reconcile_push_receipts()
    -- overwrites it with the true check time once the response lands.
    update public.push_tickets
    set receipt_checked_at = now()
    where ticket_id = any(ids);

    -- Fewer than 1000 means that was the last page.
    exit when array_length(ids, 1) < 1000;
  end loop;
end;
$$;

alter function public.request_push_receipts() owner to postgres;
revoke execute on function public.request_push_receipts() from public, anon, authenticated;
grant execute on function public.request_push_receipts() to postgres, service_role;

-------------------------------------------------------------------------------
-- reconcile_push_receipts(): receipt response -> push_tickets + stale-token
-- cleanup.
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
          delete from public.push_subscriptions where push_token = dead_token;
          delete from public.organization_follows where push_token = dead_token;
        end if;
      end loop;
    else
      raise notice 'push receipt batch % failed with status %, tickets will be retried', batch.net_request_id, resp.status_code;
      -- Let these tickets be picked up by request_push_receipts() again.
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

-------------------------------------------------------------------------------
-- push_maintenance(): orchestrator, called by pg_cron.
-------------------------------------------------------------------------------

create or replace function public.push_maintenance()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not pg_try_advisory_lock(hashtext('push-maintenance')::bigint) then
    raise notice 'push_maintenance: previous run still in progress, skipping tick';
    return;
  end if;

  perform public.reconcile_push_send_batches();
  perform public.request_push_receipts();
  perform public.reconcile_push_receipts();

  perform pg_advisory_unlock(hashtext('push-maintenance')::bigint);

exception
  when others then
    perform pg_advisory_unlock(hashtext('push-maintenance')::bigint);
    raise;
end;
$$;

alter function public.push_maintenance() owner to postgres;
revoke execute on function public.push_maintenance() from public, anon, authenticated;
grant execute on function public.push_maintenance() to postgres, service_role;

-------------------------------------------------------------------------------
-- Re-point notify_fighter_added_to_fight() at the shared chunked sender.
-- Behaviour otherwise unchanged.
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
    'to', ps.push_token,
    'title', 'Neuer Fight angekündigt',
    'body', fighter_name_1 || ' vs. ' || fighter_name_2
  )), '[]'::jsonb)
  into messages
  from push_subscriptions ps
  where ps.fighter_id in (new.fighter1_id, new.fighter2_id);

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
-- events.league_start_push_request_id (scalar) -> _request_ids (array), since
-- send_league_start_pushes() now chunks and can issue >1 request per event.
-------------------------------------------------------------------------------

alter table public.events
  add column if not exists league_start_push_request_ids bigint[];

update public.events
set league_start_push_request_ids = array[league_start_push_request_id]
where league_start_push_request_id is not null;

-- events_pending_league_start_push (007) is defined in terms of the scalar
-- column via its WHERE clause, which blocks dropping it. Re-point the view
-- at the array column first — same predicate, just "is null" either way.
create or replace view public.events_pending_league_start_push as
  select
    e.id,
    e.name,
    e.organization_id,
    o.short_name as org_short_name,
    coalesce(
      e.early_prelims_start_time,
      e.prelims_start_time,
      e.main_card_start_time,
      e.event_date
    ) as effective_start_time
  from public.events e
  left join public.organizations o on o.id = e.organization_id
  where e.league_start_push_sent_at is null
    and e.league_start_push_request_ids is null
    and e.status is distinct from 'cancelled'
    and coalesce(
          e.early_prelims_start_time,
          e.prelims_start_time,
          e.main_card_start_time,
          e.event_date
        ) <= now()
    and coalesce(
          e.early_prelims_start_time,
          e.prelims_start_time,
          e.main_card_start_time,
          e.event_date
        ) > now() - interval '30 minutes';

revoke all on public.events_pending_league_start_push from anon, authenticated;
grant select on public.events_pending_league_start_push to postgres, service_role;

alter table public.events drop column if exists league_start_push_request_id;

comment on column public.events.league_start_push_request_ids is
  'In-flight pg_net request ids (one per <=100-message chunk) for the league-start push; reconciled against net._http_response by send_league_start_pushes().';

drop index if exists idx_events_league_start_push_pending;
create index if not exists idx_events_league_start_push_pending
  on public.events (event_date)
  where league_start_push_sent_at is null;

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
  -- Phase 1: reconcile requests issued by a previous tick. An event is only
  -- stamped sent once EVERY chunk for it succeeded; any failure or
  -- still-missing response (past the grace window) clears the whole array so
  -- phase 2 retries the event from scratch.
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
      -- Either every chunk resolved and at least one failed, or we're still
      -- waiting past the grace window — either way, release for retry.
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

    select coalesce(jsonb_agg(jsonb_build_object(
             'to', f.push_token,
             'title', 'Es geht los!',
             'body', concat_ws(': ', nullif(org_name, ''), rec.name) || ' startet jetzt.'
           )), '[]'::jsonb)
      into messages
    from public.organization_follows f
    where f.organization_id = rec.organization_id;

    if jsonb_array_length(messages) = 0 then
      update public.events
      set league_start_push_sent_at = now()
      where id = rec.id;
    else
      new_request_ids := public.send_expo_push_chunked(messages, 'league_start');

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
-- league_start_push_health(): requests_in_flight now checks the array column.
-------------------------------------------------------------------------------

create or replace function public.league_start_push_health()
returns table (
  job_scheduled boolean,
  job_active boolean,
  last_run_at timestamptz,
  last_run_status text,
  last_run_message text,
  minutes_since_last_run numeric,
  events_awaiting_push integer,
  requests_in_flight integer
)
language sql
security definer
set search_path to 'public'
as $$
  with j as (
    select jobid, active from cron.job where jobname = 'league-start-pushes'
  ),
  last_run as (
    select d.start_time, d.status, d.return_message
    from cron.job_run_details d
    where d.jobid = (select jobid from j)
    order by d.start_time desc
    limit 1
  )
  select
    (select count(*) from j) > 0,
    coalesce((select active from j), false),
    (select start_time from last_run),
    (select status from last_run),
    (select return_message from last_run),
    round((extract(epoch from (now() - (select start_time from last_run))) / 60.0)::numeric, 1),
    (select count(*)::int from public.events_pending_league_start_push),
    (select count(*)::int from public.events
      where league_start_push_request_ids is not null
        and league_start_push_sent_at is null);
$$;

comment on function public.league_start_push_health() is
  'Operational health of the pg_cron league-start push job. Expected: job_scheduled and job_active true, last_run_status "succeeded", minutes_since_last_run under ~2.';

alter function public.league_start_push_health() owner to postgres;
revoke execute on function public.league_start_push_health() from public, anon, authenticated;
grant execute on function public.league_start_push_health() to postgres, service_role;

-------------------------------------------------------------------------------
-- Register the push-maintenance cron job. Every 5 minutes: receipts have a
-- 20-minute floor before anything is actionable, so 1-minute cadence (like
-- league-start-pushes) would just be wasted ticks.
-------------------------------------------------------------------------------

do $$
begin
  perform cron.unschedule('push-maintenance');
exception
  when others then
    null;
end
$$;

select cron.schedule(
  'push-maintenance',
  '*/5 * * * *',
  $$select public.push_maintenance();$$
);
