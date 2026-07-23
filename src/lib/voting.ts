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
  const { data, error } = await supabase
    .from('fight_votes')
    .select('fight_id, device_id, picked_fighter_id')
    .in('fight_id', fightIds);
  if (error) throw error;

  for (const fight of fights) {
    const votesForFight = (data ?? []).filter((v) => v.fight_id === fight.id);
    const myVoteRow = votesForFight.find((v) => v.device_id === deviceId);
    result.set(fight.id, {
      fighter1Votes: votesForFight.filter((v) => v.picked_fighter_id === fight.fighter1_id).length,
      fighter2Votes: votesForFight.filter((v) => v.picked_fighter_id === fight.fighter2_id).length,
      myVote: myVoteRow?.picked_fighter_id ?? null,
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
