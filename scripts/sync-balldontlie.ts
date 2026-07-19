// Syncs upcoming MMA events/fighters/fights from the balldontlie API into
// our own Supabase tables. Run manually/locally, or via the scheduled
// GitHub Actions workflow (.github/workflows/sync-balldontlie-full.yml):
//   npx tsx scripts/sync-balldontlie.ts
//
// Requires SUPABASE_SERVICE_ROLE_KEY + BALLDONTLIE_API_KEY in .env (server-side
// only secrets, never EXPO_PUBLIC_-prefixed).
//
// API quirks discovered while building this:
// - /fights requires the paid ALL-STAR tier; /leagues, /events, /fighters are free.
// - Neither `statuses[]` nor date filters are reliably honored by /events
//   past the first page of cursor pagination — we filter by date ourselves
//   (see PAST_WINDOW_DAYS). `league_ids[]` however IS honored on every page,
//   and is what keeps this sync from walking the full ~28k-event history —
//   see the note in syncEvents() for the measurement behind that.
// - /fights doesn't honor `statuses[]` either, so we instead fetch fights
//   for exactly the events we kept via `event_ids[]`.
// - Fighter objects are fully embedded in fight responses, so a separate
//   /fighters crawl isn't needed — we derive the fighter set from fights.
//
// For a lightweight, frequent update of whatever event is happening right
// now, see sync-live-event.ts instead — this script always walks the full
// history and is too slow/heavy to run more than a few times a day.
import {
  bdlFetch,
  chunk,
  eventRow,
  externalIdMap,
  fighterRow,
  fightRow,
  paginateAll,
  supabase,
  upsertBatched,
  type BdlEvent,
  type BdlFight,
  type BdlFighter,
  type BdlLeague,
} from './lib/balldontlie';

async function syncLeagues(): Promise<Map<number, string>> {
  console.log('Syncing leagues...');
  const { data: leagues } = await bdlFetch<{ data: BdlLeague[] }>('/leagues');

  // Backfill external_id onto pre-existing manually-entered organizations
  // (e.g. the original UFC/OKTAGON rows) matched by short_name, so the
  // upsert below updates them instead of colliding with the short_name
  // unique constraint by trying to insert a duplicate.
  const { data: existingOrgs, error: existingOrgsError } = await supabase
    .from('organizations')
    .select('id, short_name, external_id')
    .is('external_id', null);
  if (existingOrgsError) throw existingOrgsError;

  for (const league of leagues) {
    const shortName = league.abbreviation ?? league.name;
    const match = existingOrgs?.find((org) => org.short_name.toLowerCase() === shortName.toLowerCase());
    if (match) {
      const { error } = await supabase
        .from('organizations')
        .update({ external_id: league.id })
        .eq('id', match.id);
      if (error) throw new Error(`Failed to backfill external_id for "${shortName}": ${error.message}`);
    }
  }

  await upsertBatched(
    'organizations',
    leagues.map((league) => ({
      external_id: league.id,
      name: league.name,
      short_name: league.abbreviation ?? league.name,
    }))
  );

  const map = await externalIdMap('organizations');
  console.log(`  ${map.size} leagues synced.`);
  return map;
}

// How far back to keep past events/fights. Still costs no extra /events calls
// — balldontlie has no honored date filter, so the league-filtered walk
// returns their whole history for those leagues either way (only ~4 requests
// total). It does cost extra /fights calls, since fights are fetched per kept
// event; that's the real price of widening this window.
const PAST_WINDOW_DAYS = 365;

async function syncEvents(orgMap: Map<number, string>): Promise<Map<number, string>> {
  // `league_ids[]` IS honored server-side across every cursor page — unlike
  // `statuses[]`/date filters, which aren't (see the header comment). Verified
  // 2026-07-19 by walking both variants to completion and diffing the ids:
  // the unfiltered walk returned 27,933 events over 280 requests, of which
  // exactly 361 carried a league; the filtered walk returned those same 361
  // over 4 requests, with zero eligible events missing. The other ~27.6k are
  // regional shows with `league: null`, which this sync discards anyway (they
  // used to show up as ~212 "unknown league" skip lines per run).
  //
  // orgMap's keys are precisely the leagues we can map to an organization row,
  // so filtering on them can't drop anything the mapping step would have kept.
  const leagueIds = [...orgMap.keys()];
  console.log(`Fetching events for ${leagueIds.length} leagues...`);
  const fetched = await paginateAll<BdlEvent>(
    '/events',
    leagueIds.map((id) => ['league_ids[]', String(id)])
  );

  // Date filtering still has to happen client-side — that's the filter kind
  // balldontlie doesn't honor.
  const now = Date.now();
  const pastCutoff = now - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const events = fetched.filter((event) => {
    const eventTime = new Date(event.date).getTime();
    if (Number.isNaN(eventTime)) {
      console.warn(`  Skipping event "${event.name}" — unparseable date "${event.date}"`);
      return false;
    }
    return eventTime >= pastCutoff;
  });
  console.log(`  ${fetched.length} events fetched, ${events.length} within the ${PAST_WINDOW_DAYS}-day window.`);

  const rows = events.flatMap((event) => {
    const organizationId = event.league ? orgMap.get(event.league.id) : undefined;
    if (!organizationId) {
      console.warn(`  Skipping event "${event.name}" — unknown league ${event.league?.id}`);
      return [];
    }
    return [eventRow(event, organizationId)];
  });

  await upsertBatched('events', rows);
  const map = await externalIdMap('events');
  console.log(`  ${rows.length} events synced.`);
  return map;
}

async function syncFightersAndFights(eventMap: Map<number, string>, orgMap: Map<number, string>): Promise<void> {
  const bdlEventIds = [...eventMap.keys()];
  console.log(`Fetching fights for ${bdlEventIds.length} events...`);

  const allFights: BdlFight[] = [];
  for (const batch of chunk(bdlEventIds, 25)) {
    const params: [string, string][] = batch.map((id) => ['event_ids[]', String(id)]);
    allFights.push(...(await paginateAll<BdlFight>('/fights', params)));
  }
  console.log(`  ${allFights.length} fights fetched.`);

  // Track each fighter's org alongside them — "most recently synced wins"
  // when a fighter appears in fights from more than one org in this run
  // (see fighterRow's organizationId param).
  const fightersById = new Map<number, BdlFighter>();
  const fighterOrgById = new Map<number, string | undefined>();
  for (const fight of allFights) {
    const organizationId = fight.event?.league ? orgMap.get(fight.event.league.id) : undefined;
    fightersById.set(fight.fighter1.id, fight.fighter1);
    fighterOrgById.set(fight.fighter1.id, organizationId);
    fightersById.set(fight.fighter2.id, fight.fighter2);
    fighterOrgById.set(fight.fighter2.id, organizationId);
    if (fight.winner) {
      fightersById.set(fight.winner.id, fight.winner);
      fighterOrgById.set(fight.winner.id, organizationId);
    }
  }

  console.log(`Syncing ${fightersById.size} fighters...`);
  await upsertBatched(
    'fighters',
    [...fightersById.values()].map((fighter) => fighterRow(fighter, fighterOrgById.get(fighter.id)))
  );
  const fighterMap = await externalIdMap('fighters');

  console.log(`Syncing ${allFights.length} fights...`);
  const fightRows = allFights.flatMap((fight) => {
    const eventId = fight.event ? eventMap.get(fight.event.id) : undefined;
    const fighter1Id = fighterMap.get(fight.fighter1.id);
    const fighter2Id = fighterMap.get(fight.fighter2.id);
    if (!eventId || !fighter1Id || !fighter2Id) {
      console.warn(`  Skipping fight ${fight.id} — missing mapped reference`);
      return [];
    }
    const winnerId = fight.winner ? fighterMap.get(fight.winner.id) ?? null : null;
    return [fightRow(fight, eventId, fighter1Id, fighter2Id, winnerId)];
  });

  await upsertBatched('fights', fightRows);
  console.log(`  ${fightRows.length} fights synced.`);
}

async function main() {
  const orgMap = await syncLeagues();
  const eventMap = await syncEvents(orgMap);
  await syncFightersAndFights(eventMap, orgMap);
  console.log('Sync complete.');
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
