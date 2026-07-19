// Shared balldontlie API client + row-mapping helpers, used by both the
// full sync (scripts/sync-balldontlie.ts) and the live-event sync
// (scripts/sync-live-event.ts). Keeping this in one place means a new
// field only needs to be added once, not once per script.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

const BDL_API_KEY = requireEnv('BALLDONTLIE_API_KEY');
const SUPABASE_URL = requireEnv('EXPO_PUBLIC_SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const BDL_BASE = 'https://api.balldontlie.io/mma/v1';

// ALL-STAR tier allows 60 req/min; stay comfortably under that.
const MIN_REQUEST_INTERVAL_MS = 1100;
let lastRequestAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RATE_LIMIT_RETRIES = 5;

export async function bdlFetch<T>(path: string, params: [string, string][] = [], attempt = 0): Promise<T> {
  const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);

  const url = new URL(BDL_BASE + path);
  for (const [key, value] of params) url.searchParams.append(key, value);

  const res = await fetch(url.toString(), { headers: { Authorization: BDL_API_KEY } });
  lastRequestAt = Date.now();

  if (res.status === 429) {
    if (attempt >= MAX_RATE_LIMIT_RETRIES) {
      throw new Error(`balldontlie ${path} rate-limited after ${MAX_RATE_LIMIT_RETRIES} retries, giving up`);
    }
    console.warn(`  Rate limited, waiting 10s... (attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`);
    await sleep(10000);
    return bdlFetch(path, params, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`balldontlie ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function paginateAll<T>(path: string, baseParams: [string, string][] = []): Promise<T[]> {
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

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function upsertBatched(table: string, rows: Record<string, unknown>[], batchSize = 500) {
  for (const batch of chunk(rows, batchSize)) {
    if (batch.length === 0) continue;
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'external_id' });
    if (error) throw new Error(`Failed to upsert into ${table}: ${error.message}`);
  }
}

// Supabase/PostgREST caps unpaginated selects at 1000 rows by default — for
// tables that can grow past that (fighters, fights) an unpaginated select
// here would silently return a partial map with no error, corrupting every
// downstream upsert that depends on it. Page through explicitly instead.
const SUPABASE_PAGE_SIZE = 1000;

export async function externalIdMap(table: string): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('id, external_id')
      .not('external_id', 'is', null)
      .range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;

    for (const row of data ?? []) {
      if (row.external_id !== null) map.set(row.external_id as number, row.id as string);
    }

    if (!data || data.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return map;
}

export type BdlLeague = { id: number; name: string; abbreviation: string | null };
export type BdlWeightClass = { id: number; name: string } | null;
export type BdlFighter = {
  id: number;
  name: string;
  nickname: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  birth_place: string | null;
  height_inches: number | null;
  reach_inches: number | null;
  weight_lbs: number | null;
  stance: string | null;
  record_wins: number | null;
  record_losses: number | null;
  record_draws: number | null;
  record_no_contests: number | null;
  active: boolean | null;
  weight_class: BdlWeightClass;
};
export type BdlEvent = {
  id: number;
  name: string;
  date: string;
  venue_name: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_country: string | null;
  status: string | null;
  main_card_start_time: string | null;
  prelims_start_time: string | null;
  early_prelims_start_time: string | null;
  league: BdlLeague | null;
};
export type BdlFight = {
  id: number;
  event: BdlEvent | null;
  fighter1: BdlFighter;
  fighter2: BdlFighter;
  winner: BdlFighter | null;
  weight_class: BdlWeightClass;
  is_main_event: boolean;
  is_title_fight: boolean;
  card_segment: string | null;
  fight_order: number | null;
  status: string | null;
  scheduled_rounds: number | null;
  result_method: string | null;
  result_method_detail: string | null;
  result_round: number | null;
  result_time: string | null;
};

// organizationId is the org of the fight/event this fighter was just synced
// from — best-effort "primary organization" (most-recently-synced org
// wins; a fighter who has switched orgs won't show a full history, see
// docs/ARCHITECTURE.md). Omitted when a fighter is synced outside of an
// event/fight context.
export function fighterRow(fighter: BdlFighter, organizationId?: string): Record<string, unknown> {
  return {
    external_id: fighter.id,
    name: fighter.name,
    nickname: fighter.nickname,
    nationality: fighter.nationality,
    date_of_birth: fighter.date_of_birth,
    birth_place: fighter.birth_place,
    height_inches: fighter.height_inches,
    reach_inches: fighter.reach_inches,
    weight_lbs: fighter.weight_lbs,
    stance: fighter.stance,
    record_wins: fighter.record_wins,
    record_losses: fighter.record_losses,
    record_draws: fighter.record_draws,
    record_no_contests: fighter.record_no_contests,
    active: fighter.active,
    weight_class: fighter.weight_class?.name ?? null,
    ...(organizationId ? { primary_organization_id: organizationId } : {}),
  };
}

export function eventRow(event: BdlEvent, organizationId: string): Record<string, unknown> {
  return {
    external_id: event.id,
    organization_id: organizationId,
    name: event.name,
    event_date: event.date,
    city: event.venue_city,
    country: event.venue_country,
    venue: event.venue_name,
    venue_state: event.venue_state,
    status: event.status,
    main_card_start_time: event.main_card_start_time,
    prelims_start_time: event.prelims_start_time,
    early_prelims_start_time: event.early_prelims_start_time,
  };
}

export function fightRow(
  fight: BdlFight,
  eventId: string,
  fighter1Id: string,
  fighter2Id: string,
  winnerId: string | null
): Record<string, unknown> {
  return {
    external_id: fight.id,
    event_id: eventId,
    fighter1_id: fighter1Id,
    fighter2_id: fighter2Id,
    weight_class: fight.weight_class?.name ?? null,
    is_main_event: fight.is_main_event,
    is_title_fight: fight.is_title_fight,
    card_position: fight.fight_order,
    card_segment: fight.card_segment,
    status: fight.status,
    scheduled_rounds: fight.scheduled_rounds,
    result_winner_id: winnerId,
    result_method: fight.result_method,
    result_method_detail: fight.result_method_detail,
    result_round: fight.result_round,
    result_time: fight.result_time,
  };
}
