-- Fighter-follow push on fight start, not just on booking.
--
-- Until now, following a fighter (push_subscriptions) only triggered
-- notify_fighter_added_to_fight() — fires once, the moment a fight row
-- referencing that fighter is inserted ("Neuer Fight angekündigt"). User
-- feedback (2026-07-20): also notify when that fight actually starts,
-- parallel to what league-follows already get from send_league_start_pushes().
--
-- Granularity: per-EVENT, not per-fight. balldontlie gives broadcast segment
-- start times (early_prelims/prelims/main_card_start_time), never a start
-- time for an individual fight — there is no "this fight starts at X" to key
-- off. So this reuses exactly the same "has this event's broadcast started"
-- gate send_league_start_pushes() already established (30-minute window off
-- events_pending_league_start_push), just with a second audience: followers
-- of any fighter who has a non-cancelled fight on that event, not just
-- followers of the org. A user following both gets two separate messages
-- (one "the event is starting", one "your fighter is on this card") —
-- accepted as a minor duplicate rather than adding dedup complexity for a
-- rare overlap.
--
-- No new tables/columns: this is gated by the exact same
-- league_start_push_sent_at / _request_ids tracking as the org-follow push,
-- since "did this event start" is one question regardless of audience. The
-- two audiences are sent as separate send_expo_push_chunked() calls (not
-- concatenated into one), tagged 'league_start' and 'fighter_follow'
-- respectively — 'fighter_follow' matches the tag notify_fighter_added_to_
-- fight() already uses for the "booked" push, so push_tickets/receipts
-- attribute both fighter-triggered pushes to the same source.

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
  -- Phase 1: reconcile requests issued by a previous tick. Unchanged from
  -- 008 — request_ids now carries chunks from both audiences, but "was
  -- every chunk for this event a 2xx" doesn't need to know which audience a
  -- given chunk belonged to.
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
  -- Phase 2: issue pushes for events that just went live — org followers
  -- (unchanged) plus, new here, followers of any fighter with a
  -- non-cancelled fight on this event.
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

    select coalesce(jsonb_agg(jsonb_build_object(
             'to', ps.push_token,
             'title', 'Es geht los!',
             'body', fi.name || ' kämpft jetzt bei ' || rec.name || '.'
           )), '[]'::jsonb)
      into fighter_messages
    from public.fights ft
    join public.push_subscriptions ps
      on ps.fighter_id = ft.fighter1_id or ps.fighter_id = ft.fighter2_id
    join public.fighters fi on fi.id = ps.fighter_id
    where ft.event_id = rec.id
      and ft.status is distinct from 'cancelled';

    if jsonb_array_length(messages) = 0 and jsonb_array_length(fighter_messages) = 0 then
      update public.events
      set league_start_push_sent_at = now()
      where id = rec.id;
    else
      new_request_ids :=
        public.send_expo_push_chunked(messages, 'league_start')
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
