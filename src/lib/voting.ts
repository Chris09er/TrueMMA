import { supabase } from './supabase';
import { getDeviceId } from './deviceId';

// getDeviceId now lives in ./deviceId (shared with saves.ts) — re-exported here
// so existing callers that import it from voting.ts keep working.
export { getDeviceId };

export type FightVoteSummary = {
  fighter1Votes: number;
  fighter2Votes: number;
  myVote: string | null; // picked fighter id, or null if this device hasn't voted
};

// One batched query for an entire event's fight card, instead of one query
// per fight card — mirrors the "single source of truth, single fetch"
// pattern already used for isEventUpcoming/getFightsForEvent.
export async function getEventVotes(
  fights: { id: string; fighter1_id: string; fighter2_id: string }[]
): Promise<Map<string, FightVoteSummary>> {
  const fightIds = fights.map((f) => f.id);
  const result = new Map<string, FightVoteSummary>();
  if (fightIds.length === 0) return result;

  const deviceId = await getDeviceId();
  // Tallies come from a SECURITY DEFINER RPC that returns only per-fighter vote
  // counts plus a `mine` flag for this device — never any other device's id.
  // The base table is RLS-locked (see 20260723191444_fight_vote_tally_rpc.sql).
  const { data, error } = await supabase.rpc('get_fight_vote_tallies', {
    p_fight_ids: fightIds,
    p_device_id: deviceId,
  });
  if (error) throw error;

  const rows = (data ?? []) as { fight_id: string; picked_fighter_id: string; votes: number; mine: boolean }[];
  for (const fight of fights) {
    const rowsForFight = rows.filter((r) => r.fight_id === fight.id);
    const votesFor = (fighterId: string) =>
      rowsForFight.find((r) => r.picked_fighter_id === fighterId)?.votes ?? 0;
    result.set(fight.id, {
      fighter1Votes: votesFor(fight.fighter1_id),
      fighter2Votes: votesFor(fight.fighter2_id),
      myVote: rowsForFight.find((r) => r.mine)?.picked_fighter_id ?? null,
    });
  }

  return result;
}

// Writes go through the security-definer RPC (migration 013), not a direct
// table upsert — the client has no insert/update grant on fight_votes. The
// RPC validates that the picked fighter is actually in the fight.
export async function castVote(fightId: string, fighterId: string): Promise<void> {
  const deviceId = await getDeviceId();
  const { error } = await supabase.rpc('cast_fight_vote', {
    p_fight_id: fightId,
    p_device_id: deviceId,
    p_fighter_id: fighterId,
  });
  if (error) throw error;
}
