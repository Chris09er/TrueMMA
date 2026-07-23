// One-off (re-runnable) MMA data-provider coverage probe.
//
// Purpose: answer, empirically and per provider, the three questions that
// drive an "should we switch away from balldontlie" decision —
//   1. how many leagues/promotions are actually covered (breadth)
//   2. how far back the history really goes (depth)
//   3. how much data (events/fights/fighters) exists
// — and print them side by side against balldontlie's known baseline (361
// league-carrying events across its entire history, see docs/ARCHITECTURE.md
// "balldontlie sync"). The hard lesson from that doc applies here: never
// trust a provider's marketing "we cover league X" — count it. This script
// counts it.
//
// It calls provider REST APIs directly (no Supabase, no writes). Each
// provider is probed only if its key is present in the environment, and a
// failure in one provider never aborts the others. Free-tier daily caps are
// respected via a per-provider request budget — so counts may be *sampled*
// rather than exhaustive; the report says so explicitly when a budget was
// hit. Breadth (which leagues) and depth (season range) are answered cheaply
// and are reliable even when totals are sampled.
//
// Keys (set whichever you have; missing ones are skipped):
//   BALLDONTLIE_API_KEY   already in .env — the incumbent baseline
//   APISPORTS_KEY         free key from https://dashboard.api-football.com (100 req/day)
//   SPORTSDATAIO_KEY      trial key from https://sportsdata.io/mma-ufc-api
//
// Optional per-provider request budget overrides (defaults are free-tier-safe):
//   APISPORTS_BUDGET, SPORTSDATAIO_BUDGET, BALLDONTLIE_BUDGET
//
// Run: npm run eval:apis
import 'dotenv/config';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Shared normalized result shape every provider adapter fills in.
// ---------------------------------------------------------------------------
interface ProviderReport {
  provider: string;
  ok: boolean;
  note?: string; // error, or a caveat like "sampled — budget hit"
  requestsUsed: number;
  // breadth: promotion/league name -> count of events (or fights) seen
  leagues: Record<string, number>;
  totalItems: number; // events or fights counted (see itemKind)
  itemKind: 'events' | 'fights' | 'unknown';
  earliestYear?: number;
  latestYear?: number;
  fighters?: number;
  // one raw record so we can SEE the real field shape instead of assuming it
  sampleRecordKeys?: string[];
}

function emptyReport(provider: string): ProviderReport {
  return { provider, ok: false, requestsUsed: 0, leagues: {}, totalItems: 0, itemKind: 'unknown' };
}

// A tiny rate-limited, budget-capped GET helper, created per provider so each
// has its own pacing + budget counter.
function makeFetcher(opts: {
  minIntervalMs: number;
  budget: number;
  headers: Record<string, string>;
  onCount: () => void;
}) {
  let last = 0;
  let used = 0;
  return async function get<T>(url: string): Promise<T> {
    if (used >= opts.budget) throw new BudgetExceeded(used);
    const wait = opts.minIntervalMs - (Date.now() - last);
    if (wait > 0) await sleep(wait);
    const res = await fetch(url, { headers: opts.headers });
    last = Date.now();
    used += 1;
    opts.onCount();
    if (res.status === 429) {
      throw new Error(`rate limited (429) after ${used} requests — free-tier daily/minute cap likely hit`);
    }
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  };
}

class BudgetExceeded extends Error {
  constructor(public used: number) {
    super(`request budget exhausted after ${used} requests`);
  }
}

const yearOf = (dateish: unknown): number | undefined => {
  if (typeof dateish !== 'string' && typeof dateish !== 'number') return undefined;
  const y = new Date(dateish).getUTCFullYear();
  return Number.isFinite(y) && y > 1980 && y < 2100 ? y : undefined;
};

function trackYear(report: ProviderReport, year?: number) {
  if (year === undefined) return;
  report.earliestYear = report.earliestYear === undefined ? year : Math.min(report.earliestYear, year);
  report.latestYear = report.latestYear === undefined ? year : Math.max(report.latestYear, year);
}

// ---------------------------------------------------------------------------
// Adapter: balldontlie (the incumbent baseline)
// Walks /events per league_id — same lever the sync uses — to reproduce the
// 361-event / per-league picture directly rather than quoting the doc.
// ---------------------------------------------------------------------------
async function probeBalldontlie(): Promise<ProviderReport> {
  const report = emptyReport('balldontlie (current)');
  const key = process.env.BALLDONTLIE_API_KEY;
  if (!key) {
    report.note = 'no BALLDONTLIE_API_KEY set — skipped';
    return report;
  }
  const budget = Number(process.env.BALLDONTLIE_BUDGET ?? 60);
  const get = makeFetcher({
    minIntervalMs: 1100,
    budget,
    headers: { Authorization: key },
    onCount: () => (report.requestsUsed += 1),
  });
  const base = 'https://api.balldontlie.io/mma/v1';
  report.itemKind = 'events';
  try {
    const leagues = await get<{ data: Array<{ id: number; name: string }> }>(`${base}/leagues?per_page=100`);
    for (const league of leagues.data) {
      let cursor: string | undefined;
      let count = 0;
      try {
        do {
          const u = new URL(`${base}/events`);
          u.searchParams.set('per_page', '100');
          u.searchParams.append('league_ids[]', String(league.id));
          if (cursor) u.searchParams.set('cursor', cursor);
          const page = await get<{ data: Array<Record<string, unknown>>; meta: { next_cursor?: number } }>(u.toString());
          count += page.data.length;
          for (const ev of page.data) {
            trackYear(report, yearOf(ev.date ?? ev.event_date));
            if (!report.sampleRecordKeys) report.sampleRecordKeys = Object.keys(ev);
          }
          cursor = page.meta.next_cursor !== undefined ? String(page.meta.next_cursor) : undefined;
        } while (cursor);
      } catch (e) {
        if (e instanceof BudgetExceeded) {
          report.note = 'sampled — request budget hit before all leagues counted';
          break;
        }
        throw e;
      }
      if (count > 0) report.leagues[league.name] = count;
    }
    report.totalItems = Object.values(report.leagues).reduce((a, b) => a + b, 0);
    report.ok = true;
  } catch (e) {
    report.note = (e as Error).message;
  }
  return report;
}

// ---------------------------------------------------------------------------
// Adapter: API-Sports MMA (https://v1.mma.api-sports.io)
// Envelope: { results, paging:{current,total}, response:[...] }.
// /seasons is a single cheap request -> answers history depth definitively.
// /fights?season=YYYY -> breadth (distinct promotion-ish field) + counts.
// The real per-fight field shape is unknown to us, so we DUMP the first
// record's keys and tally on whatever looks like a promotion/league field.
// ---------------------------------------------------------------------------
type ApiSportsEnvelope<T> = { results: number; paging?: { current: number; total: number }; response: T[] };

function pickLeagueName(rec: Record<string, unknown>): string {
  // Try the field names a promotion could plausibly live under, in priority order.
  for (const k of ['promotion', 'league', 'organization', 'organisation', 'competition', 'category', 'slug']) {
    const v = rec[k];
    if (typeof v === 'string' && v.trim()) return `${k}:${v.trim()}`;
    if (v && typeof v === 'object') {
      const name = (v as Record<string, unknown>).name;
      if (typeof name === 'string' && name.trim()) return `${k}:${name.trim()}`;
    }
  }
  return '(no promotion field found)';
}

async function probeApiSports(): Promise<ProviderReport> {
  const report = emptyReport('API-Sports MMA');
  const key = process.env.APISPORTS_KEY;
  if (!key) {
    report.note = 'no APISPORTS_KEY set — skipped (free key: https://dashboard.api-football.com)';
    return report;
  }
  const budget = Number(process.env.APISPORTS_BUDGET ?? 40);
  const get = makeFetcher({
    minIntervalMs: 300,
    budget,
    headers: { 'x-apisports-key': key },
    onCount: () => (report.requestsUsed += 1),
  });
  const base = 'https://v1.mma.api-sports.io';
  report.itemKind = 'fights';
  try {
    const seasons = await get<ApiSportsEnvelope<number | string>>(`${base}/seasons`);
    const years = seasons.response.map((s) => Number(s)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    if (years.length) {
      report.earliestYear = years[0];
      report.latestYear = years[years.length - 1];
    }
    // Walk fights newest season first so a small budget still characterizes
    // the current data; page through each season until budget runs out.
    for (const season of [...years].reverse()) {
      try {
        let page = 1;
        let totalPages = 1;
        do {
          const env = await get<ApiSportsEnvelope<Record<string, unknown>>>(
            `${base}/fights?season=${season}&page=${page}`,
          );
          totalPages = env.paging?.total ?? 1;
          for (const fight of env.response) {
            if (!report.sampleRecordKeys) report.sampleRecordKeys = Object.keys(fight);
            const name = pickLeagueName(fight);
            report.leagues[name] = (report.leagues[name] ?? 0) + 1;
            report.totalItems += 1;
            trackYear(report, yearOf(fight.date ?? fight.timestamp));
          }
          page += 1;
        } while (page <= totalPages);
      } catch (e) {
        if (e instanceof BudgetExceeded) {
          report.note = `sampled — counted seasons ${report.latestYear}..down until budget (${budget} req) ran out; season range above is still complete`;
          break;
        }
        throw e;
      }
    }
    report.ok = true;
  } catch (e) {
    report.note = (e as Error).message;
  }
  return report;
}

// ---------------------------------------------------------------------------
// Adapter: SportsDataIO MMA (https://api.sportsdata.io/v3/mma)
// /scores/json/Leagues        -> promotions directly (definitive breadth)
// /scores/json/Schedule/{lg}/{season} -> events per league+season (+ dates)
// Header auth: Ocp-Apim-Subscription-Key.
// Trial keys are often UFC-only / limited seasons — the probe reveals exactly
// what THIS key can see, which is the whole point.
// ---------------------------------------------------------------------------
async function probeSportsDataIO(): Promise<ProviderReport> {
  const report = emptyReport('SportsDataIO MMA');
  const key = process.env.SPORTSDATAIO_KEY;
  if (!key) {
    report.note = 'no SPORTSDATAIO_KEY set — skipped (trial: https://sportsdata.io/mma-ufc-api)';
    return report;
  }
  const budget = Number(process.env.SPORTSDATAIO_BUDGET ?? 60);
  const get = makeFetcher({
    minIntervalMs: 300,
    budget,
    headers: { 'Ocp-Apim-Subscription-Key': key },
    onCount: () => (report.requestsUsed += 1),
  });
  const base = 'https://api.sportsdata.io/v3/mma/scores/json';
  report.itemKind = 'events';
  try {
    const leagues = await get<Array<Record<string, unknown>>>(`${base}/Leagues`);
    // Field is typically LeagueKey / Name; keep whatever strings we find.
    const leagueKeys = leagues
      .map((l) => (l.LeagueKey ?? l.Key ?? l.Name ?? l.Abbreviation) as string | undefined)
      .filter((x): x is string => typeof x === 'string' && !!x.trim());
    if (!report.sampleRecordKeys && leagues[0]) report.sampleRecordKeys = Object.keys(leagues[0]);

    // Probe a wide season range newest-first so both current breadth and the
    // earliest available season get surfaced within budget.
    const thisYear = new Date().getUTCFullYear();
    const seasonsToTry: number[] = [];
    for (let y = thisYear; y >= 2005; y--) seasonsToTry.push(y);

    outer: for (const lg of leagueKeys.length ? leagueKeys : ['UFC']) {
      for (const season of seasonsToTry) {
        try {
          const sched = await get<Array<Record<string, unknown>>>(`${base}/Schedule/${encodeURIComponent(lg)}/${season}`);
          if (Array.isArray(sched) && sched.length) {
            report.leagues[lg] = (report.leagues[lg] ?? 0) + sched.length;
            report.totalItems += sched.length;
            for (const ev of sched) {
              trackYear(report, yearOf(ev.DateTime ?? ev.Day ?? ev.Date));
              if (!report.sampleRecordKeys) report.sampleRecordKeys = Object.keys(ev);
            }
          }
        } catch (e) {
          if (e instanceof BudgetExceeded) {
            report.note = 'sampled — request budget hit; leagues list above is complete, per-league counts are partial';
            break outer;
          }
          // A 404 for a season a league didn't run is normal — keep going.
        }
      }
    }
    report.ok = true;
  } catch (e) {
    report.note = (e as Error).message;
  }
  return report;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
function printReport(r: ProviderReport) {
  const line = '─'.repeat(72);
  console.log(`\n${line}\n${r.provider}\n${line}`);
  if (!r.ok && r.note && r.requestsUsed === 0) {
    console.log(`  ⏭  ${r.note}`);
    return;
  }
  console.log(`  requests used : ${r.requestsUsed}`);
  console.log(`  ${r.itemKind} counted: ${r.totalItems}`);
  const depth = r.earliestYear !== undefined ? `${r.earliestYear} – ${r.latestYear}` : 'unknown';
  console.log(`  history depth : ${depth}`);
  if (r.fighters !== undefined) console.log(`  fighters      : ${r.fighters}`);
  const leagueNames = Object.keys(r.leagues);
  console.log(`  leagues seen  : ${leagueNames.length}`);
  const sorted = Object.entries(r.leagues).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sorted) console.log(`      ${count.toString().padStart(6)}  ${name}`);
  if (r.sampleRecordKeys) console.log(`  record fields : ${r.sampleRecordKeys.join(', ')}`);
  if (r.note) console.log(`  ⚠  ${r.note}`);
}

function printComparison(reports: ProviderReport[]) {
  const line = '═'.repeat(72);
  console.log(`\n${line}\nCOMPARISON (higher breadth + deeper history = better fit for your gaps)\n${line}`);
  const header = ['provider', 'leagues', 'items', 'history', 'status'];
  const rows = reports.map((r) => [
    r.provider,
    String(Object.keys(r.leagues).length),
    `${r.totalItems} ${r.itemKind}`,
    r.earliestYear !== undefined ? `${r.earliestYear}-${r.latestYear}` : '—',
    r.ok ? (r.note?.startsWith('sampled') ? 'ok (sampled)' : 'ok') : (r.requestsUsed === 0 ? 'skipped' : 'error'),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const fmt = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(fmt(header));
  console.log(widths.map((w) => '─'.repeat(w)).join('  '));
  for (const row of rows) console.log(fmt(row));
  console.log(
    '\nReminder: balldontlie baseline = 361 league-carrying events total ' +
      '(UFC 189 · PFL 76 · LFA 37 · DWCS 20 · CW 16 · ONE 10 · RIZIN 7 · Invicta 3 · Bellator 3), OKTAGON = 0.',
  );
  console.log('A candidate is only worth switching to if it clearly beats that on breadth AND/OR depth.');
}

async function main() {
  console.log('MMA data-provider coverage probe — counts real coverage, not marketing claims.\n');
  const anyKey = ['BALLDONTLIE_API_KEY', 'APISPORTS_KEY', 'SPORTSDATAIO_KEY'].some((k) => process.env[k]);
  if (!anyKey) {
    console.log('No provider keys found in the environment. Set at least one and re-run:');
    console.log('  BALLDONTLIE_API_KEY  (already in .env normally) — the incumbent baseline');
    console.log('  APISPORTS_KEY        free 100 req/day — https://dashboard.api-football.com');
    console.log('  SPORTSDATAIO_KEY     free trial — https://sportsdata.io/mma-ufc-api');
    return;
  }
  // Run sequentially so pacing/budget logging stays readable and providers
  // don't contend; each is independent and self-contained.
  const reports: ProviderReport[] = [];
  for (const probe of [probeBalldontlie, probeApiSports, probeSportsDataIO]) {
    const r = await probe();
    printReport(r);
    reports.push(r);
  }
  printComparison(reports);
}

main().catch((e) => {
  console.error('\nUnexpected fatal error:', e);
  process.exit(1);
});
