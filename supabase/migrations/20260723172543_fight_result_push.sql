-- Gruppe C, follow-up: fight-result push — the fifth notification type.
--
-- Long-standing backlog item ("a future 'fight ended' push", noted in
-- docs/ARCHITECTURE.md when spoiler protection was first flagged). Now built as
-- a fifth category, with two deliberate differences from the other four:
--
--   1. DEFAULT OFF. Unlike the four start/announce pushes (all default on), a
--      result push is a spoiler by nature, so a device with no prefs row must
--      NOT receive it. Every gate here therefore coalesces to FALSE, and
--      get_notification_prefs() returns false for the unset case — the mirror
--      image of the coalesce(..., true) used by the other four.
--   2. Scope = saved FIGHTERS only ("how did my fighter do"). It is a third
--      switch under the Kämpfer category (new-fight / fight-start / result), not
--      an event- or league-level audience, so a saved card doesn't fire a push
--      per result on it.
--
-- Trigger. Results arrive via the balldontlie upsert (sync-balldontlie /
-- sync-live-event), which UPDATEs the existing fight row, setting result_method
-- (non-null for every outcome — a win sets result_winner_id too, a draw/NC sets
-- result_method = 'Draw'/'No Contest' with a null winner). So the push fires on
-- the null→non-null transition of result_method. This is UPDATE-only: a
-- historical fight first INSERTed with a result already set does not fire (that
-- is a backfill, not a just-decided result), and a later correction to an
-- already-scored fight does not re-fire (OLD.result_method is already non-null).

-------------------------------------------------------------------------------
-- Pref column (default OFF) + widen the send-batch source tag.
-------------------------------------------------------------------------------

alter table public.notification_prefs
  add column if not exists notify_fight_result boolean not null default false;

alter table public.push_send_batches drop constraint push_send_batches_source_check;
alter table public.push_send_batches add constraint push_send_batches_source_check
  check (source in ('fighter_follow', 'league_start', 'event_start', 'fight_result'));

-------------------------------------------------------------------------------
-- get/set prefs gain the fifth flag. Return type + arg list change, so both are
-- dropped and recreated. Note the false fallback for the new flag only.
-------------------------------------------------------------------------------

drop function if exists public.get_notification_prefs(text);
drop function if exists public.set_notification_prefs(text, boolean, boolean, boolean, boolean);

create function public.get_notification_prefs(p_device_id text)
returns table (
  notify_new_fight boolean,
  notify_fight_start boolean,
  notify_event_start boolean,
  notify_league_start boolean,
  notify_fight_result boolean)
language sql security definer set search_path to 'public' as $$
  select coalesce(p.notify_new_fight,    true),
         coalesce(p.notify_fight_start,  true),
         coalesce(p.notify_event_start,  true),
         coalesce(p.notify_league_start, true),
         coalesce(p.notify_fight_result, false)
  from (select 1) dummy
  left join public.notification_prefs p on p.device_id = p_device_id;
$$;

create function public.set_notification_prefs(
  p_device_id           text,
  p_notify_new_fight    boolean,
  p_notify_fight_start  boolean,
  p_notify_event_start  boolean,
  p_notify_league_start boolean,
  p_notify_fight_result boolean)
returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(trim(p_device_id), '') = '' then
    raise exception 'device_id required';
  end if;

  insert into public.notification_prefs (
    device_id, user_id, notify_new_fight, notify_fight_start,
    notify_event_start, notify_league_start, notify_fight_result)
  values (
    p_device_id, auth.uid(), p_notify_new_fight, p_notify_fight_start,
    p_notify_event_start, p_notify_league_start, p_notify_fight_result)
  on conflict (device_id) do update
    set user_id             = coalesce(auth.uid(), public.notification_prefs.user_id),
        notify_new_fight    = excluded.notify_new_fight,
        notify_fight_start  = excluded.notify_fight_start,
        notify_event_start  = excluded.notify_event_start,
        notify_league_start = excluded.notify_league_start,
        notify_fight_result = excluded.notify_fight_result,
        updated_at          = now();
end; $$;

-------------------------------------------------------------------------------
-- notify_fight_result(): audience = distinct push tokens of devices that saved
-- either fighter and have the (default-off) result pref on. Deduped on
-- push_token so saving BOTH fighters of a bout still sends only one push.
-------------------------------------------------------------------------------

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

create trigger on_fight_result
after update on public.fights
for each row
when (old.result_method is null and new.result_method is not null)
execute function public.notify_fight_result();

-------------------------------------------------------------------------------
-- Grants for the recreated prefs RPCs.
-------------------------------------------------------------------------------

do $$
declare fn text;
begin
  foreach fn in array array[
    'get_notification_prefs(text)',
    'set_notification_prefs(text, boolean, boolean, boolean, boolean, boolean)'
  ]
  loop
    execute format('alter function public.%s owner to postgres', fn);
    execute format('revoke execute on function public.%s from public', fn);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', fn);
  end loop;
end $$;
