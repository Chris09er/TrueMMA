-- League-start push: move the trigger off GitHub Actions onto pg_cron.
--
-- Why: the push used to fire from scripts/sync-live-event.ts, driven by a
-- `*/5 * * * *` GitHub Actions schedule. Measured 2026-07-19, GitHub actually
-- delivers that roughly hourly (45-75 min gaps, up to 3.7 h observed) because
-- it sheds high-frequency schedule triggers on public repos. A "starts now"
-- push arriving an hour late is worse than none. pg_cron runs inside the
-- database on a real timer, so it actually ticks every minute.
--
-- Only the *push* moves here. The live data refresh (re-fetching an event's
-- fights from balldontlie) stays in sync-live-event.ts, because that needs an
-- outbound API call with an API key and JSON mapping — work that belongs in
-- Node, not PL/pgSQL. Data freshness is also far less latency-sensitive than
-- a "it's starting" notification.
--
-- Delivery model: net.http_post is asynchronous and, per pg_net's docs, does
-- not even start the request until the surrounding transaction commits — so a
-- single pass cannot know whether the push succeeded. This is therefore a
-- two-phase design:
--   Phase 1 reconciles requests issued by an earlier run, by looking their
--           request_id up in net._http_response.
--   Phase 2 issues new requests for events that just went live.
-- An event is only stamped as notified once a 2xx response is confirmed; a
-- failure clears the attempt so the next tick retries. This preserves the
-- retry-on-failure property the Node implementation had.

-- Supabase's documented install form is `with schema pg_catalog` (see their
-- Cron guide). Note this registers the *extension* against pg_catalog while
-- its actual scheduling functions and the job table still live in a separate
-- `cron` schema — the same split already documented for pg_net in
-- docs/ARCHITECTURE.md (registered in public, functions in `net`). So the
-- calls below are `cron.schedule` / `cron.job`, not `pg_catalog.*`.
create extension if not exists pg_cron with schema pg_catalog;

-- Tracks the in-flight pg_net request between phase 2 (issue) and phase 1
-- (reconcile). Null again once reconciled or given up on.
-- events.league_start_push_sent_at already exists and stays the single source
-- of truth for "this event's league-start push is done".
alter table public.events
  add column if not exists league_start_push_request_id bigint,
  add column if not exists league_start_push_attempted_at timestamptz;

comment on column public.events.league_start_push_request_id is
  'In-flight pg_net request id for the league-start push; reconciled against net._http_response by send_league_start_pushes().';

-- Partial index: every tick scans for events needing a push or a reconcile.
-- Both predicates key off league_start_push_sent_at is null, and the vast
-- majority of rows have it set (or are long past), so keep the index tiny.
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
  new_request_id bigint;
  org_name text;
begin
  -- Guard against two ticks overlapping. The work here is idempotent per
  -- event, but two concurrent passes could both read a row in phase 2 before
  -- either writes the request id, and double-send. Skip rather than queue:
  -- the next tick is a minute away, and the phase 2 window is 30 minutes.
  if not pg_try_advisory_lock(hashtext('league-start-pushes')::bigint) then
    raise notice 'send_league_start_pushes: previous run still in progress, skipping tick';
    return;
  end if;

  ---------------------------------------------------------------------------
  -- Phase 1: reconcile requests issued by a previous tick.
  ---------------------------------------------------------------------------
  for rec in
    select id, league_start_push_request_id, league_start_push_attempted_at
    from public.events
    where league_start_push_sent_at is null
      and league_start_push_request_id is not null
  loop
    select status_code, error_msg, timed_out
      into resp
    from net._http_response
    where id = rec.league_start_push_request_id;

    if not found then
      -- Response not in yet. pg_net only retains responses for ~6 h, so if
      -- we still see nothing well past that, treat the attempt as lost and
      -- release it — phase 2 decides whether re-sending is still appropriate.
      if coalesce(rec.league_start_push_attempted_at, 'epoch'::timestamptz)
           < now() - interval '15 minutes' then
        update public.events
        set league_start_push_request_id = null,
            league_start_push_attempted_at = null
        where id = rec.id;
      end if;

    elsif resp.status_code between 200 and 299 then
      -- Confirmed delivered to Expo. Keep the request id for auditability.
      update public.events
      set league_start_push_sent_at = now()
      where id = rec.id;

    else
      -- Non-2xx, timeout, or transport error: release so phase 2 can retry
      -- while the event is still within its notification window.
      raise notice 'League-start push failed for event % (status %, timed_out %, error %) — will retry',
        rec.id, resp.status_code, resp.timed_out, resp.error_msg;
      update public.events
      set league_start_push_request_id = null,
          league_start_push_attempted_at = null
      where id = rec.id;
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- Phase 2: issue pushes for events that just went live.
  ---------------------------------------------------------------------------
  -- Deliberately a 30-minute window, NOT the ~6 h card-duration buffer used
  -- by isEventLive()/sync-live-event.ts. Those answer "is this card still on
  -- air", which is the right question for refreshing fight data. This answers
  -- "did it just start", and a push claiming an event is starting has no
  -- business firing five hours in. If the database was unreachable for longer
  -- than this window, the push is correctly dropped rather than sent late.
  for rec in
    select e.id,
           e.name,
           e.organization_id,
           o.short_name as org_short_name
    from public.events e
    left join public.organizations o on o.id = e.organization_id
    where e.league_start_push_sent_at is null
      and e.league_start_push_request_id is null
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
          ) > now() - interval '30 minutes'
  loop
    org_name := coalesce(rec.org_short_name, '');

    select coalesce(jsonb_agg(jsonb_build_object(
             'to', f.push_token,
             'title', 'Es geht los!',
             -- concat_ws skips NULL parts, so an org with no short_name
             -- yields "Event startet jetzt." rather than ": Event ...".
             'body', concat_ws(': ', nullif(org_name, ''), rec.name) || ' startet jetzt.'
           )), '[]'::jsonb)
      into messages
    from public.organization_follows f
    where f.organization_id = rec.organization_id;

    if jsonb_array_length(messages) = 0 then
      -- Nobody follows this org — nothing to send, but mark it done so we
      -- stop reconsidering this event every minute.
      update public.events
      set league_start_push_sent_at = now()
      where id = rec.id;
    else
      new_request_id := net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
        body := messages
      );

      update public.events
      set league_start_push_request_id = new_request_id,
          league_start_push_attempted_at = now()
      where id = rec.id;
    end if;
  end loop;

  perform pg_advisory_unlock(hashtext('league-start-pushes')::bigint);

exception
  when others then
    -- Session-level advisory locks would be released when pg_cron's backend
    -- ends anyway, but releasing explicitly keeps a failed tick from blocking
    -- the next one if the backend is pooled/reused.
    perform pg_advisory_unlock(hashtext('league-start-pushes')::bigint);
    raise;
end;
$$;

alter function public.send_league_start_pushes() owner to postgres;

-- Narrow revoke only, per the lesson recorded in migrations_archive/
-- 004_fix_execute_revoke_regression.sql: `revoke ... from public` also strips
-- the internal roles that actually invoke the function (here: postgres, via
-- pg_cron), which previously broke signup outright. Revoke from the
-- externally-reachable roles and nothing else.
revoke execute on function public.send_league_start_pushes() from anon, authenticated;
grant execute on function public.send_league_start_pushes() to postgres, service_role;

-- Re-running this migration must not stack duplicate jobs. cron.unschedule()
-- raises if the job is absent, so delete by name instead of guarding with an
-- exception block.
delete from cron.job where jobname = 'league-start-pushes';

select cron.schedule(
  'league-start-pushes',
  '* * * * *',
  $$select public.send_league_start_pushes();$$
);
