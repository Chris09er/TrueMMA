-- Review follow-up: gate the fight-result push on event recency.
--
-- notify_fight_result() fired on any result_method null→non-null transition with
-- no time bound. balldontlie can ingest a historical fight with a null
-- result_method and only later backfill the method; that UPDATE would then push a
-- "Kampf-Ergebnis" spoiler for a months-old bout to everyone who saved either
-- fighter. The header's "backfill" argument only covered fights INSERTed with a
-- result already set, not insert-null-then-late-update.
--
-- Fix: only push when the fight's event actually happened recently (within the
-- last 2 days — long enough to cover a late-running card and the sync cadence,
-- short enough to exclude old backfills). This mirrors the intent of the
-- send_league_start_pushes 30-minute window. The on_fight_result trigger and its
-- WHEN clause are unchanged; only the function body gains the gate.

create or replace function public.notify_fight_result() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  name_1 text;
  name_2 text;
  winner_name text;
  loser_name text;
  body_text text;
  messages jsonb;
begin
  -- Recency gate: skip results of events that aren't recent (a late backfill of
  -- result_method on an old fight must not spoiler-push).
  if not exists (
    select 1 from public.events e
    where e.id = new.event_id
      and e.event_date > now() - interval '2 days'
  ) then
    return new;
  end if;

  select name into name_1 from fighters where id = new.fighter1_id;
  select name into name_2 from fighters where id = new.fighter2_id;

  if new.result_winner_id is not null then
    -- Decisive result: "<winner> schlägt <loser> (<method>)".
    if new.result_winner_id = new.fighter1_id then
      winner_name := name_1; loser_name := name_2;
    else
      winner_name := name_2; loser_name := name_1;
    end if;
    body_text := winner_name || ' schlägt ' || loser_name
                 || coalesce(' (' || nullif(new.result_method, '') || ')', '');
  else
    -- Draw / No Contest: no winner, result_method carries the outcome.
    body_text := name_1 || ' vs. ' || name_2 || ': ' || new.result_method;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'to', tok,
           'title', 'Kampf-Ergebnis',
           'body', body_text
         )), '[]'::jsonb)
    into messages
  from (
    select distinct s.push_token as tok
    from public.saved_fighters s
    left join public.notification_prefs p on p.device_id = s.device_id
    where s.fighter_id in (new.fighter1_id, new.fighter2_id)
      and s.push_token is not null
      and coalesce(p.notify_fight_result, false)
  ) q;

  if jsonb_array_length(messages) > 0 then
    perform public.send_expo_push_chunked(messages, 'fight_result');
  end if;

  return new;
end;
$$;

alter function public.notify_fight_result() owner to postgres;
revoke execute on function public.notify_fight_result() from public, anon, authenticated;
grant execute on function public.notify_fight_result() to service_role, supabase_auth_admin;
