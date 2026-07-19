-- Observability for the league-start push, plus a DRY-up of its window logic.
--
-- Why: 006 moved the push into pg_cron, where it runs unattended. If that job
-- stops firing — disabled, erroring, extension dropped — nothing surfaces it;
-- the failure mode is silence. This adds a single callable health check so the
-- state can be read through the normal API with a service-role key, without
-- needing a direct Postgres connection (the cron schema is not reachable via
-- PostgREST, so `select ... from cron.job` is not an option for a client).
--
-- It also removes a duplication introduced by 006: the "which events are
-- waiting for a league-start push" predicate would otherwise be written out
-- twice, once in the sender and once here. docs/ARCHITECTURE.md already
-- records a case of this exact drift (the ~6 h card-duration buffer living in
-- three places), so the predicate moves into one view that both read.

-- Events that should get a league-start push right now: started within the
-- last 30 minutes, not cancelled, not already sent, nothing in flight.
--
-- The 30-minute window is deliberately NOT the ~6 h card-duration buffer used
-- by isEventLive()/sync-live-event.ts — see the rationale in 006. Change it
-- here and both the sender and the health check follow.
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
        ) > now() - interval '30 minutes';

-- Operational data, not app data: keep it off the public API surface. The
-- underlying events are world-readable anyway, so this is tidiness rather
-- than a security boundary.
revoke all on public.events_pending_league_start_push from anon, authenticated;
grant select on public.events_pending_league_start_push to postgres, service_role;


-- Re-point the sender at the view. Behaviour is intentionally unchanged;
-- only the source of the phase-2 predicate moves.
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
      -- Response not in yet. pg_net retains responses for ~6 h, so if we
      -- still see nothing well past that, treat the attempt as lost and
      -- release it — phase 2 decides whether re-sending is still appropriate.
      if coalesce(rec.league_start_push_attempted_at, 'epoch'::timestamptz)
           < now() - interval '15 minutes' then
        update public.events
        set league_start_push_request_id = null,
            league_start_push_attempted_at = null
        where id = rec.id;
      end if;

    elsif resp.status_code between 200 and 299 then
      update public.events
      set league_start_push_sent_at = now()
      where id = rec.id;

    else
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
  for rec in select * from public.events_pending_league_start_push
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
    perform pg_advisory_unlock(hashtext('league-start-pushes')::bigint);
    raise;
end;
$$;

alter function public.send_league_start_pushes() owner to postgres;

-- SECURITY FIX for 006. That migration revoked EXECUTE from `anon,
-- authenticated` only, reasoning from the lesson in migrations_archive/
-- 004_fix_execute_revoke_regression.sql that a broad `revoke ... from public`
-- is dangerous. That reasoning was misapplied: Postgres grants EXECUTE on new
-- functions to PUBLIC by default, and revoking from individual roles does not
-- remove an inherited PUBLIC grant. anon therefore retained EXECUTE and could
-- invoke the push sender over PostgREST — verified as HTTP 204 against a
-- local instance before this fix.
--
-- `revoke from public` is correct *here*, and is what the pre-existing
-- notify_fighter_added_to_fight() already does. 004's regression was specific
-- to a function fired by a Supabase-internal role (supabase_auth_admin, on
-- auth.users insert) that the broad revoke stripped. These two functions have
-- no such caller: pg_cron executes as the job's owner (postgres), and a
-- function's owner retains EXECUTE regardless of grants.
-- Both mechanisms must be closed, and they are independent:
--   * Postgres grants EXECUTE on a new function to PUBLIC by default;
--   * Supabase additionally grants EXECUTE to anon/authenticated via ALTER
--     DEFAULT PRIVILEGES on the public schema.
-- Revoking only from PUBLIC leaves Supabase's explicit anon grant in place;
-- revoking only from anon/authenticated leaves the PUBLIC inheritance. Both
-- were observed here against a local instance.
revoke execute on function public.send_league_start_pushes() from public, anon, authenticated;
grant execute on function public.send_league_start_pushes() to postgres, service_role;


-- One row, always — every field is a scalar subquery so a job that has never
-- run yields nulls rather than an empty result.
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
      where league_start_push_request_id is not null
        and league_start_push_sent_at is null);
$$;

comment on function public.league_start_push_health() is
  'Operational health of the pg_cron league-start push job. Expected: job_scheduled and job_active true, last_run_status "succeeded", minutes_since_last_run under ~2.';

alter function public.league_start_push_health() owner to postgres;

-- Same two independent mechanisms as above — revoke from both PUBLIC and the
-- named roles.
revoke execute on function public.league_start_push_health() from public, anon, authenticated;
grant execute on function public.league_start_push_health() to postgres, service_role;
