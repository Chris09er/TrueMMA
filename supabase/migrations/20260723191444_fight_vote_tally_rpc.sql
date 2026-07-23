-- Review follow-up: stop fight_votes from leaking every voter's device_id.
--
-- getEventVotes() read fight_votes directly (`select fight_id, device_id,
-- picked_fighter_id`) under the still-public select policy from 003, only to
-- match the caller's own device_id locally. That shipped the stable device_id of
-- every voter — the same anchor used by saved_* — to any anon client, letting it
-- enumerate and correlate devices, and (combined with the anon-callable
-- attach_push_token) target a specific device to redirect its pushes.
--
-- Fix: a SECURITY DEFINER tally RPC returns per (fight, fighter) vote counts plus
-- a single `mine` flag for the calling device — never another device's id — and
-- the base table is locked so the raw REST endpoint can't be used to bypass it.
-- This also removes the enumeration vector that made the attach_push_token
-- redirect practical: a device_id is now an unguessable local random string.

-------------------------------------------------------------------------------
-- Lock the base table: RLS stays on, drop the public select policy, and revoke
-- direct grants — same locked-by-RPC treatment as saved_* / notification_prefs.
-- Writes already go through cast_fight_vote (20260723153252); reads now go
-- through get_fight_vote_tallies below.
-------------------------------------------------------------------------------

drop policy if exists "fight_votes select" on public.fight_votes;
revoke all on public.fight_votes from anon, authenticated;
grant all on public.fight_votes to postgres, service_role;

-------------------------------------------------------------------------------
-- get_fight_vote_tallies(): per (fight, fighter) counts + whether THIS device
-- voted for that fighter. No other device's id ever leaves the database.
-------------------------------------------------------------------------------

create or replace function public.get_fight_vote_tallies(p_fight_ids uuid[], p_device_id text)
returns table (
  fight_id uuid,
  picked_fighter_id uuid,
  votes bigint,
  mine boolean)
language sql
security definer
set search_path to 'public'
as $$
  select v.fight_id,
         v.picked_fighter_id,
         count(*)::bigint as votes,
         bool_or(v.device_id = p_device_id) as mine
  from public.fight_votes v
  where v.fight_id = any(p_fight_ids)
  group by v.fight_id, v.picked_fighter_id;
$$;

alter function public.get_fight_vote_tallies(uuid[], text) owner to postgres;
revoke execute on function public.get_fight_vote_tallies(uuid[], text) from public;
grant execute on function public.get_fight_vote_tallies(uuid[], text) to anon, authenticated, service_role;
