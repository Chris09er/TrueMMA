-- Harden fight voting (re-added 2026-07-23). The original 003_fight_votes
-- trust model let any anon client insert/update rows directly with an
-- arbitrary device_id and picked_fighter_id — counts were fully
-- attacker-mutable and a vote could name a fighter not even in the fight.
--
-- This routes all writes through a security-definer RPC that validates the
-- picked fighter actually belongs to the fight, and revokes direct
-- insert/update from clients (reads stay public so the split-bar counts can
-- still be fetched). device_id remains client-self-reported — the RPC
-- centralises and validates the write path, it does not add a
-- server-verifiable identity (that would need real auth, out of scope for an
-- indicative community poll).

-- Drop the permissive write policies; keep the public select policy so
-- getEventVotes() can still read the tallies.
drop policy if exists "fight_votes insert" on fight_votes;
drop policy if exists "fight_votes update" on fight_votes;

create or replace function public.cast_fight_vote(
  p_fight_id uuid,
  p_device_id text,
  p_fighter_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The picked fighter must be one of the two in this fight.
  if not exists (
    select 1 from fights f
    where f.id = p_fight_id
      and p_fighter_id in (f.fighter1_id, f.fighter2_id)
  ) then
    raise exception 'invalid fighter % for fight %', p_fighter_id, p_fight_id;
  end if;

  insert into fight_votes (fight_id, device_id, picked_fighter_id)
  values (p_fight_id, p_device_id, p_fighter_id)
  on conflict (fight_id, device_id)
  do update set picked_fighter_id = excluded.picked_fighter_id, created_at = now();
end;
$$;

grant execute on function public.cast_fight_vote(uuid, text, uuid) to anon, authenticated;
