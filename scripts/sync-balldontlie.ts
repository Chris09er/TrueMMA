// Syncs upcoming MMA events/fighters/fights from the balldontlie API into
// our own Supabase tables. Run manually/locally, never from the app:
//   npx tsx scripts/sync-balldontlie.ts
//
// Requires SUPABASE_SERVICE_ROLE_KEY + BALLDONTLIE_API_KEY in .env (server-side
// only secrets, never EXPO_PUBLIC_-prefixed).
//
// API quirks discovered while building this:
// - /fights requires the paid ALL-STAR tier; /leagues, /events, /fighters are free.
// - `statuses[]=scheduled` reliably filters /events but not /fights, so we
//   instead fetch fights for exactly the scheduled events via `event_ids[]`.
// - Fighter objects are fully embedded in fight responses, so a separate
//   /fighters crawl isn't needed — we derive the fighter set from fights.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

const BDL_API_KEY = requireEnv('BALLDONTLIE_API_KEY');
const SUPABASE_URL = requireEnv('EXPO_PUBLIC_SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const BDL_BASE = 'https://api.balldontlie.io/mma/v1';

// ALL-STAR tier allows 60 req/min; stay comfortably under that.
const MIN_REQUEST_INTERVAL_MS = 1100;
let lastRequestAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bdlFetch<T>(path: string, params: [string, string][] = []): Promise<T> {
  const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);

  const url = new URL(BDL_BASE + path);
  for (const [key, value] of params) url.searchParams.append(key, value);

  const res = await fetch(url.toString(), { headers: { Authorization: BDL_API_KEY } });
  lastRequestAt = Date.now();

  if (res.status === 429) {
    console.warn('  Rate limited, waiting 10s...');
    await sleep(10000);
    return bdlFetch(path, params);
  }
  if (!res.ok) {
    throw new Error(`balldontlie ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function paginateAll<T>(path: string, baseParams: [string, string][] = []): Promise<T[]> {
  const results: T[] = [];
  let cursor: string | undefined;
  do {
    const params: [string, string][] = [...baseParams, ['per_page', '100']];
    if (cursor) params.push(['cursor', cursor]);
    const page = await bdlFetch<{ data: T[]; meta: { next_cursor?: number } }>(path, params);
    results.push(...page.data);
    cursor = page.meta.next_cursor !== undefined ? String(page.meta.next_cursor) : undefined;
  } while (cursor);
  return results;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function upsertBatched(table: string, rows: Record<string, unknown>[], batchSize = 500) {
  for (const batch of chunk(rows, batchSize)) {
    if (batch.length === 0) continue;
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'external_id' });
    if (error) throw new Error(`Failed to upsert into ${table}: ${error.message}`);
  }
}

async function externalIdMap(table: string): Promise<Map<number, string>> {
  const { data, error } = await supabase.from(table).select('id, external_id').not('external_id', 'is', null);
  if (error) throw error;
  const map = new Map<number, string>();
  for (const row of data ?? []) {
    if (row.external_id !== null) map.set(row.external_id as number, row.id as string);
  }
  return map;
}

type BdlLeague = { id: number; name: string; abbreviation: string | null };
type BdlWeightClass = { id: number; name: string } | null;
type BdlFighter = { id: number; name: string; nickname: string | null; nationality: string | null };
type BdlEvent = {
  id: number;
  name: string;
  date: string;
  venue_name: string | null;
  venue_city: string | null;
  venue_country: string | null;
  league: BdlLeague | null;
};
type BdlFight = {
  id: number;
  event: BdlEvent | null;
  fighter1: BdlFighter;
  fighter2: BdlFighter;
  winner: BdlFighter | null;
  weight_class: BdlWeightClass;
  is_main_event: boolean;
  is_title_fight: boolean;
  fight_order: number | null;
  result_method: string | null;
  result_round: number | null;
  result_time: string | null;
};

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

async function syncScheduledEvents(orgMap: Map<number, string>): Promise<Map<number, string>> {
  console.log('Fetching scheduled events...');
  const fetched = await paginateAll<BdlEvent>('/events', [['statuses[]', 'scheduled']]);

  // `statuses[]=scheduled` isn't reliably honored past the first page of
  // cursor pagination (observed historical events leaking through, e.g.
  // "UFC 1" from 1993) — re-filter by date ourselves as the source of truth.
  const now = Date.now();
  const events = fetched.filter((event) => new Date(event.date).getTime() >= now);
  console.log(`  ${fetched.length} events fetched, ${events.length} are actually upcoming.`);

  const rows = events.flatMap((event) => {
    const organizationId = event.league ? orgMap.get(event.league.id) : undefined;
    if (!organizationId) {
      console.warn(`  Skipping event "${event.name}" — unknown league ${event.league?.id}`);
      return [];
    }
    return [
      {
        external_id: event.id,
        organization_id: organizationId,
        name: event.name,
        event_date: event.date,
        city: event.venue_city,
        country: event.venue_country,
        venue: event.venue_name,
      },
    ];
  });

  await upsertBatched('events', rows);
  const map = await externalIdMap('events');
  console.log(`  ${rows.length} scheduled events synced.`);
  return map;
}

async function syncFightersAndFights(eventMap: Map<number, string>): Promise<void> {
  const bdlEventIds = [...eventMap.keys()];
  console.log(`Fetching fights for ${bdlEventIds.length} scheduled events...`);

  const allFights: BdlFight[] = [];
  for (const batch of chunk(bdlEventIds, 25)) {
    const params: [string, string][] = batch.map((id) => ['event_ids[]', String(id)]);
    allFights.push(...(await paginateAll<BdlFight>('/fights', params)));
  }
  console.log(`  ${allFights.length} fights fetched.`);

  const fightersById = new Map<number, BdlFighter>();
  for (const fight of allFights) {
    fightersById.set(fight.fighter1.id, fight.fighter1);
    fightersById.set(fight.fighter2.id, fight.fighter2);
    if (fight.winner) fightersById.set(fight.winner.id, fight.winner);
  }

  console.log(`Syncing ${fightersById.size} fighters...`);
  await upsertBatched(
    'fighters',
    [...fightersById.values()].map((fighter) => ({
      external_id: fighter.id,
      name: fighter.name,
      nickname: fighter.nickname,
      nationality: fighter.nationality,
    }))
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
    return [
      {
        external_id: fight.id,
        event_id: eventId,
        fighter1_id: fighter1Id,
        fighter2_id: fighter2Id,
        weight_class: fight.weight_class?.name ?? null,
        is_main_event: fight.is_main_event,
        is_title_fight: fight.is_title_fight,
        card_position: fight.fight_order,
        result_winner_id: fight.winner ? fighterMap.get(fight.winner.id) ?? null : null,
        result_method: fight.result_method,
        result_round: fight.result_round,
        result_time: fight.result_time,
      },
    ];
  });

  await upsertBatched('fights', fightRows);
  console.log(`  ${fightRows.length} fights synced.`);
}

async function main() {
  const orgMap = await syncLeagues();
  const eventMap = await syncScheduledEvents(orgMap);
  await syncFightersAndFights(eventMap);
  console.log('Sync complete.');
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
