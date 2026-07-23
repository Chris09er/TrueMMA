// Automated runtime-error monitor for both Supabase projects.
//
// Why this exists: the project's failure mode has repeatedly been *silence* —
// the production auth-email 500 ran for hours unnoticed because nothing scanned
// for it. This complements the interactive advisor-check habit (linter hints)
// with actual *runtime* signals: edge-function 5xx, auth-level errors, and
// Postgres ERROR/FATAL over the last 24h, on stage AND production.
//
// Runs off a single account-level `SUPABASE_ACCESS_TOKEN` (the same token CI
// already holds as a repo secret, and the CLI account owns) via Supabase's
// Management API log-analytics endpoint — no per-project service-role key
// needed, so one credential covers both projects. Project refs are not secret
// (see docs/ARCHITECTURE.md, GitHub Actions) so they're inlined.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=<pat> npm run check:logs
// Exit code 0 = clean, 1 = errors found (or a query/endpoint failure — this
// tool fails loudly rather than silently passing on an unexpected response, so
// a broken query can't masquerade as "all clear"). The scheduled workflow
// (.github/workflows/monitor-supabase.yml) relies on that non-zero exit to
// notify.
//
// The log-analytics endpoint is an unstable/undocumented-guarantee Management
// API surface and the BigQuery-style nested-field SQL below is best-effort.
// Validated live against both projects 2026-07-20: the `logs.all` union endpoint
// backend-errors on a *second-level* unnest (and on unnesting auth_logs'
// metadata at all), so the auth/postgres checks avoid it — see the per-check
// notes below. Re-validate with one live run if a query is ever changed.

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

const PROJECTS = [
  { name: 'production', ref: 'mytdfwceuzgqopndqmjt' },
  { name: 'stage', ref: 'qvjgsbeugllobgwabebv' },
] as const;

// The endpoint caps the window at 24h; keep a small margin.
const WINDOW_HOURS = 23;

// Only surface a handful of example messages per check — enough to see what's
// wrong without dumping the whole window.
const SAMPLE_LIMIT = 20;

type LogCheck = { label: string; sql: string };

const CHECKS: LogCheck[] = [
  {
    label: 'Edge Function 5xx',
    sql: `select cast(timestamp as string) as ts, event_message
          from function_edge_logs
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          where response.status_code >= 500
          order by timestamp desc
          limit ${SAMPLE_LIMIT}`,
  },
  {
    label: 'Auth errors',
    // auth_logs' `metadata` can't be unnested on the `logs.all` union endpoint
    // (it backend-errors), but `event_message` is the raw gotrue JSON line which
    // carries the level, so match on that instead. Validated live 2026-07-20.
    sql: `select cast(timestamp as string) as ts, event_message
          from auth_logs
          where event_message like '%"level":"error"%'
          order by timestamp desc
          limit ${SAMPLE_LIMIT}`,
  },
  {
    label: 'Postgres ERROR/FATAL',
    // `metadata.parsed` is a repeated field, but a *second* unnest on the
    // `logs.all` union endpoint backend-errors ("Retry your query") even though
    // selecting the array works — so index the first element instead of a nested
    // `cross join unnest(m.parsed)`. Postgres log rows carry a single parsed
    // entry, so OFFSET(0) is the row's severity. Validated live 2026-07-20.
    sql: `select cast(timestamp as string) as ts, event_message
          from postgres_logs
          cross join unnest(metadata) as m
          where m.parsed[SAFE_OFFSET(0)].error_severity in ('ERROR', 'FATAL')
          order by timestamp desc
          limit ${SAMPLE_LIMIT}`,
  },
];

async function queryLogs(ref: string, sql: string): Promise<Record<string, unknown>[]> {
  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_HOURS * 3600 * 1000);
  const params = new URLSearchParams({
    sql,
    iso_timestamp_start: start.toISOString(),
    iso_timestamp_end: end.toISOString(),
  });
  const url = `https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all?${params.toString()}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — ${text.slice(0, 300)}`);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
  }

  // The endpoint has returned `{ result: [...] }` historically; accept a bare
  // array or a `data` field too, and fail loudly on anything else rather than
  // treating an unexpected shape as "no errors".
  const rows = (body as { result?: unknown; data?: unknown }).result ?? (body as { data?: unknown }).data ?? body;
  if (!Array.isArray(rows)) {
    throw new Error(`Unexpected response shape (no result array): ${JSON.stringify(body).slice(0, 200)}`);
  }
  return rows as Record<string, unknown>[];
}

async function main() {
  if (!ACCESS_TOKEN) {
    console.error('✖ SUPABASE_ACCESS_TOKEN is not set. Export it (or set the CI secret) and retry.');
    process.exit(2);
  }

  let hadErrors = false;
  let hadFailures = false;

  for (const project of PROJECTS) {
    console.log(`\n=== ${project.name} (${project.ref}) — last ${WINDOW_HOURS}h ===`);
    for (const check of CHECKS) {
      try {
        const rows = await queryLogs(project.ref, check.sql);
        if (rows.length === 0) {
          console.log(`  ✓ ${check.label}: none`);
          continue;
        }
        hadErrors = true;
        console.log(`  ✖ ${check.label}: ${rows.length}${rows.length === SAMPLE_LIMIT ? '+' : ''} in window`);
        for (const row of rows.slice(0, 5)) {
          const ts = String(row.ts ?? '').slice(0, 19);
          const msg = String(row.event_message ?? '').replace(/\s+/g, ' ').slice(0, 160);
          console.log(`      ${ts}  ${msg}`);
        }
        if (rows.length > 5) console.log(`      … and ${rows.length - 5} more`);
      } catch (err) {
        hadFailures = true;
        console.log(`  ⚠ ${check.label}: check FAILED — ${(err as Error).message}`);
      }
    }
  }

  console.log('');
  if (hadFailures) {
    console.error('⚠ One or more checks could not run (see above) — treat as a red result until fixed.');
    process.exit(1);
  }
  if (hadErrors) {
    console.error('✖ Runtime errors found in the window (see above).');
    process.exit(1);
  }
  console.log('✓ No runtime errors in either project over the window.');
}

main().catch((err) => {
  console.error('Unexpected failure:', err);
  process.exit(1);
});
