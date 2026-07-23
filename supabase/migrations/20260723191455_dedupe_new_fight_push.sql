-- Review follow-up: dedupe the "Neuer Fight angekündigt" push on push_token.
--
-- notify_fighter_added_to_fight() aggregated one message per matching
-- saved_fighters row without deduping, so a device that had saved BOTH fighters
-- of a newly-booked bout received two identical pushes for one booking. Its
-- sibling notify_fight_result() already dedupes on push_token (20260723172543);
-- this brings the announce push in line. Body is identical for both fighters
-- (fighter1 vs fighter2), so collapsing to distinct tokens loses nothing.
--
-- Only the audience subquery changes from 20260723165949; grants unchanged.

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
    'to', tok,
    'title', 'Neuer Fight angekündigt',
    'body', fighter_name_1 || ' vs. ' || fighter_name_2
  )), '[]'::jsonb)
  into messages
  from (
    select distinct s.push_token as tok
    from public.saved_fighters s
    left join public.notification_prefs p on p.device_id = s.device_id
    where s.fighter_id in (new.fighter1_id, new.fighter2_id)
      and s.push_token is not null
      and coalesce(p.notify_new_fight, true)
  ) q;

  if jsonb_array_length(messages) > 0 then
    perform public.send_expo_push_chunked(messages, 'fighter_follow');
  end if;

  return new;
end;
$$;

alter function public.notify_fighter_added_to_fight() owner to postgres;
revoke execute on function public.notify_fighter_added_to_fight() from public, anon, authenticated;
grant execute on function public.notify_fighter_added_to_fight() to service_role, supabase_auth_admin;
