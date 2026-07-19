// Lightweight companion to sync-balldontlie.ts, meant to run frequently
// (every few minutes via .github/workflows/sync-balldontlie-live.yml)
// without the cost of a full history walk. It only does anything if an
// event is "live" right now (its earliest known broadcast segment has
// started and it's not yet past our end-of-card buffer) — otherwise it
// exits immediately with zero balldontlie API calls, so running it often
// costs nothing on quiet days.
//
//   npx tsx scripts/sync-live-event.ts
import {
  bdlFetch,
  eventRow,
  externalIdMap,
  fighterRow,
  fightRow,
  supabase,
  upsertBatched,
  type BdlEvent,
  type BdlFight,
  type BdlFighter,
} from './lib/balldontlie';

// balldontlie gives us broadcast start times but no end time. A full card
// (early prelims through main event) rarely runs past ~6 hours from its
// earliest segment's start — generous buffer, not a precise cutoff.
const CARD_DURATION_BUFFER_MS = 6 * 60 * 60 * 1000;

async function findLiveEventExternalIds(): Promise<number[]> {
  const now = Date.now();
  // Widen the DB-side window generously (±1 day around now) — the precise
  // "is it live right now" check happens in JS below using the actual
  // segment start times, this query just keeps the row count small.
  const windowStart = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(now + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('events')
    .select('id, external_id, event_date, main_card_start_time, prelims_start_time, early_prelims_start_time')
    .not('external_id', 'is', null)
    .gte('event_date', windowStart)
    .lte('event_date', windowEnd);
  if (error) throw error;

  const live = (data ?? []).filter((event) => {
    const earliestStart = new Date(
      event.early_prelims_start_time ?? event.prelims_start_time ?? event.main_card_start_time ?? event.event_date
    ).getTime();
    const estimatedEnd = earliestStart + CARD_DURATION_BUFFER_MS;
    return now >= earliestStart && now <= estimatedEnd;
  });

  return live.map((event) => event.external_id as number).filter((id): id is number => id !== null);
}

async function syncLiveEvent(bdlEventId: number): Promise<void> {
  console.log(`Live event ${bdlEventId} — refreshing fights...`);

  // Re-fetch the event itself too — status can flip to "cancelled" or
  // segment start times can shift mid-day. Straight to the single-event
  // endpoint: this used to first scan page 1 of an unfiltered /events list
  // (100 of ~28k rows) and only fall back to /events/{id} on a miss, which
  // meant a wasted request on essentially every run. Note /events/{id}
  // returns `data` as a single object, not an array — the old fallback typed
  // it as an array, so `data[0]` was always undefined and the event row was
  // in practice never refreshed here at all.
  const event = await bdlFetch<{ data: BdlEvent }>(`/events/${bdlEventId}`)
    .then((res) => res.data)
    .catch((err) => {
      console.warn(`  Could not re-fetch event ${bdlEventId}: ${err.message}`);
      return null;
    });

  const orgMap = await externalIdMap('organizations');
  const organizationId = event?.league ? orgMap.get(event.league.id) : undefined;
  if (event && organizationId) {
    await upsertBatched('events', [eventRow(event, organizationId)]);
  }

  const eventMap = await externalIdMap('events', [bdlEventId]);
  const eventId = eventMap.get(bdlEventId);
  if (!eventId) {
    console.warn(`  Event ${bdlEventId} not found locally after refresh, skipping fights.`);
    return;
  }

  const { data: fights } = await bdlFetch<{ data: BdlFight[] }>('/fights', [['event_ids[]', String(bdlEventId)]]);
  console.log(`  ${fights.length} fights fetched.`);

  const fightersById = new Map<number, BdlFighter>();
  for (const fight of fights) {
    fightersById.set(fight.fighter1.id, fight.fighter1);
    fightersById.set(fight.fighter2.id, fight.fighter2);
    if (fight.winner) fightersById.set(fight.winner.id, fight.winner);
  }
  await upsertBatched('fighters', [...fightersById.values()].map((fighter) => fighterRow(fighter, organizationId)));
  const fighterMap = await externalIdMap('fighters', [...fightersById.keys()]);

  const fightRows = fights.flatMap((fight) => {
    const fighter1Id = fighterMap.get(fight.fighter1.id);
    const fighter2Id = fighterMap.get(fight.fighter2.id);
    if (!fighter1Id || !fighter2Id) {
      console.warn(`  Skipping fight ${fight.id} — missing mapped fighter`);
      return [];
    }
    const winnerId = fight.winner ? fighterMap.get(fight.winner.id) ?? null : null;
    return [fightRow(fight, eventId, fighter1Id, fighter2Id, winnerId)];
  });

  await upsertBatched('fights', fightRows);
  console.log(`  ${fightRows.length} fights synced for event ${bdlEventId}.`);
}

// Push must fire when the event actually starts, not when it's created —
// so this can't be a simple AFTER INSERT trigger like the fighter-follow
// one. Piggybacks on this script's existing 5-minute "is it live?" poll;
// league_start_push_sent_at ensures it only fires once per event.
async function sendLeagueStartPushes(liveExternalIds: number[]): Promise<void> {
  if (liveExternalIds.length === 0) return;

  const { data: liveEvents, error } = await supabase
    .from('events')
    .select('id, name, organization_id, organizations(short_name)')
    .in('external_id', liveExternalIds)
    .is('league_start_push_sent_at', null);
  if (error) throw error;

  for (const event of liveEvents ?? []) {
    const { data: follows, error: followsError } = await supabase
      .from('organization_follows')
      .select('push_token')
      .eq('organization_id', event.organization_id);

    if (followsError) {
      console.warn(`  Failed to load organization_follows for event ${event.id}: ${followsError.message}`);
      continue;
    }

    if (follows && follows.length > 0) {
      const orgName = (event.organizations as { short_name?: string } | null)?.short_name ?? '';
      const messages = follows.map((f) => ({
        to: f.push_token,
        title: 'Es geht los!',
        body: `${orgName}: ${event.name} startet jetzt.`,
      }));
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        // Don't stamp league_start_push_sent_at — leave it null so the next
        // poll retries, otherwise a transient Expo/network failure would
        // permanently suppress this event's league-start push.
        console.warn(`  League-start push failed for event ${event.id}, will retry next run: ${res.status} ${await res.text()}`);
        continue;
      }
      console.log(`  Sent league-start push to ${messages.length} follower(s) for "${event.name}".`);
    }

    await supabase.from('events').update({ league_start_push_sent_at: new Date().toISOString() }).eq('id', event.id);
  }
}

async function main() {
  const liveEventIds = await findLiveEventExternalIds();
  if (liveEventIds.length === 0) {
    console.log('No live event right now, skipping.');
    return;
  }

  await sendLeagueStartPushes(liveEventIds);

  for (const bdlEventId of liveEventIds) {
    await syncLiveEvent(bdlEventId);
  }
  console.log('Live sync complete.');
}

main().catch((err) => {
  console.error('Live sync failed:', err);
  process.exit(1);
});
