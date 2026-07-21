# True MMA — Technical Architecture

Project name is "True MMA" as of 2026-07-18 (renamed from "MMAPocket",
itself renamed from "MMA Pocket" on 2026-07-15). Unlike the previous
rename, this one went all the way through: GitHub repo
(`Chris09er/MMAPocket` → `Chris09er/TrueMMA`, old URL redirects
automatically), `app.json` (`name`, `slug: mma-pocket` → `true-mma`,
`ios.bundleIdentifier`/`android.package: com.mmapocket.app` →
`com.truemma.app`), `package.json` name, AsyncStorage key prefixes
(`mma-pocket:*` → `true-mma:*` in `notifications.ts`/`i18n.tsx`/
`favorites.ts` — harmless since no app store release has happened yet, so
no real user data is at stake), and the EAS project itself (slug can't be
changed on an existing project, so this created a **new** EAS project,
`@chris09er/true-mma`, id `3bac330a-fffa-4c5c-b561-c12757f6c72d` — the old
`@chris09er/mma-pocket` project, id `b1268f4e-d87a-450b-b2aa-1aaeaad172f2`,
still exists on EAS but is now orphaned/unused). `EXPO_PUBLIC_SUPABASE_URL`
/ `EXPO_PUBLIC_SUPABASE_ANON_KEY` were re-registered as EAS env vars on the
new project for all three environments. The Supabase project itself was
**not** renamed/recreated — same backend, only the client-facing identity
changed. Domain (`true-mma.com`) and IONOS SMTP setup already matched this
name from the previous rename, so nothing needed to change there.

Living document. Update this alongside the code whenever a feature, schema
change, or architectural decision lands — not as a separate cleanup pass.
For product scope (what's in/out of scope), see the project's own
conversations/decisions with the maintainer; this file is technical only.

**Companion doc:** [`docs/ecosystem-overview.html`](ecosystem-overview.html)
is the visual map of the same system — which service plays which role, the
five paths data travels, environments, cost/limits, known gaps. It is
deliberately shallow and aimed at re-orientation after time away; this file
is where detail, reasoning and gotchas belong. Keep them consistent: when a
change alters the shape of the system (a service, a data path, the pipeline,
a cost/limit, or a known gap), update both in the same commit. See
[`AGENTS.md`](../AGENTS.md) for the exact trigger list. A change that only
adds detail or a lesson belongs here alone — the map shouldn't move when the
terrain hasn't.

## Tech stack

- **App:** React Native + Expo SDK 54 (managed workflow), TypeScript, no
  Expo Router — plain `@react-navigation` (bottom tabs + a native stack per
  tab that needs one). `react-native-calendars` for the events calendar
  view — pure JS, no native module.
- **Backend:** Supabase (Postgres + PostgREST + `pg_net`), region
  eu-central-1. No custom server — the only "backend logic" is SQL
  (triggers/functions) plus Node sync scripts run on a schedule.
- **External data source:** balldontlie.io MMA API (paid ALL-STAR tier),
  synced into Supabase on a schedule via GitHub Actions (see
  [balldontlie sync](#balldontlie-sync)), never called from the app itself.
- **Repo:** `Chris09er/TrueMMA` on GitHub, **public** (since 2026-07-18 —
  needed for unmetered GitHub Actions minutes for the live-event sync; git
  history was checked for leaked secrets before flipping visibility, none
  found — real secrets only ever lived in `.env` (gitignored) and GitHub
  Actions repo secrets, neither of which visibility affects).
- **Build:** EAS Build for a development client (required — see
  [Push notifications](#notifications) for why Expo Go isn't enough).

## Environments (dev / stage / main)

Set up 2026-07-19, modeled on a Salesforce-style org promotion pipeline
(the maintainer's background) adapted to a stack with no declarative
UI/org to develop against:

- **`dev` branch** — local development only, no dedicated backend or
  infra. There's nothing analogous to a "dev org" here since this is
  plain code, not declarative metadata — a developer's own machine plus
  whichever Supabase project they point their local `.env` at is enough.
  As of 2026-07-19, local `.env` and the EAS `development` environment
  (used by the `development` build profile / dev-client APK) both point
  at the **stage** Supabase project — originally left pointing at prod
  from before this pipeline existed, switched deliberately so on-device
  testing can't accidentally read/write real production data.
  `SUPABASE_SERVICE_ROLE_KEY` in local `.env` is the **stage** service-role key
  (a `sb_secret_...` key — verified 2026-07-20: it authorizes against the stage
  project and 401s against prod), matching the stage `EXPO_PUBLIC_SUPABASE_URL`
  above, so a local sync run can't touch prod either. (An earlier note here said
  it was still the prod key — that was superseded when the stage key was put in
  place, see [Known open items](#known-open-items). Anything needing the prod
  service-role key — e.g. deleting a prod test user — fetches it on demand via
  `supabase projects api-keys --project-ref mytdfwceuzgqopndqmjt --reveal`.)
  Note this
  is orthogonal to the `dev`/`stage`/`main` **git branches**: pushing to
  `dev` triggers no CI at all (`deploy-migrations.yml`/
  `publish-ota-update.yml` only watch `stage`/`main`); a dev-client APK
  reflects whatever's on disk live via Metro (`npx expo start`), not any
  git or CI state. `SUPABASE_SERVICE_ROLE_KEY` in local `.env` is the
  **stage** key (see the dev-branch bullet above) — only the sync scripts read
  it, not the app, so `npm run sync:balldontlie`/`sync:live` run locally target
  stage. Fetch it (if ever re-provisioning) via `supabase projects api-keys
  --project-ref qvjgsbeugllobgwabebv --reveal` or the stage dashboard.
- **`stage` branch** — a real, persistent test environment: its own
  Supabase project (`true-mma-stage`, ref `qvjgsbeugllobgwabebv`,
  eu-central-1, **free tier**), its own EAS build profile (`preview` in
  `eas.json`, already existed — just repointed its EAS env vars at the
  stage project instead of prod), and its own GitHub Actions
  environment/secrets (see below).
- **`main` branch** — production. Existing Supabase project
  (`mytdfwceuzgqopndqmjt`), EAS `production` profile.
- **Promotion flow:** PR `dev` → `stage` (test), PR `stage` → `main`
  (release) — mirrors the org-promotion pattern directly.

**Why two free-tier Supabase projects instead of Supabase Branching:**
Branching would require upgrading the *existing prod* project to the Pro
plan (~$25/mo, Branching hangs off the project it branches from) plus
~$0.01344/hour per active branch (~$9.68/mo for one always-on branch) —
roughly $35/mo total, for a pre-launch app with zero users. Two separate
free-tier projects cost $0 (Supabase allows 2 free active projects per
org). Deliberate, discussed trade-off, not a default — see
[Known open items](#known-open-items) for when to revisit (Branching
becomes attractive once the app needs Pro-tier features on prod anyway,
e.g. better backups before a real store release — at that point the
switch is cheap since stage only ever holds disposable test data).

**Supabase CLI adoption:** this project had no CLI-based migration
runner before this — all SQL was pasted by hand into the dashboard's SQL
Editor (see `supabase/migrations_archive/`, kept for historical
reference but no longer replayed). Adopting the CLI properly surfaced an
important gap: `organizations`/`fighters`/`events`/`fights`/
`push_subscriptions` — the tables the very first hand-written migration
already assumed existed — were **never captured as SQL anywhere in this
repo**; they were created directly in the dashboard before any migration
tracking existed. `supabase/migrations/000_baseline_schema.sql` fixes
this: a single squashed baseline captured via `supabase db dump --linked`
+ `supabase db pull` (declarative diff) against the live prod database,
reconciled onto prod's migration history via `supabase migration repair`,
then replayed cleanly onto the new stage project via `supabase db push`.
Going forward, both environments start from the same known-good baseline
and diverge only through new files in `supabase/migrations/`.

- **`supabase/config.toml` exists as of 2026-07-19** (`supabase init`).
  The repo never had one, which is why migrations could previously only be
  validated by deploying them. With it, `npx supabase start` (optionally
  `-x studio,realtime,storage-api,...` to boot only the database) plus
  `npx supabase db reset` replays every migration from `000` against a
  local Postgres — the fastest way to catch a broken migration. Doing
  exactly this caught the `cron.job` permission error in `006` before it
  ever reached an environment. **Run it before pushing any migration.**
  On Windows/Git Bash, prefix `docker cp`/`docker exec` calls that take
  container paths with `MSYS_NO_PATHCONV=1`, or the path gets rewritten
  into a Windows path and the command fails confusingly.
  - **`config.toml` is declarative-only, NOT pushed by the pipeline** —
    `deploy-migrations.yml` runs `supabase db push` (migrations) but never
    `supabase config push`. So the `[auth.*]` blocks (rate limits, email
    settings, etc.) do **not** reach remote; the live auth config is whatever
    the dashboard holds. This is a footgun: several `config.toml` values had
    drifted from the deliberate live state (`email_sent = 2` vs live 100,
    `double_confirm_changes = true` vs live off, email `max_frequency = "1s"`
    vs live 60s) — harmless while nobody runs `config push`, but a single such
    run would silently revert those production decisions. Reconciled 2026-07-21
    so the file mirrors live. **If you ever add `config push` to the pipeline,
    re-audit every `[auth.*]` value against the dashboard first.** Reading live
    auth config: `GET https://api.supabase.com/v1/projects/{ref}/config/auth`
    with a `supabase login` PAT (Bearer) — there is no MCP tool and it is not in
    Postgres, so this is the only way to audit rate limits.
- `supabase db pull`/`db diff` need a local Docker-backed shadow
  database (Postgres running in a container) — Docker Desktop is now a
  project prerequisite for anyone doing schema work with the CLI. Plain
  `supabase db dump --linked` (used for the initial baseline capture)
  does **not** need the shadow database, only Docker itself (to run the
  correctly-versioned `pg_dump` in a container) — useful to know if
  Docker Desktop / WSL2 isn't set up yet on a given machine.
- No DB password needed for any of this, locally or in CI — a
  `SUPABASE_ACCESS_TOKEN` (personal access token) is sufficient for
  `supabase link`/`db push`/`db pull` etc. against a project the token's
  account owns; Supabase mediates the Postgres connection via the
  Management API rather than requiring the raw DB password.
- **Supabase MCP server, added 2026-07-20** (`.mcp.json`, project-scoped): two
  entries, `supabase` (stage, `qvjgsbeugllobgwabebv`, full read/write) and
  `supabase-prod` (production, `mytdfwceuzgqopndqmjt`) — deliberately separate.
  Lets an agent query logs/tables/migrations/linter-advisors and run SQL
  directly instead of routing through manual dashboard copy-paste. No secrets
  in the file itself; each server needs a one-time interactive `claude /mcp`
  authentication per machine. **2026-07-20: `read_only=true` was removed from
  the `supabase-prod` URL to make production read/write** (that URL param was the
  only gate — there is no dashboard-side MCP read-only toggle). Caveat that bit
  us once: a running session binds the server URL at start, so a `/mcp reconnect`
  does **not** pick up the edited URL — a full Claude Code restart is required
  before the write scope applies (a prod `deploy_edge_function` still errored
  `Cannot deploy … in read-only mode` after only a reconnect, which is why that
  day's prod redeploy went via the CLI). Until a restart is done, prod writes
  must use the Supabase CLI.

**GitHub Actions:**
- Two GitHub **Environments** exist (`production`, `stage`), each with
  its own scoped secrets: `EXPO_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `BALLDONTLIE_API_KEY` (same balldontlie
  key/quota reused across both — a second ALL-STAR subscription wasn't
  considered worth it pre-launch). A single repo-level secret,
  `SUPABASE_ACCESS_TOKEN`, is shared across environments since it's an
  account-level credential, not project-specific; each environment has
  its own `SUPABASE_PROJECT_REF` **variable** (not a secret — project
  refs aren't sensitive).
- **`.github/workflows/deploy-migrations.yml`** (new) — runs
  `supabase db push` on every push to `main`/`stage` that touches
  `supabase/migrations/**`, targeting the matching environment via
  `environment: ${{ github.ref_name == 'main' && 'production' ||
  'stage' }}`. This is the actual promotion mechanism for schema changes
  — write a migration once, it deploys to whichever branch it lands on.
- The two balldontlie sync workflows
  (`sync-balldontlie-full.yml`/`sync-balldontlie-live.yml`, see
  [balldontlie sync](#balldontlie-sync)) each got split into
  `sync-production` and `sync-stage` jobs, each pinned to its
  environment/branch/secrets. The 5-minute live-event check uses the same
  cadence for both since it's already near-free when nothing is live (but
  see the delivery caveat under [balldontlie sync](#balldontlie-sync) — that
  cadence is not what actually runs).
- Stage's full sync ran **hourly** until 2026-07-19, now **twice daily**
  (`41 4,16 * * *`). Hourly meant 24 full syncs/day against deliberately
  disposable test data, and its slots drifted into production's — two
  concurrent syncs each pacing at ~54 req/min against balldontlie's
  60 req/min ALL-STAR limit could push past it, and a sustained 429 run
  aborts the sync after `MAX_RATE_LIMIT_RETRIES`. The `league_ids[]` fix
  (see [balldontlie sync](#balldontlie-sync)) largely defuses this on its
  own, but the cadence and the guard below are the actual fix.
- **All four workflows now declare a `concurrency:` group** (added
  2026-07-19). Previously none did, so a slow run plus the next scheduled
  trigger could overlap. `deploy-migrations.yml` is the one that mattered
  most: `supabase db push` advances remote migration history, so two
  concurrent runs could apply against a half-migrated schema — it queues
  (`cancel-in-progress: false`) rather than cancelling, since a cancelled
  migration deploy could leave migrations half-applied. `publish-ota-update`
  uses `cancel-in-progress: true` (only the newest bundle matters). All jobs
  also got `timeout-minutes`, so a hung run fails in minutes instead of
  occupying a runner until GitHub's 6-hour default, and `setup-node` now
  caches npm downloads.
- **Important GitHub platform quirk, hit while setting this up:** a
  *brand-new* workflow file is not `workflow_dispatch`-able at all —
  not even against the branch it was authored on — until it exists on
  the repo's **default branch** (`main`). Scheduled (`cron`) triggers
  have the same restriction (GitHub only reads `schedule:` from the
  default branch's copy of a workflow, regardless of what other branches
  contain). This is why `deploy-migrations.yml` had to be merged all the
  way to `main` before it could be test-triggered at all — budget for
  this when adding a new workflow in the future, it can't be validated
  in isolation on a feature branch first.
- **EAS Update (OTA) channels**, set up 2026-07-19 — see
  [Build & deployment](#build--deployment) and
  [Known open items](#known-open-items) for the one remaining manual step
  (`EXPO_TOKEN` secret + a fresh dev build).

## Data model

Tables (Supabase Postgres), all with RLS enabled:

| Table | Purpose | Client write access |
|---|---|---|
| `organizations` | Leagues/promotions (UFC, OKTAGON, + 9 auto-synced) | none (read-only) |
| `fighters` | Fighter roster + record + tale-of-the-tape | none (read-only) |
| `events` | Event calendar entries + status + broadcast segment times | none (read-only) |
| `fights` | Matchups within an event, incl. results + card segment | none (read-only) |
| `push_subscriptions` | Device push token ↔ followed fighter, optional `user_id` | **insert/select/delete** (anon, or own rows if logged in) |
| `organization_follows` | Device push token ↔ followed league/org, optional `user_id` — same shape as `push_subscriptions` | **insert/select/delete** (anon, or own rows if logged in) |
| `fight_votes` | Device id ↔ picked fighter per fight ("who wins?") | **insert/select/update** (anon, no login concept at all) |
| `profiles` | Login-only: nickname + optional `timezone_override` per account (`id` = `auth.users.id`) | own row only |
| `event_follows` | Login-only: user ↔ followed event (profile visibility) | own rows only |
| `fighter_favorites` / `event_favorites` | Login-only: user ↔ favorited fighter/event | own rows only |

`push_subscriptions` and `organization_follows` are the exceptions to "app
is read-only" for anonymous users — they're how the fighter-follow and
league-follow bells register/unregister without requiring login.
`fight_votes` goes further still: it has no login-gated path at all, keyed
purely on a locally-generated device id (`src/lib/voting.ts`), independent
of the push token so voting never triggers the OS notification-permission
prompt. See [Notifications](#notifications), [Login / Profile](#login--profile),
and [Voting](#voting).

`fighters.primary_organization_id` (added 2026-07-19) is a best-effort
"which org is this fighter currently in" column, populated by the sync
scripts from whichever fight/event a fighter was most recently synced
from — a fighter who has switched organizations shows only their latest
one, not a full history. Used solely to power the fighter-list org filter,
see [App structure](#app-structure).

`events.league_start_push_sent_at` (added 2026-07-19) tracks whether the
league-start push (see [Notifications](#notifications)) has already fired
for an event, so the 5-minute live-poll doesn't resend it every cycle.

**Sync idempotency:** `organizations`, `events`, `fighters`, and `fights`
each have a nullable `external_id integer unique` column, populated by the
balldontlie sync script and left `null` for manually-entered rows (e.g.
OKTAGON, which balldontlie doesn't cover). Postgres unique constraints allow
multiple `null`s, so manual and synced rows coexist safely. The sync
upserts on `external_id`, so re-running it never creates duplicates.

Data entry: `organizations`/OKTAGON `events`/`fighters`/`fights` are
maintained manually via the Supabase Table Editor or SQL Editor; everything
else (UFC + 9 other leagues) is populated by
[`scripts/sync-balldontlie.ts`](../scripts/sync-balldontlie.ts).

## App structure

- `App.tsx` — root: `ThemeProvider` → `LocaleProvider` → `AuthProvider` →
  `NavigationContainer` (theme-aware, see [theme.tsx](#shared-lib)) → bottom
  tabs.
- **Navigation** (`src/navigation.ts`): `RootTabParamList` (EventsTab,
  FightersTab, ProfileTab, ContactTab — `LanguageTab` removed 2026-07-20,
  folded into a settings gear icon on `ProfileScreen`, see [Login /
  Profile](#login--profile)) +
  `EventsStackParamList` (EventList → EventDetail) and
  `FightersStackParamList` (FighterList → FighterDetail), both native
  stacks nested inside their tab. Both `RootTabParamList.EventsTab` and
  `.FightersTab` are typed as `NavigatorScreenParams<...>` (not
  `undefined`) so cross-tab navigation type-checks in both directions —
  tapping a fighter from `EventDetailScreen` (Events stack → Fighters
  stack) and tapping an opponent/event from `FighterDetailScreen`
  (Fighters stack → Events stack): `navigation.navigate('FightersTab', {
  screen: 'FighterDetail', params: {...} })` / `navigation.navigate
  ('EventsTab', { screen: 'EventDetail', params: {...} })`. Standard React
  Navigation pattern, not a workaround.
- **Screens** (`src/screens/`):
  - `EventListScreen` — list/calendar view toggle (top `SegmentedControl`);
    list mode: **Vergangene / Heute / Kommende** `SegmentedControl`, in that
    order (reordered 2026-07-20; "Kommende" stays the default-selected
    segment). `getEvents()` in `queries.ts` (backing `getUpcomingEvents`/
    `getPastEvents`) compares against local start-of-today, not the current
    instant (changed 2026-07-20) — so "Kommende" always includes all of
    today's events too, intentionally overlapping with the "Heute" tab
    (feedback: a user expects today's card under "upcoming", not just a
    separate bucket), and "Vergangene" never includes an event from today
    even one that already concluded. "Heute" itself is `getTodayEvents()` —
    events on today's local calendar date **or** still `isEventLive()`
    (covers a card that started before midnight and hasn't rolled into
    "past" yet). Org filter (via the shared `FilterModal`, see the Components list below)
    is scoped to
    whichever timeframe/orgs actually have events — `listOrganizations` is
    derived client-side from the currently-loaded (unfiltered-by-org)
    `events` array, filtering the full `organizations` list down to only
    the org ids present (changed 2026-07-20: org filtering itself moved
    client-side too, so switching the org filter no longer refetches —
    only switching timeframe does). If the selected org has no events in a
    newly-active timeframe, the selection resets automatically instead of
    silently filtering the list to empty. Text search (client-side
    substring match), pull-to-refresh; calendar mode: month grid
    (`react-native-calendars`, pure JS — no native module, no EAS rebuild)
    with a dot on days that have events, fed per-month by
    `getEventsInRange()` (independent of the upcoming/past split, still
    filtered server-side by org — calendar mode's org list is the full,
    unfiltered `organizations`, not `listOrganizations`, since "does this
    league have an event this month" isn't the same question), tapping
    a day filters the list below to that day. Per-event reminder bell +
    favorite heart (only bell rendered for events where `isEventUpcoming()`
    is true, heart always). A pulsing
    red `LiveBadge` (`src/components/`, RN's built-in
    `Animated` API — no new dependency) renders on any card where
    `isEventLive()` is true (also used in `EventDetailScreen`'s header);
    see `isEventLive()` in `queries.ts` — same ~6h post-start buffer
    heuristic already used by `scripts/sync-live-event.ts`, kept in sync
    manually if that buffer ever changes.
  - `EventDetailScreen` — event header (venue incl. `venue_state`, a red
    "Event cancelled" banner if `event.status === 'cancelled'`, and
    Early Prelims/Prelims/Main Card broadcast start times when
    balldontlie provides them) + fight card list in **chronological
    fight-night order** (main card first with the true main event on top,
    then prelims, then early prelims — see `sortFightCard()` in
    `queries.ts`: **`card_segment` is the primary sort key, `card_position`
    only breaks ties within a segment.** balldontlie's `card_position`
    (`fight_order`) restarts at 1 separately per segment — sorting by
    `card_position` alone interleaves fights from different segments,
    confirmed against live data where a card's real main event and its
    prelims' own headliner both had `card_position: 1`. Cancelled fights
    (`status === 'cancelled'`) always sort last and render at 50% opacity
    with a red "Abgesagt"/"Cancelled" tag — not yet observed in the wild
    as of this writing, since balldontlie doesn't always mark a pulled
    fight cancelled promptly, but the sort/tag both key off the real
    `status` field so this activates automatically whenever balldontlie
    does flag one, no code change needed). Each fight card also shows a
    main-event tag, a separate outlined "Prelims Main Event" tag (the
    lowest-`card_position` fight within `card_segment === 'prelims'`),
    title-fight tag, scheduled rounds, and (for past fights) the result
    incl. `result_method_detail` when balldontlie has it (more specific
    than `result_method`, e.g. exact submission type). A live badge next
    to a cancelled-banner-style slot in the header (see above); an
    `OrganizationFollowBell` next to the org name (added 2026-07-19, see
    [Notifications](#notifications)); and, for any fight with no result
    yet, a vote UI (see [Voting](#voting)).
  - `FighterListScreen` — search, a single "Filter" button opening the
    shared `FilterModal` (see [App structure → Components](#app-structure))
    with independently-combinable (AND) sections — Organisation
    (`primary_organization_id`, see [Data model](#data-model)),
    Gewichtsklasse, Nationalität. Gewichtsklasse is itself split into two
    `FilterSection`s, Männer/Frauen (added 2026-07-20, feedback: the flat
    alphabetical/weight-ordered list mixed both) — split purely by whether
    `weight_class` starts with `"Women's "` (confirmed against the live DB:
    balldontlie already prefixes every women's division that way, e.g.
    `"Women's Bantamweight"` vs `"Bantamweight"` — no schema change needed,
    the women's-section chip label strips the prefix for display, the
    stored/matched value keeps it). All three still derive their options
    client-side from the already-loaded fighter list. Pull-to-refresh,
    per-fighter follow bell. Tapping a fighter opens `FighterDetailScreen`
    (used to jump straight to Tapology/Sherdog — now shows an in-app
    profile first, external links are explicit buttons there).
  - `FighterDetailScreen` — photo/name/nickname/nationality, W-L-D record
    (`record_wins`/`record_losses`/`record_draws`, plus a "(N NC)" suffix
    if `record_no_contests > 0`), a "Tale of the Tape" card (weight class,
    height/reach converted from balldontlie's inches to cm, stance, date
    of birth, birth place — section only renders the rows that have data),
    Tapology/Sherdog link buttons, follow bell, upcoming fight (if any,
    via `isEventUpcoming`) and full fight history (opponent, event,
    win/loss by comparing `result_winner_id`), fed by `getFighterFights()`
    in `queries.ts` (fetches both `fighter1_id`/`fighter2_id` sides via
    `.or()`, sorted by the embedded event's date client-side). Reachable
    both from `FighterListScreen` and from tapping a fighter's name in
    `EventDetailScreen`'s fight card (cross-tab navigation, see
    Navigation above). Within each upcoming/history row, the opponent name
    and event name are themselves tappable, navigating on to that
    opponent's `FighterDetail` or the event's `EventDetail` respectively.
  - `ContactScreen` — simple settings-style screen. Shows the support email
    as selectable `Text` (RN's built-in `selectable` prop — native
    long-press-copy, no new dependency) above the mailto button, and
    guards `Linking.openURL` with `Linking.canOpenURL` first, falling back
    to an alert instead of failing silently if no mail client is
    configured.
  - `ProfileScreen` — logged-out: login/signup form + forgot-password (OTP)
    flow. Logged-in: nickname, change email/password,
    followed fighters/events/**organizations** (added 2026-07-19) and
    favorited fighters/events (reusing the same bell/heart components to
    unfollow/unfavorite directly from the list), logout. **Settings gear
    icon (2026-07-20, replaces the old standalone `LanguageScreen` tab)** —
    top-right on `ProfileScreen`, shown in both logged-in and logged-out
    states, opens `SettingsModal` (built on the shared `FilterModal` shell):
    language picker (`SUPPORTED_LOCALES`, flag emoji per entry), a
    System/Light/Dark appearance picker (`useTheme().themeOverride` +
    `setThemeOverride()`, persisted to AsyncStorage — see `theme.tsx`
    below), and — only when logged in, since it's stored server-side on the
    user's profile — the timezone-override picker (moved out of the main
    scroll view into the modal). See [Login / Profile](#login--profile) and
    [Favorites](#favorites).
- **Shared lib** (`src/lib/`):
  - `theme.tsx` (renamed from `theme.ts` 2026-07-20 — see [Known open
    items](#known-open-items) for the visual redesign this is part of) —
    dual dark/light color palettes ("Chrome & Indigo" — replaced the
    original "Steel & Ember" orange palette 2026-07-20, feedback: orange
    read as "unsexy"; electric-blue primary accent, cool silver secondary,
    danger deliberately a different hue from the accent so an active filter
    never reads as an error, `live` kept separate from `danger` for the same
    reason), a `typography` scale
    (Barlow Condensed for display/headings, Inter for body — both loaded via
    `useFonts` in `App.tsx`, each `require()`d as an individual `.ttf` file
    rather than importing the named exports from `@expo-google-fonts/*` —
    those packages' index modules `require()` every weight of the family
    unconditionally, so importing even one named export pulled all ~34 font
    files, most unused, into the bundle), spacing/radius tokens,
    `minTapTarget` (44 — iOS HIG/Material minimum). Exports a
    `ThemeProvider`/`useTheme()` — defaults to system-driven via
    `useColorScheme()`, now overridable (2026-07-20, see [Login /
    Profile](#login--profile)'s settings gear) via
    `themeOverride`/`setThemeOverride()`, a `'system' | 'light' | 'dark'`
    persisted to AsyncStorage the same way `i18n.tsx`'s `LocaleProvider`
    persists the locale. Wired through the **entire**
    app: `App.tsx`'s navigator chrome and every screen/component call
    `useTheme()` for `colors` and build their `StyleSheet` via a
    `makeStyles(colors)` factory wrapped in `useMemo(() => makeStyles(colors),
    [colors])`, rather than a module-level `StyleSheet.create` baked to one
    palette at import time. Screen-local helper components that render
    inside a `FlatList`/`map` (`FighterLink`, `BroadcastTimes`,
    `FightVoteRow` in `EventDetailScreen`; `TaleOfTheTape`, `FightRow` in
    `FighterDetailScreen`) take `styles` as a prop from their parent instead
    of calling `useTheme()` themselves, to avoid redundant context reads in
    a loop. `useCommonStyles()` is the theme-aware replacement for the old
    static `commonStyles` export (same `.center`/`.error`/`.empty` shape).
    The flat `colors` export still exists but now only backs the
    `App.tsx` splash placeholder shown before fonts finish loading and
    `ThemeProvider` mounts — nothing else imports it. Light mode therefore
    now reaches screen content, not just the nav chrome, though it's still
    system-driven only (no manual in-app toggle).
  - `i18n.tsx` — hand-rolled DE/EN dictionary + React context
    (`LocaleProvider`/`useLocale`), persisted via AsyncStorage. Add a
    language by adding its code to `Locale`, an entry in
    `SUPPORTED_LOCALES`, and a matching translations object.
  - `dateFormat.ts` — single `formatEventDate()` used by both event screens.
  - `queries.ts` — all Supabase reads, plus `isEventUpcoming()` (the single
    source of truth for "is this event in the future" — used by both list
    and detail screens so the reminder bell's visibility never disagrees
    between them).
  - `types.ts` — DB row shapes as consumed by the app. `EventDetail` is
    `Omit<EventListItem, 'organization_id'>`, not a separate literal.
  - `notifications.ts` / `pushSubscriptions.ts` — see below.
- **Components** (`src/components/`): `BellIconButton` (shared
  presentational icon-button, `icon`/`offsetRight` props), `EventReminderBell`,
  `FighterFollowBell` (each wraps `BellIconButton`, shows an `Alert` after
  a successful toggle explaining what enabling/disabling the reminder
  does), `EventFavoriteHeart`, `FighterFavoriteHeart` (same pattern, see
  [Favorites](#favorites)).
  - **Filter system (redesigned 2026-07-20, replaces the old `FilterButton`
    below).** Three components, each for a distinct interaction that used
    to look identical: `SegmentedControl` (exclusive small mode switches —
    `EventListScreen`'s list/calendar and today/upcoming/past — a single
    pill track, not separate buttons, so it visually reads as "mode" rather
    than "filter"); `FilterChip` (a single multi-value filter option — 44pt
    tap target, `Pressable`'s `pressed` state renders `pressedStyle` from
    `theme.tsx`, active state uses the Ember accent, no `numberOfLines` cap
    so a long German label grows the chip instead of being silently cut
    off); `FilterModal`/`FilterSection` (the shared bottom-sheet shell —
    previously `FighterListScreen` had its own bespoke modal and
    `EventListScreen` used an always-visible horizontal-scroll chip row
    instead, two different UX patterns for the same concept). Both list
    screens now open the same modal pattern for their filters
    (`EventListScreen`: organization only; `FighterListScreen`:
    organization/weight class/nationality) via a `Filter (N)` button
    showing the active-filter count. This also fixes the documented
    discoverability problem where "PFL only shows up if you scroll" —
    everything is now inside a modal, not an easy-to-miss scroll row.
    Weight-class chips are ordered by `sortWeightClasses()` in `queries.ts`
    (light-to-heavy by real division, e.g. `Bantamweight` before
    `Featherweight`; `weight_class` is free text from balldontlie, not a
    fixed enum, so unrecognized values fall back to alphabetical rather
    than erroring) instead of the previous plain alphabetical sort, which
    put divisions in an order with no real-world meaning.
  - The old `FilterButton`'s real-device Android bug (inactive chips
    rendering as an unreadable blank/white sliver without a concrete style
    object per state, or its containing horizontal `ScrollView` collapsing
    without an explicit `flexGrow: 0` + height) no longer applies —
    `EventListScreen`'s persistent horizontal org-filter row is gone,
    replaced by the modal above. `FilterChip` still follows the same
    defensive pattern (concrete style per state, no bare `false` in a style
    array) since the underlying RN behavior that caused it hasn't changed;
    worth reapplying the explicit-height fix proactively if a future screen
    ever needs a persistent horizontal scroll row of buttons again.
  - Tab bar icons switched from Ionicons to MaterialCommunityIcons
    (2026-07-20, same bundled `@expo/vector-icons` font set, no new
    dependency) for a less generic-utility-app feel — e.g. `boxing-glove`
    for Fighters instead of `people`.
  - `SettingsModal` (2026-07-20) — built on the shared `FilterModal` shell,
    see [Login / Profile](#login--profile) for what it contains and why
    `LanguageScreen` was removed in favor of it.
  - `OrganizationFollowBell` (2026-07-20) — now shows a success `Alert` on
    toggle explaining the effect ("you'll be notified when an event from
    this league starts"), matching the pattern `EventReminderBell` and
    `FighterFollowBell` already had; it was the one bell missing this
    explanation. Note the fighter-follow bell's explanation is accurate to
    its *current* behavior (notifies when the fighter is booked for a new
    fight) — notifying when that fighter's fight actually **starts** is a
    distinct, not-yet-built feature (see [Known open
    items](#known-open-items)), don't reword the alert to promise it before
    the trigger exists.

## Notifications

Two independent mechanisms, because they have fundamentally different
constraints:

1. **Event reminders** (`src/lib/notifications.ts`) — **local** device
   notifications via `expo-notifications`, scheduled on-device for a
   specific event's start time, tracked in AsyncStorage
   (`true-mma:event-reminder:<eventId>` → notification id). No backend
   involved. Works in Expo Go.
2. **Fighter-follow push** (`src/lib/pushSubscriptions.ts`) — **real**
   push notifications, since the app needs to notify a user even when it's
   closed, triggered by a database change (a new fight involving a
   followed fighter). This requires:
   - A device push token (`Notifications.getExpoPushTokenAsync`), stored
     in `push_subscriptions` keyed by `(push_token, fighter_id)`.
   - A Postgres trigger (`notify_fighter_added_to_fight`, uses the
     `pg_net` extension) that fires `AFTER INSERT ON fights` and POSTs
     directly to Expo's push API (`https://exp.host/--/api/v2/push/send`)
     for every matching subscription — **no Supabase Edge Function**, kept
     entirely in SQL to avoid needing the Supabase CLI. See
     `push_subscriptions` in [Data model](#data-model) for the SQL.
   - **Expo Go cannot receive real push notifications since SDK 54** — a
     development build (EAS) is required to test this path. Local
     reminders are unaffected.
   - **Also fires on fight start** (2026-07-20, `dev` only — see [Known open
     items](#known-open-items)), piggybacked onto `send_league_start_pushes()`
     below rather than its own trigger, since "did this event start" is
     already that function's job and there's no per-fight start time to key
     a separate trigger off anyway.
3. **League-follow push** (`src/lib/organizationFollows.ts`, added
   2026-07-19) — same push-token/anonymous-follow shape as fighter-follow,
   but fires when a followed organization's event actually **starts**, not
   when it's created, so it can't be a simple `AFTER INSERT` trigger. It
   needs something that ticks on a timer.

   **Driven by `pg_cron` inside Supabase since 2026-07-19**
   (`supabase/migrations/006_league_start_push_pg_cron.sql`). It originally
   piggybacked on `scripts/sync-live-event.ts`'s 5-minute GitHub Actions
   poll, but GitHub delivers that schedule only about hourly (measured —
   see [balldontlie sync](#balldontlie-sync)), so a "starts now" push could
   land hours late. `pg_cron` runs in the database on a real timer and
   actually ticks every minute. **Only the push moved**; the live *data*
   refresh stays in Node, since it needs an outbound API call with a key
   and JSON mapping — work that doesn't belong in PL/pgSQL — and data
   freshness tolerates the latency that a notification doesn't.

   **Two-phase delivery, because `pg_net` is asynchronous.**
   `net.http_post` returns a request id and, per pg_net's docs, doesn't even
   start the request until the surrounding transaction commits — so a single
   pass cannot know whether the push succeeded. Each tick therefore:
   1. **reconciles** request ids issued by an earlier tick against
      `net._http_response` — a 2xx stamps `events.league_start_push_sent_at`
      (the single source of truth for "done"); anything else clears the
      attempt so it retries;
   2. **issues** new requests for events that just went live, recording the
      request id in `events.league_start_push_request_id`.

   This keeps the retry-on-transient-failure property the Node version had.
   A `pg_try_advisory_lock` guard prevents two ticks from overlapping and
   double-sending.

   **Observability** (`007_league_start_push_health.sql`): because this job
   runs unattended, its failure mode is silence. `public
   .league_start_push_health()` returns one row with whether the job is
   scheduled/active, its last run time and status, minutes since that run,
   how many events are awaiting a push, and how many requests are in
   flight. Callable with a service-role key over the normal API — the
   `cron` schema itself is not reachable through PostgREST, so this is the
   only way to read that state without a direct Postgres connection (which
   this project deliberately doesn't use, see the no-DB-password note under
   [Environments](#environments-dev--stage--main)). Healthy looks like
   `job_active = true`, `last_run_status = 'succeeded'`,
   `minutes_since_last_run < 2`.

   The "which events are waiting" predicate lives in one place, the view
   `public.events_pending_league_start_push`, read by both the sender and
   the health check — deliberately, since this doc already records the ~6 h
   buffer drifting across three copies.

   **The "just went live" window is 30 minutes, deliberately not the ~6 h
   card-duration buffer** used by `isEventLive()`/`sync-live-event.ts`.
   Those answer "is this card still on air" (right for refreshing fight
   data); this answers "did it just start". A push announcing that an event
   is starting has no business firing five hours in, so if the database is
   unreachable longer than that window the push is correctly *dropped*
   rather than sent late. That divergence is intentional — don't "fix" it by
   unifying the two buffers.

**Chunking and delivery receipts, added 2026-07-19
(`supabase/migrations/008_push_chunking_and_receipts.sql`).** Both push paths
above used to build one `net.http_post` per event/fight containing every
matching subscriber — a hard cliff past Expo's 100-message-per-request limit,
and blind to individual message failures (Expo returns HTTP 200 even when a
message fails, most importantly `DeviceNotRegistered` for an uninstalled
app). Both gaps came from the same missing piece — neither path tracked
individual messages past the point of firing `net.http_post` — so this adds
that tracking once, shared by both callers, instead of patching each path
separately:

- **`send_expo_push_chunked(messages, source)`** — the shared replacement for
  both paths' inline `net.http_post`. Splits `messages` into ≤100-message
  chunks (Expo's limit), fires one request per chunk, and records each in
  `push_send_batches` (`net_request_id`, the chunk's ordered `push_tokens`,
  a `source` tag). Returns the request ids it generated, for callers that
  need their own success tracking.
- **`reconcile_push_send_batches()`** — once a batch's response lands in
  `net._http_response`, parses Expo's per-message tickets (positional —
  Expo's response array order matches the request order, it doesn't echo
  the token back) into one `push_tickets` row per message. A send-time
  `DeviceNotRegistered` (no ticket issued at all) triggers immediate
  cleanup; everything else waits for a receipt.
- **`request_push_receipts()` / `reconcile_push_receipts()`** — ≥20 minutes
  after a ticket was created (Expo recommends waiting ≥15 min), batches
  ticket ids (≤1000 per Expo's `/getReceipts` limit) and polls it, updating
  `push_tickets.receipt_status`. A `DeviceNotRegistered` receipt deletes
  every `push_subscriptions`/`organization_follows` row with that
  `push_token` — checked on both tables regardless of which path the ticket
  came from, since a stale token is stale everywhere.
- **`push_maintenance()`** runs the three reconcile/request functions above
  in order, guarded by its own `pg_try_advisory_lock` (independent of
  `send_league_start_pushes`'s lock — different concern). Registered as a
  new `pg_cron` job, `push-maintenance`, on a 5-minute cadence (receipts have
  a built-in 20-minute floor before anything is actionable, so the 1-minute
  cadence `league-start-pushes` needs for latency would just be wasted
  ticks).
- `notify_fighter_added_to_fight()` and `send_league_start_pushes()` both now
  call `send_expo_push_chunked()` instead of `net.http_post` directly.
  League-start's own event-level "did it succeed" tracking (Phase 1/2 in
  [pg_cron above](#notifications)) is unaffected in spirit but now covers an
  *array* of request ids per event
  (`events.league_start_push_request_ids`, replacing the old scalar
  `league_start_push_request_id`) since one event's push can now span
  multiple chunks — stamped `sent_at` only once every chunk in the array
  succeeded.
- `push_send_batches`/`push_tickets`/`push_receipt_batches` are purely
  operational bookkeeping — RLS enabled, no policies, no anon/authenticated
  grants, same treatment as `events_pending_league_start_push`.
- **Verified locally** via `supabase db reset` + fabricated
  `net._http_response` rows (same technique 006/007 used), including a
  discovery made while doing so: the local Supabase Postgres's `pg_net`
  actually performs real outbound HTTP calls (there is network access from
  the container), so a manually-inserted response row can collide with a
  genuine one on the same `net_request_id` if a real `net.http_post` for
  that id was also issued in the test — the fabricated-response tests here
  used request ids from rows inserted directly into `push_send_batches`/
  `push_receipt_batches` (never passed through the real chunked-send
  function) to avoid that collision. Confirmed: >100-follower chunking (150
  followers → 2 batches of 100/50), ticket creation with correct
  token-to-ticket pairing, immediate cleanup on a send-time
  `DeviceNotRegistered`, and cleanup on a delayed (receipt-time) one. **Not
  yet verified against a real uninstalled app** — same caveat the
  league-start push already carries for real end-to-end delivery.

`resolvePushToken()` in `pushSubscriptions.ts` deliberately never prompts
for permission just to *check* follow-state (`isFollowingFighter`) — only
an explicit `followFighter()` call (interactive) may trigger the OS
permission dialog. Concurrent callers share one in-flight token-resolution
promise.

## Login / Profile

Login is **optional** — every existing feature (browsing, fighter-follow,
event reminders) keeps working fully anonymously, same as before. Login is
additive: it gives a user a "Profil" tab (`ProfileScreen`) where they can
see what they follow across devices, pick a nickname, and manage their
email/password. No feature is gated behind login (yet) — see [Known open
items](#known-open-items) if that changes.

- **Auth backend:** Supabase Auth, email+password plus passwordless magic-link
  login (added 2026-07-20, see below — no OAuth yet). `src/lib/supabase.ts`
  persists the session
  (`persistSession: true`, `AsyncStorage` as storage, `autoRefreshToken:
  true`) — previously disabled since the app had no concept of a logged-in
  user. `src/lib/auth.tsx` (`AuthProvider`/`useAuth`) wraps
  `supabase.auth.getSession()` + `onAuthStateChange`, mounted in `App.tsx`
  alongside `LocaleProvider`.
- **No EAS rebuild needed for any of this** — `@supabase/supabase-js` auth
  is pure JS on top of AsyncStorage (already a dependency), no native
  module involved.
- **Password reset without deep linking:** rather than a magic-link email
  redirect (which would need an `app.json` URL scheme + native rebuild),
  password reset uses Supabase's OTP flow: `resetPasswordForEmail()` →
  user receives a 6-digit code by email → app calls
  `supabase.auth.verifyOtp({ type: 'recovery', ... })` +
  `updateUser({ password })`. Required a one-time Supabase dashboard
  change (done, see [Auth emails](#auth-emails) below): the "Reset
  Password" email template references `{{ .Token }}` (the OTP code)
  instead of the default magic-link `{{ .ConfirmationURL }}` — without
  that, users get a link instead of a code and the in-app flow breaks.
- **Email change (OTP, same pattern as reset), fixed 2026-07-20:**
  `updateEmail()` (`auth.tsx`) calls `updateUser({ email })`, which does *not*
  apply the change immediately — Auth sends a 6-digit code to the **new**
  address, and `confirmEmailChange(newEmail, token)` verifies it with
  `verifyOtp({ type: 'email_change', email: newEmail })`. `ProfileScreen`'s
  change-email section switches to a code-entry sub-state (`pendingEmail`) after
  the code is sent, mirroring the signup/reset/magic-link code flows, with a
  Cancel that restores the original address. This flow **requires the auth-email
  hook to handle `email_change`** (added the same day, see [Auth
  emails](#auth-emails)) and **requires "Secure email change" /
  `double_confirm_changes` to be OFF** on both Supabase projects: with it ON,
  Auth demands confirmation from *both* the old and new address (two separate
  mails), which the single-code in-app UI can't complete. `supabase/config.toml`
  currently still has `double_confirm_changes = true` (a CLI default, local-only)
  — the dashboard value on stage/prod is the one that matters and must be set to
  OFF there, same manual per-project sync caveat as the SMTP/template config.
  Before this fix the feature was broken outright on every environment (the hook
  500'd on the unhandled `email_change` type).
- **Anonymous → account linking:** fighter-follow (`push_subscriptions`)
  keeps working without login, keyed by push token as before, now with an
  additional nullable `user_id`. On sign-in, `claimAnonymousFollows()`
  (`src/lib/pushSubscriptions.ts`) attaches this device's already-existing
  anonymous rows (`user_id is null`, matching push token) to the newly
  logged-in account, so follows made before login aren't lost or
  duplicated.
- **Event follows:** event reminders themselves stay 100% local
  (`expo-notifications` + AsyncStorage, unaffected by login). A separate
  `event_follows` table (login-only, no anonymous rows) exists purely so a
  followed event is visible in the profile; `EventReminderBell` writes to
  it as a best-effort side effect alongside the local schedule/cancel call
  — the local reminder is always the source of truth for the bell's
  on/off state.
- **Nickname:** stored in `profiles` (`id` = `auth.users.id`, one row per
  account, auto-created by an `on_auth_user_created` trigger on signup),
  optional, editable anytime from the profile screen. Minimal data
  collection by design — only email (required by Supabase Auth) and an
  optional nickname are collected; no other personal data.
- **SQL:** `supabase/migrations/001_profiles_and_login.sql` (this project
  has no CLI migration runner — run manually in the Supabase SQL Editor,
  same as `push_subscriptions`'s trigger). Includes a manual step: the
  pre-existing anon `push_subscriptions` policies must be looked up and
  dropped by their actual name before the new scoped policies are created,
  since their names weren't recorded anywhere in this repo.

**Auth error handling & form UX (2026-07-20):** found broken during a real
end-to-end device pass right after the SMTP outage below was fixed — worth
treating as a standing pattern, not a one-off patch:

- `AuthResult` (`src/lib/auth.tsx`) changed from a bare `'ok' | 'error'` to
  `{ status: 'ok' } | { status: 'error'; code: string; message: string }`,
  preserving Supabase's real `error.code` instead of discarding it. Every
  `signIn`/`signUp`/`requestPasswordReset`/`confirmPasswordReset`/
  `updateEmail`/`updatePassword` call funnels through this. `src/lib/authErrors.ts`
  maps known codes (`invalid_credentials`, `email_not_confirmed`,
  `over_email_send_rate_limit`, `user_already_exists`, `weak_password`) to a
  specific localized `t.auth.*` message instead of one generic alert — e.g. a
  user with an unconfirmed email now sees "please confirm your email" instead
  of an indistinguishable "something went wrong."
- **`src/lib/i18n.tsx`'s translation data moved to `src/lib/translations.ts`**
  (no React/AsyncStorage imports) so `scripts/check-i18n-parity.ts` (`npm run
  check:i18n`) can import it under plain `tsx`/Node without pulling in RN.
  That script asserts the `de`/`en` objects have identical key shapes
  recursively — `satisfies Record<Locale, unknown>` alone does not catch a
  key present in one locale and missing in the other, and this doc previously
  had no check for that at all.
- **`keyboardShouldPersistTaps`** added to every form `ScrollView` in
  `ProfileScreen.tsx` — first use of this prop in the repo. Without it, RN
  defaults to `'never'`, so tapping a submit button while the keyboard is open
  only dismisses the keyboard on the first tap and requires a second tap to
  actually fire `onPress`. Started as `"handled"`; still reproduced on-device
  with manually-typed input (not just autofill), so changed to `"always"` —
  the stronger guarantee that taps always pass through regardless of whether
  RN recognizes the target as "handling" its own touch, at the cost of a tap
  on empty form space no longer auto-dismissing the keyboard (an acceptable
  trade for a short form). Apply `"always"` to any future screen with a form
  inside a `ScrollView`, not `"handled"` — this project has already seen
  `"handled"` fail to fully solve this.
- **`PasswordField`** (local to `ProfileScreen.tsx`) adds a show/hide eye-icon
  toggle shared by the login/signup password field and both change/reset
  password fields, plus `textContentType`/`autoComplete` autofill hints and
  `returnKeyType`/`onSubmitEditing` field-to-field chaining (email → password
  → submit) so the OS keyboard's "next"/"done" key behaves correctly — none
  of this existed before. The toggle icon has an `accessibilityLabel`
  (show/hide password) for screen readers.
- **`SubmitButton`** (local to `ProfileScreen.tsx`) replaces every form's
  submit `Pressable` — shows an `ActivityIndicator` instead of its label
  while `busy`, so a slow request doesn't look like the tap did nothing (the
  button was already `disabled` while busy, but gave no visual feedback).
- **Network vs. auth errors distinguished:** `toAuthResult()` (`auth.tsx`)
  checks for Supabase's `AuthRetryableFetchError` (thrown for a fetch-level
  failure — no connection, timeout — rather than a real auth rejection, and
  carries no `code`) and maps it to a dedicated `network_error` code/message
  instead of falling through to the generic "check your input" text.
- **Email normalized before every auth call** (`normalizeEmail()` in
  `ProfileScreen.tsx`: trim + lowercase) — an autofill-inserted trailing space
  previously caused a confusing "wrong password" on login even when both
  signup and login used the visually-identical address.
- **Last-used email remembered** (`AsyncStorage`, key
  `true-mma:last-email`), prefilled on `LoggedOutView` mount, saved after a
  successful login or signup — saves retyping it after a logout. Plain local
  storage, no account linkage; a **why-should-I-log-in nudge for anonymous
  users was explicitly deferred**, not part of this pass.

**Locale synced to `auth.users.user_metadata` (added 2026-07-20, first piece
of the planned multilingual-auth-emails work):** `i18n.tsx`'s `LocaleProvider`
only ever stored the locale in AsyncStorage — purely client-side, invisible
to any server-side process. A future auth-email Edge Function (see [Known
open items](#known-open-items)) needs to read it without device access, so:
- `setLocale()` now also calls `supabase.auth.updateUser({ data: { locale } })`
  whenever a session exists — called directly on the `supabase` client rather
  than through `useAuth()`, since `LocaleProvider` sits *above* `AuthProvider`
  in `App.tsx`'s provider tree and has no access to its context.
- `signUp()` (`auth.tsx`) now takes a `locale` parameter and passes it as
  `options: { data: { locale } }`, so even the very first confirmation email
  has a locale to read (no `profiles` row exists yet at that point).
- Verified against stage via a direct signup API call — `user_metadata`
  correctly comes back with `"locale":"de"`.
- Not yet consumed by anything (the Edge Function itself doesn't exist yet)
  — this just closes the gap so that work isn't blocked on it later.

**Password policy (added 2026-07-20):** minimum 8 characters, at least one
letter and one number — `supabase/config.toml`'s `minimum_password_length`
(was 6) and `password_requirements = "letters_digits"` (was unset). **Local
config only** — the same values must also be set manually in both stage and
prod dashboards (Authentication settings), same manual-sync caveat already
documented for SMTP/the OTP template above. `src/lib/passwordPolicy.ts` is
the single source of truth for the rule set on the client — both the live
`PasswordRequirementsChecklist` (shown under any *new*-password field:
signup, password reset, change password — never the login password field,
since existing users may predate this policy and Supabase still allows them
to log in with it, per Supabase's own documented behavior) and each screen's
pre-submit check (disables the submit button until met) import from it, so
they can't silently drift apart. Server-side `weak_password` rejections still
funnel through the structured `AuthResult`/`authErrors.ts` mapping above.

**Timezone override (added 2026-07-19):** device-local time was already
the default everywhere — `formatEventDate()`/`BroadcastTimes`'s
`formatTime()` call `toLocaleDateString`/`toLocaleTimeString` with no
explicit `timeZone`, which already resolves to the device's zone — so this
was purely additive, not a bug fix. `profiles.timezone_override` (nullable
IANA zone name) is only ever settable while logged in; `AuthProvider`
(`src/lib/auth.tsx`) loads it alongside session/user and exposes
`timezoneOverride`/`setTimezoneOverride()` via `useAuth()`, so any screen
can read it without prop-drilling. The picker itself
(`ProfileScreen`) offers a curated list of ~10 zones
(`src/lib/timezones.ts`) relevant to an MMA audience, not all ~400 IANA
zones — "device timezone" (clears the override) is always the first
option and the default for every anonymous user.

### Auth emails

Supabase's built-in email service (used during early development) is
heavily rate-limited and only meant for testing — it also doesn't allow
editing email templates at all without a custom SMTP provider configured,
which is a hard requirement, not just a "nice to have for scale."

- **Domain:** `true-mma.com`, purchased 2026-07-16 specifically to get a
  real sender domain for auth emails — turned out to match the final app
  name ("True MMA", decided 2026-07-18, see the naming note at the top of
  this doc) purely by luck, not by design at the time of purchase.
- **SMTP provider:** IONOS (the domain registrar's own mailbox/SMTP
  service — no separate service like Resend/SendGrid needed, since IONOS
  already provides authenticated SMTP per mailbox). Configured in
  Supabase under Authentication → Emails → Custom SMTP:
  - Host: `smtp.ionos.de`, port `465`, SSL/TLS
  - Username/sender: a mailbox on `true-mma.com` (e.g.
    `noreply@true-mma.com`)
- **Reset Password template:** updated in the Supabase dashboard
  (Authentication → Email Templates → Reset Password) to render `{{
  .Token }}` (the OTP code) instead of the default `{{ .ConfirmationURL
  }}` magic link — required for the OTP-based reset flow described
  above. This is dashboard-only configuration, not stored anywhere in
  this repo; if the template needs to change again, it must be edited
  directly in the Supabase dashboard.
- **This dashboard state is per-project, not shared** — `true-mma-stage` and
  production are two independent Supabase projects (see
  [Environments](#environments-dev--stage--main)), each with their own
  Custom SMTP config and email templates. **Incident, 2026-07-20:** IONOS
  SMTP started failing on production (`535 "Authentication credentials
  invalid"` — the stored mailbox password had gone stale, root cause
  unconfirmed, fixed by re-entering the current IONOS password in the
  dashboard) and Custom SMTP had **never been configured on stage at all**
  since that project didn't exist yet when the original SMTP setup above was
  done — stage was silently falling back to Supabase's built-in
  test-only mail service, hitting its rate limit (`over_email_send_rate_limit`)
  after 1-2 requests. Both fixed the same day (IONOS creds re-saved on prod,
  Custom SMTP + the `{{ .Token }}` template freshly set up on stage). **Any
  future SMTP/template change must be applied to both projects' dashboards
  separately** — nothing here syncs automatically, and this has already bitten
  the project once via the exact same failure mode (a fix landing on one
  project's dashboard being silently assumed to apply everywhere).

**Multilingual auth emails via Edge Function — live on stage, and fixed on
production 2026-07-20 (was a stale SMTP-password secret).** The dashboard templates above are per-*project*,
not per-*user* — there's no way to send German to a German-locale user and
English to an English-locale user through them. This is the project's
**first Supabase Edge Function** (previously deliberately avoided — push
notifications are "kept entirely in SQL to avoid needing the Supabase CLI,"
see [Notifications](#notifications) — though the CLI is already adopted for
migrations now, weakening that original reason). Worth stating the trade-off
explicitly rather than treating this as a free win: an Edge Function is a new
cost surface (its own free-tier limits, separate from the Postgres-only
approach used everywhere else so far), inserts an HTTP round-trip into the
auth email path (Auth waits on the hook's response), needs its own secrets
store (Supabase Function secrets, not dashboard config), and is harder to
observe than SQL (Function logs, not `pg_cron`/SQL-editor debugging).
Decided anyway because it's the only way to actually solve per-user language,
and because reusing the existing IONOS mailbox directly (chosen over a
transactional API like Resend/SendGrid) avoids adding a new vendor
relationship on top of the new architecture surface.

- `supabase/functions/send-auth-email/index.ts` — a Supabase Auth **Send
  Email Hook**. Verifies the webhook signature (`standardwebhooks`), reads
  `user.user_metadata.locale` (see the locale-sync note above; falls back to
  `de`), and sends via direct IONOS SMTP (`denomailer`) instead of Supabase's
  built-in dispatch.
- **Scope deliberately narrow:** handles `email_action_type` values `signup`,
  `recovery`, and `magiclink` (all OTP-code-based — see `confirmSignup()`,
  `confirmPasswordReset()`, and `confirmMagicLink()` in `src/lib/auth.tsx`; the
  magic-link flow never surfaces a clickable link, only a code, so
  `verifyOtp({ type: 'email' })` is used to confirm it, matching the send-side
  `email_action_type`). Any other action type (`email_change`, `invite`, ...)
  returns an error rather than silently sending nothing — Supabase logs that
  as a failed send, which is more honest than a fake success while those
  templates don't exist yet.
- `supabase/config.toml` has a commented-out, `enabled = false`
  `[auth.hook.send_email]` block with local-testing instructions — not live
  anywhere.
- **`denomailer` is not published to npm** — the `npm:denomailer@1.6.0`
  specifier fails the Edge Runtime's dependency graph at boot
  (`Could not find npm package 'denomailer' matching '1.6.0'`); it's a
  deno.land/x-only module, imported as
  `https://deno.land/x/denomailer@1.6.0/mod.ts` instead. Found by locally
  serving the function (`supabase functions serve send-auth-email
  --env-file ... --no-verify-jwt`) and posting a hand-signed Standard
  Webhooks payload (HMAC-SHA256 over `${id}.${timestamp}.${payload}`, base64
  secret) — verified all four paths: valid signature + known type reaches the
  real `smtp.ionos.de:465` and correctly surfaces an auth failure as a 500
  (fake credentials, by design — no real email sent, no project touched);
  valid signature + unhandled type returns the "no template" 500; a tampered
  signature is rejected with 401 before any business logic runs.
- **Deployed and enabled on both stage and production, 2026-07-20.** Secrets
  (`IONOS_SMTP_USER`, `IONOS_SMTP_PASSWORD`, `SEND_AUTH_EMAIL_HOOK_SECRET`) set
  via `supabase secrets set` on both projects; function deployed via
  `supabase functions deploy send-auth-email --no-verify-jwt` (CLI) for
  production and the Supabase MCP server's `deploy_edge_function` for stage;
  Send Email Hook enabled in each project's dashboard (Authentication →
  Hooks), pointing at `https://<project-ref>.supabase.co/functions/v1/send-auth-email`.
- **Stage: confirmed working end-to-end.** A real signup against stage
  produced an auth log entry
  `"hook":"https://qvjgsbeugllobgwabebv.supabase.co/functions/v1/send-auth-email"`,
  `"msg":"Hook ran successfully"`, `"success":true` — the function reached
  real IONOS SMTP and sent successfully.
- **Production: fixed 2026-07-20 — it was the `IONOS_SMTP_PASSWORD` secret
  after all.** Every signup used to return `500 unexpected_failure` /
  `"Unexpected status code returned from hook: 500"`; Auth confirmed it was
  calling the right hook URL and getting a real HTTP 500 back (not a connection
  failure), so the function booted and ran and the failure was inside its own
  logic. The `execution_time_ms` on the failing calls (~730–810 ms) was the
  tell: a template-lookup 500 returns in milliseconds, whereas ~800 ms is a
  real TLS handshake + AUTH to `smtp.ionos.de:465` that then fails — i.e. the
  SMTP send, exactly the earlier `535 "Authentication credentials invalid"`
  signature. Re-setting `IONOS_SMTP_PASSWORD` on production
  (`npx supabase secrets set IONOS_SMTP_PASSWORD=... --project-ref
  mytdfwceuzgqopndqmjt`) and re-running a real signup against production
  returned **`POST /auth/v1/signup` → 200** — the same endpoint that had been
  cascading to 500 on every prior attempt, so a 200 there is a reliable proof
  the hook ran. (Confirmation of the *sent mail* via the Function's own
  `console.log` output was still pending at fix time — the Supabase log
  pipeline lags several minutes and the MCP `get_logs` edge-function stream
  only surfaces the request-level line, not stdout — but the endpoint-level
  200 is conclusive on its own.) Earlier ruled-out theories are kept for the
  record: a non-bundled Docker-less deploy, a mistaken `429` rate-limit (prod's
  limit was found silently at 2/hour and raised to 100, see Known open items),
  and the template-lookup path. **Lesson: `execution_time_ms` on an Edge
  Function 500 distinguishes "failed instantly in its own logic" from "failed
  in an outbound network call" — check it before assuming the cause.**
  Debugging steps that had been tried before the fix: re-deploying with Docker
  running; adding `console.log`/`console.error` at every error path (still in
  the code — the credential-length check at
  `send-auth-email/index.ts` is the one diagnostic worth *removing* once this
  is confirmed stable, see Known open items).
- **`email_change` added to the hook 2026-07-20.** A review found the profile
  screen's "change email" feature was broken on **both** stage and production:
  `updateUser({ email })` makes Auth emit an `email_change` mail, which the
  hook's original narrow scope (`signup`/`recovery`/`magiclink` only) had no
  template for, so it 500'd and the change failed outright. The hook now
  handles `email_change` (and aliases `email_change_current`/
  `email_change_new` to the same template, so toggling "Secure email change" in
  the dashboard can never silently reintroduce an unhandled type). See [Login /
  Profile](#login--profile)'s email-change flow for the app side and the
  `double_confirm_changes` caveat. **Deployed to both environments 2026-07-20**
  — stage via the MCP `deploy_edge_function` (v5), production via the CLI
  (`supabase functions deploy send-auth-email --no-verify-jwt --project-ref
  mytdfwceuzgqopndqmjt`); the CLI path was used for prod because the prod MCP
  was still read-only at deploy time (see the MCP note below). "Secure email
  change" / `double_confirm_changes` was also set OFF on both dashboards the
  same day, so the single-code in-app flow can complete.
- Email content is currently plain text, not branded HTML — visual design is
  explicitly deferred, not a blocker for the mechanism working.

## Favorites

Separate concept from follows/reminders (see [Notifications](#notifications)
and [Login / Profile](#login--profile)) — a heart icon next to the bell on
fighters and events. Favoriting pins an entry to the top of its list and
shows it in the profile; it has nothing to do with push/local
notifications.

- **No push-token anchor for anonymous users, unlike follows:**
  `push_subscriptions` can have an anonymous row because the device push
  token is a stable anonymous identity to key rows on. Favorites have no
  equivalent, so anonymous favoriting (`src/lib/favorites.ts`) is **fully
  local** — a plain array of ids in AsyncStorage
  (`true-mma:favorites:fighters` / `:events`) — until login, at which
  point reads/writes switch to the `fighter_favorites`/`event_favorites`
  tables (`user_id` + `fighter_id`/`event_id`, unique constraint, RLS
  scoped to `auth.uid() = user_id`, no anonymous rows at all — see
  `supabase/migrations/002_favorites.sql`).
- **Claim on login:** `claimLocalFavorites(userId)`, called from
  `src/lib/auth.tsx`'s `SIGNED_IN` handler alongside
  `claimAnonymousFollows()`, upserts the locally-stored ids into the
  account tables so favorites made before login aren't lost. Local storage
  is left in place afterwards (harmless if the user logs out again).
- **UI:** `FighterFavoriteHeart`/`EventFavoriteHeart` (`src/components/`)
  mirror `FighterFollowBell`/`EventReminderBell`, built on the same
  `BellIconButton`, now generalized with an `icon` prop (heart vs. bell
  glyph) and an `offsetRight` prop so both icons can sit side by side on
  one card. `FighterListScreen`/`EventListScreen` sort favorited entries
  to the top of the list (stable sort, existing order preserved within
  each group) using a favorite-id `Set` kept in sync via each heart's
  `onToggle` callback, refreshed from `getFighterFavoriteIds()`/
  `getEventFavoriteIds()` on load and pull-to-refresh.

## Voting

Added 2026-07-19: anonymous community voting on upcoming fights ("who
wins?"), one vote per device — no login required, and deliberately
independent of the push-token identity used for follows (voting must never
trigger the OS notification-permission prompt).

- **Identity:** `getDeviceId()` (`src/lib/voting.ts`) generates a random
  id once, cached in AsyncStorage (`true-mma:device-id`) — not
  `expo-crypto`'s `randomUUID`, deliberately, to avoid pulling in a native
  module just for this.
- **Schema:** `fight_votes` (`fight_id`, `device_id`, `picked_fighter_id`,
  unique on `(fight_id, device_id)`) — see [Data model](#data-model). RLS
  allows anonymous insert/select/update outright (same trust model already
  accepted for `push_subscriptions`'s anonymous rows: client self-reports
  its own identifier, low-sensitivity data, no server-verifiable anti-abuse
  beyond the per-device uniqueness constraint). Concretely, the `update`
  policy is `using (true)` with no `device_id` scoping, so vote counts are
  fully attacker-mutable: anyone with the anon key can not only stuff the
  tally with forged `device_id`s (the uniqueness constraint only stops
  duplicates, not distinct fakes) but also **overwrite existing rows created
  by other devices** in a single `PATCH`. Accepted for MVP — these are
  anonymous, non-PII "who wins?" tallies with no server-verifiable device
  identity to scope against — but treat the counts as indicative, not
  trustworthy. If they ever need to be trustworthy, casting has to move
  behind a `security definer` RPC / service-role path.
- **Fetching:** `getEventVotes()` batches one query per event load (all
  fight ids via `.in()`) rather than one query per fight card, then counts
  votes per fighter client-side — small enough per event that a dedicated
  aggregation view wasn't worth adding.
- **UI (`EventDetailScreen`):** only shown for fights with no result yet
  (`result_winner_id == null`) and not cancelled. Before voting: two
  pressable picks. After voting: a two-segment percentage bar, the picked
  side highlighted. `castVote()` upserts on `(fight_id, device_id)`, so
  changing a pick just overwrites the previous vote.

## balldontlie sync

Two scripts share `scripts/lib/balldontlie.ts` (the balldontlie HTTP
client with rate-limiting/retry, Supabase upsert helpers, and the
`Bdl*` → row-mapping functions — `fighterRow()`/`eventRow()`/`fightRow()`
— so a new synced field only needs to be added in one place):

- **`scripts/sync-balldontlie.ts`** (`npm run sync:balldontlie`) — the
  full sync, walks balldontlie's entire history every time (see API
  quirks below for why). Scheduled every 6 hours via
  `.github/workflows/sync-balldontlie-full.yml`.
- **Two latent bugs in `sync-live-event.ts`, found and fixed 2026-07-19
  while optimizing:**
  1. The event re-fetch first scanned page 1 of an *unfiltered* `/events`
     list (100 of ~28k rows) hoping the live event was on it, falling back
     to `/events/{id}` on a miss — the scan essentially always missed, so it
     was a wasted request every run. Now goes straight to `/events/{id}`.
  2. That fallback was typed as `{ data: BdlEvent[] }`, but `/events/{id}`
     returns `data` as a **single object, not an array** — so `data[0]` was
     always `undefined` and **the event row was in practice never refreshed
     by the live sync at all**, only its fights. Exactly the mid-card status
     flips and shifted segment start times this script exists to catch were
     silently not landing. Verified against the live API before fixing.
- **`externalIdMap()` now takes an optional `externalIds` filter.** The live
  sync called it unscoped, paging through the *entire* `fighters` and
  `events` tables on every poll just to map one event's ~24 fighters. The
  full sync still calls it unscoped, which is correct — it genuinely needs
  the whole map.
- **`scripts/sync-live-event.ts`** (`npm run sync:live`) — a lightweight
  companion, scheduled every 5 minutes via
  `.github/workflows/sync-balldontlie-live.yml`. It first checks (one
  cheap Supabase query, zero balldontlie calls) whether any event's
  earliest known broadcast segment
  (`early_prelims_start_time` ?? `prelims_start_time` ??
  `main_card_start_time` ?? `event_date`) has started and is still within
  a ~6h estimated card-duration buffer (balldontlie gives start times but
  no end time) — if nothing is "live" right now, it exits immediately.
  If something is live, it re-fetches just that event + its fights (a
  handful of records, not the full history) so late changes — an added
  replacement fight, an updated result, a card_segment/status flip —
  land within minutes instead of waiting for the next 6-hour full sync.
  This is what would have caught the stale-data incident below in
  minutes instead of however long it actually went unnoticed.

Both need `SUPABASE_SERVICE_ROLE_KEY` + `BALLDONTLIE_API_KEY` (+
`EXPO_PUBLIC_SUPABASE_URL`) available as env vars — locally via `.env`,
in CI via GitHub Actions repo secrets of the same names (Settings →
Secrets and variables → Actions). The service-role key bypasses RLS,
which is required since this is the only thing that writes to the
otherwise read-only tables.

**Why GitHub Actions and not a paid scheduler:** the repo is public
specifically so these can run on GitHub-hosted runners for free with no
per-minute cap — a true 5-minute live-check would be ~8,600 runs/month,
which would blow through the 2,000 free minutes/month a private repo
gets (GitHub bills a minimum of 1 minute per job run even for an
instant no-op).

**The 5-minute live cron is not delivered as scheduled — measured
2026-07-19.** Actual gaps between delivered `schedule` runs of
`sync-balldontlie-live.yml` were **45–75 minutes**, with observed gaps up
to 3.7 h (00:10 → 03:51). GitHub aggressively sheds high-frequency
`schedule` triggers on public repos; there is no setting that changes
this, and `workflow_dispatch` runs are unaffected (they fire immediately).
Consequences to keep in mind:
- The real figure is ~700 runs/month, not ~8,600 — the cost reasoning
  above is even safer than it looks, but for the wrong reason.
- The live sync's premise ("late changes land within minutes instead of
  waiting for the 6-hour full sync") holds only loosely — in practice
  it's ~1 h, occasionally several.
- **The league-start push inherits this latency**, since it piggybacks on
  this poll (see [Notifications](#notifications)). A "starts now" push can
  arrive an hour or more after the event actually started. Not yet
  addressed — see [Known open items](#known-open-items). Git history was checked for leaked secrets before
flipping the repo public (`git log --all -p` grepped for key/token
patterns) — none found; real secrets only ever lived in `.env`
(gitignored) and GitHub Actions secrets, neither of which repo
visibility affects.

**Incident, 2026-07-18 — why regular syncing matters:** while testing
fight card ordering, our stored data for a live event (UFC Fight Night:
Du Plessis vs. Usman) was found to be stale — missing an entire fight
that balldontlie had added since the last manual sync, and disagreeing
with balldontlie's own current `card_position` numbers for the fights it
did have. The full sync had simply never been re-run since that fight
got added upstream. This is the direct reason the two scheduled
workflows above exist now instead of staying a "run it when you
remember" local script.

**API quirks (all discovered empirically, not documented by balldontlie):**
- `/fights` requires the paid ALL-STAR tier ($9.99/mo); `/leagues`,
  `/events`, `/fighters` are on the free tier.
- Neither `statuses[]=scheduled` nor date-range params (`start_date`,
  `dates[]`) are honored by `/events` — confirmed identical responses with
  and without them. Date filtering therefore happens client-side
  (`PAST_WINDOW_DAYS = 365`, see below).
- **`league_ids[]` *is* honored by `/events`, on every cursor page** —
  measured 2026-07-19, and the single biggest cost lever in this project.
  The original implementation assumed *all* filters broke past page one and
  so walked the entire history every run. Both variants were walked to
  completion and their event ids diffed:

  | | events | requests |
  |---|---|---|
  | unfiltered (old behavior) | 27,933 | **280** |
  | `league_ids[]`, all 10 leagues | 361 | **4** |

  Zero eligible events missing from the filtered walk (361 of 361). The
  ~27.6k difference is events with `league: null` — regional shows the sync
  discards anyway; they were the ~212 "unknown league" skip lines per run.
  Cuts the full sync from ~6.5 min to well under a minute and removes ~98.6%
  of its balldontlie calls. **Lesson: "the API ignores filters" was verified
  for two parameters and then generalized to all of them — that assumption
  cost 280 requests per run for months. Verify per parameter.**
- **balldontlie's league coverage is far thinner than the ~28k event count
  suggests:** across their *entire* history only 361 events carry a league
  at all — UFC 189, PFL 76, LFA 37, DWCS 20, CW 16, ONE 10, RIZIN 7,
  Invicta 3, Bellator 3. The Bellator gap noted below is not an outlier;
  ONE and Invicta are effectively unusable too. Treat any "league X is
  covered" assumption as needing a count check first.
- `/fights` also doesn't reliably honor filters past the first page of
  cursor pagination — instead of filtering, we fetch fights in batches via
  `event_ids[]` for exactly the event ids we already trust (kept from the
  `/events` pass). Even so, a small fraction of requests still returned
  fights for unrelated/historical events (a genuine balldontlie-side
  pagination bug) — the `eventMap`/`fighterMap` lookups silently (with a
  log line) skip anything that doesn't resolve, which is the correct
  behavior for this specific known issue but see the caveat below.
- **Caveat:** that same skip path also used to mask a real bug in this
  codebase (`externalIdMap()` truncating at Supabase's 1000-row default
  limit — fixed by paginating with `.range()`). A regression here would
  look identical to the tolerated balldontlie noise. If skip counts spike
  unexpectedly, check `externalIdMap`/pagination first before assuming
  it's balldontlie's bug.
- balldontlie does **not** cover OKTAGON — it stays fully manual.
- balldontlie's **Bellator MMA coverage is essentially empty**: the league
  exists in their `/leagues` list (id 3), but `/events?league_ids[]=3`
  returns only 3 events total, all from 2016 — despite Bellator running
  until 2023. Confirmed by querying the API directly, not a bug in this
  sync script. If Bellator events are wanted, they'd need the same manual
  entry treatment as OKTAGON.
- Fighter objects are fully embedded in `/fights` responses, so there's no
  separate `/fighters` crawl; the fighter set is derived from whichever
  fights got synced.
- Rate limit on ALL-STAR: 60 req/min. The script paces requests
  (`MIN_REQUEST_INTERVAL_MS`) and retries once on 429 with a capped number
  of attempts (`MAX_RATE_LIMIT_RETRIES`) rather than retrying forever.
- **`card_segment`** (`main_card` / `prelims` / `early_prelims`) is a real
  balldontlie field that was simply never synced before 2026-07-18 — it's
  what makes `card_position` (`fight_order`) unambiguous, since that
  number restarts at 1 separately per segment (see `sortFightCard()` in
  `src/lib/queries.ts`). Found by inspecting the full raw fight object
  (`JSON.stringify` a single `/fights` result) rather than trusting the
  handful of fields the original implementation had cherry-picked —
  worth doing again if a UI feature ever seems to need data balldontlie
  "doesn't have"; check the raw response before assuming that.
- As of 2026-07-18 the sync pulls **every** field balldontlie exposes for
  fighters/events/fights that has a plausible use, not just what the UI
  needed at the time — storage is free and it's already part of the same
  API response, so there's no reason to re-touch schema + sync script
  every time a new UI idea needs one more field. See the fighter
  record/tale-of-the-tape fields and event broadcast-time fields in
  [Data model](#data-model) and the `FighterDetailScreen`/
  `EventDetailScreen` bullets above.

**Sync flow:** `syncLeagues()` (also backfills `external_id` onto
pre-existing manually-entered orgs matched by `short_name`, so re-running
after seeding data doesn't create duplicate organizations) →
`syncEvents()` (full history fetch, filtered to the past-window + future)
→ `syncFightersAndFights()` (fights for those events, batched by
`event_ids[]`; fighters derived from the fight payloads).

## Build & deployment

- **EAS project:** `@chris09er/true-mma`, `app.json` →
  `extra.eas.projectId`. Android package / iOS bundle id:
  `com.truemma.app`.
- **`eas.json` profiles:** `development` (dev client, internal APK),
  `preview` (internal APK), `production`.
- **Environment variables for builds:** `EXPO_PUBLIC_SUPABASE_URL` /
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` are registered as EAS project env vars
  (`eas env:create`) for all three environments — EAS builds do **not**
  read the local `.env` file, so these must be kept in sync manually if
  they ever change.
- **`app.config.js`** (dynamic config, wraps the static `app.json`) exists
  solely to resolve `android.googleServicesFile` at build time from
  `process.env.GOOGLE_SERVICES_JSON`, falling back to a local
  `./google-services.json` for local builds. The file itself is gitignored
  (repo is public) and instead stored as an EAS **file-type env var**
  (`eas env:create --type file --name GOOGLE_SERVICES_JSON`, one per
  environment) — EAS downloads it to a temp path and points the env var at
  that path during `eas build`, so `app.config.js` never needs to know
  where the file physically lives. This is the general pattern for any
  future secret file this project needs (as opposed to GitHub Actions
  secrets, which only exist for the balldontlie sync scripts — see
  [balldontlie sync](#balldontlie-sync) — since those run on GitHub's
  runners, not EAS's).
- **Rebuild triggers:** any native module change (new package installed
  via `npx expo install` that isn't pure JS, or native config changes in
  `app.json`/`eas.json`) requires a fresh `eas build --profile
  development` and reinstalling the APK — a stale dev client throws
  `NoSuchMethodError`/`getDirectConverter`-style crashes when the JS
  bundle and native binary disagree on `expo-modules-core`'s shape. Pure
  JS/screen changes hot-reload into the existing dev client with no
  rebuild needed.
- Run `npx expo install --check` (or `--fix`) after any dependency change
  to catch drift from the SDK's expected versions before it causes this.
- **Stale `android/` after an identity/config change — the "flags don't
  render" trap (2026-07-21, cost hours):** `android/` is gitignored, so it can
  silently drift from `app.json`. After the mma-pocket → true-mma rename it kept
  the OLD dev-client scheme `exp+mma-pocket` (the app actually registers
  `exp+true-mma`, from the slug) and an old identity in its `AndroidManifest.xml`,
  which broke `expo run:android`'s auto-launch and skewed the fingerprint. A
  local dev build also **embeds a JS bundle** (the expo-updates fallback) and
  expo-updates checks its channel on every launch, so a device can run **stale
  embedded/OTA code while you edit local files that never appear** — the country
  flags were fine all along; the device was just on an old bundle.
  **Rules:** (1) after ANY change to app.json/app.config.js identity or native
  config, run `npx expo prebuild --clean` and rebuild — never trust a long-lived
  `android/`. (2) When verifying a *local* JS change on the device, first prove
  fresh code is running with an unmissable sentinel (e.g. a temp placeholder
  string) and confirm Metro logged a fresh `Android Bundled (N modules)` request
  from the device — before diagnosing anything render-level. (3) Device↔Metro:
  use `adb reverse tcp:8081 tcp:8081` + a `localhost` URL; the host LAN IP:8081
  is firewall-blocked here (`okhttp Callback failure`). The full playbook lives
  in the auto-memory `reference_local_dev_build_on_device`.
- **EAS Update (OTA), set up 2026-07-19:** `expo-updates` installed (a
  native module — requires a fresh `eas build --profile development` once,
  same as any native module addition, see the rebuild-triggers note
  above). `app.config.js` sets `updates.url` (the project's EAS Update
  endpoint, `https://u.expo.dev/<projectId>`).
  - **`runtimeVersion` policy switched `appVersion` → `fingerprint` on
    2026-07-20.** `appVersion` only forced a rebuild when someone
    remembered to bump `app.json`'s `version` — a manual, easy-to-forget
    step, and the actual failure mode (a native-incompatible OTA update
    silently served to an old build) has no visible symptom until a user
    hits a crash. `fingerprint` instead hashes everything that can affect
    the native runtime (native deps, `app.json`/`eas.json`, config
    plugins, `google-services.json`, etc. — see `eas fingerprint:generate`)
    and uses that hash as the runtime version, so an incompatible update
    is *structurally* unable to reach a build it doesn't match, no manual
    bump required. Trade-off (documented by Expo): more frequent native
    builds, since any change touching the fingerprint needs a new build
    before its OTA update becomes reachable — accepted, since builds are
    now triggered automatically (below) rather than manually.
  - **Auto-triggered native builds, `publish-ota-update.yml` (2026-07-20):**
    before publishing, the workflow runs `eas fingerprint:generate` for the
    current commit, then `eas build:list --fingerprint-hash <hash> --channel
    <channel> --status finished` to check whether a build already exists on
    that channel for this exact fingerprint. If not, it kicks off `eas
    build --profile <profile> --non-interactive --no-wait` (async — the
    workflow doesn't block on it) before publishing the OTA update, so the
    channel ends up with both a matching build and a matching update rather
    than an update nobody can consume yet. Android-only for now (no iOS
    build has ever been made for this project, see [Build &
    deployment](#build--deployment)).
    - **`--status finished` only matches completed builds, not queued/running
      ones — observed 2026-07-20.** Two pushes to `stage` close together
      (before the first fingerprint-triggered build had finished) each kicked
      off their own build for the identical fingerprint, so two redundant
      builds queued back to back. Harmless (just wasted build minutes, both
      eventually produce the same artifact), but worth knowing before reading
      too much into "why are there two builds in the queue."
    This closes the gap where a native
    change pushed to `stage`/`main` used to publish a same-day OTA update
    that no installed build could actually use until someone manually
    remembered to run a fresh `eas build`.
    - **Two rounds of fingerprint-mismatch failures on the first live
      runs, both surfaced the same way:** `CONFIGURE_EXPO_UPDATES` fails
      with "Runtime version calculated on local machine not equal to
      runtime version calculated during build" — diagnosed both times by
      pulling the failed build's logs (`eas build:view <id> --json` →
      `logFiles`, brotli-compressed — `zlib.brotliDecompressSync` in Node
      reads it) and finding the diff always contained
      `../eas-environment-secrets/<hash>` (`expoConfigExternalFile`) and a
      `bareNativeDir` entry for `android`. Root cause both times: a bare CI
      checkout has no `google-services.json` (gitignored, see
      `app.config.js`) and no `GOOGLE_SERVICES_JSON` env var resolved, so
      any *locally*-run fingerprint computation omits it, while the EAS
      build worker resolves the real file mid-build and includes it —
      permanent disagreement until the file exists locally too.
      1. First attempt: added `--build-profile "$EAS_BUILD_PROFILE"` to the
         `fingerprint:generate` diagnostic step. Insufficient — that only
         fixed the *decision* step's accuracy; `eas build`'s own internal
         pre-flight fingerprint (used for the actual
         local-vs-build-worker comparison) has the identical gap and isn't
         affected by that flag.
      2. Actual fix: `eas env:pull --environment "$EAS_ENVIRONMENT"
         --non-interactive --path .env.local` runs first, downloading the
         file-type secret to a local path (`.eas/.env/GOOGLE_SERVICES_JSON`)
         and writing that path into `.env.local`; the workflow then exports
         those lines into `$GITHUB_ENV` so every subsequent step (the
         fingerprint check *and* `eas build` itself) resolves
         `GOOGLE_SERVICES_JSON` to a real file, matching the build worker.
  - **Still manual either way:** installing the resulting build.
    EAS Build doesn't push anything to a device — `preview`/`development`
    builds are internal-distribution APKs that must be downloaded and
    sideloaded by hand each time; only a real store release (Play
    Store/App Store) would make a native update install itself on already-
    installed devices, and that's still a separate, not-yet-done step (see
    [Known open items](#known-open-items)).
  - **Channels** (`eas.json` → `build.<profile>.channel`), named after the
    branch pipeline rather than the build-profile names: `development`
    profile → `development` channel, `preview` profile → `stage` channel,
    `production` profile → `production` channel. A build only ever pulls
    updates published to its own channel.
  - **`.github/workflows/publish-ota-update.yml`** (new) — on every push
    to `main`/`stage` (excluding migration/docs/workflow-only changes,
    which don't need a JS republish), runs `eas update --channel
    <channel>` (channel alone — `eas update` rejects passing `--branch`
    together with `--channel`; the channel name resolves to its
    same-named update branch automatically), targeting the matching
    channel via `github.ref_name`. Uses `--environment production`/`preview` (not
    `development`/`stage` — these are the fixed EAS environment-variable
    slots that hold `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY`, already
    repointed at the stage project for `preview`, see
    [Environments](#environments-dev--stage--main) — distinct from the
    update-channel names chosen above) so the published JS bundle embeds
    the right Supabase project's env vars.
  - **Requires an `EXPO_TOKEN` repo secret** for `eas-cli` to authenticate
    non-interactively in CI — **created 2026-07-19.** Deliberately an Expo
    **robot user** token (name: `GITHUB_ACTIONS_CI`), not a personal
    access token off the `chris09er` account: a personal token breaks
    silently if the underlying account's credentials/2FA ever change,
    since it's not scoped to CI at all; a robot user is a dedicated
    non-human account (Developer role — no billing/member-management
    access, just enough to build/publish), scoped to just this project,
    created under Account Settings → Robot Users on expo.dev. If this
    token is ever pasted somewhere non-secret (chat, a doc, a log), treat
    it as compromised and rotate it immediately: revoke the old token on
    the robot user's own settings page, generate a new one, then
    `gh secret set EXPO_TOKEN` locally to update the repo secret
    (repo-level, like `SUPABASE_ACCESS_TOKEN`, since it's an account
    credential, not project-specific) — never paste a live token into
    chat.
- **Any `package.json` edit changes the fingerprint, even a pure npm `scripts`
  entry with no dependency change — discovered 2026-07-20.** Added
  `"check:i18n": "tsx scripts/check-i18n-parity.ts"` (no new dependency, no
  version bump) alongside a batch of pure-JS auth changes, expecting a plain
  OTA update with no rebuild. `eas fingerprint:generate` hashes the whole
  `package.json` file, not just `dependencies`/`overrides`, so the runtime
  version changed anyway and the auto-trigger logic (see below) correctly
  kicked off a new native build — the currently-installed build's fingerprint
  no longer matched, so the OTA update alone was unreachable until that build
  finished and was reinstalled. **Lesson: don't assume "no dependency change"
  means "no fingerprint change, no rebuild" — anything touching
  `package.json` at all should be treated as fingerprint-affecting until
  proven otherwise.**
- **Known bad transitive dependency:** `@expo/vector-icons@15.1.x` pulls in
  `expo-font@56.x`, which calls an `expo-modules-core` API
  (`ReturnTypeKt.getDirectConverter`) that doesn't exist in SDK 54's
  `expo-modules-core@3.0.x` — throws the exact same
  `NoSuchMethodError`/`getDirectConverter` crash as a stale dev client,
  even on a *freshly built* one, which is what made this one confusing to
  diagnose (looked like the rebuild didn't help). `package.json` pins
  `@expo/vector-icons` to exactly `15.0.3` (no `^`) and adds
  `"overrides": { "expo-font": "14.0.12" }` to force the compatible
  version. If this crash reappears after a routine `npm install`, check
  these two versions first — `npx expo install --check` alone does **not**
  catch this, since it only validates directly-declared dependencies, not
  what a dependency pulls in transitively.

## Marketing landing page

Added 2026-07-20 as part of the marketing strategy's launch plan (see
`docs/MARKETING.md` §6 Phase A) — the one piece of that plan allowed to start
before the design overhaul, since it needs only minimal styling, not final
brand assets.

- **`website/index.html`** — a single self-contained static file (inline
  CSS/JS, no build step, no framework) — a one-pager with a hero, the three
  lead messaging pillars from `docs/MARKETING.md` §2, and a waitlist signup
  form. Deliberately outside the Expo app entirely; this is a separate
  deployable artifact, not part of the React Native bundle.
- **Waitlist storage: `waitlist_signups` table, production Supabase project**
  (`supabase/migrations/012_waitlist_signups.sql`) — real prospective-user
  emails, not disposable test data, so it goes to prod rather than stage
  despite this being marketing rather than app functionality. Anonymous
  insert-only (`for insert with check (true)`, mirroring `fight_votes`'
  trust model — see [Data model](#data-model)) with **no SELECT/UPDATE/DELETE
  policy at all**, stricter than `fight_votes`/`push_subscriptions`: nothing
  about a waitlist entry ever needs to be read back through the anon key, so
  RLS simply grants nothing beyond insert. `email` has a basic regex format
  check constraint (the only validation available at this boundary, since
  there's no auth layer in front of it) and a `unique` constraint so a
  repeat signup fails harmlessly (surfaced client-side as "already on the
  list" via Postgres's `23505` unique-violation code) rather than
  duplicating.
- **`utm_source`/`utm_medium`/`utm_campaign` columns** — populated client-side
  from the landing page's own query string, implementing the launch plan's
  tagging requirement (`docs/MARKETING.md` §6) from day one, before any paid
  spend exists to attribute.
- **Client talks to Supabase directly from the static page** via
  `@supabase/supabase-js` loaded from a CDN (`esm.sh`), using the project's
  publishable anon key inline in the HTML — the same trust model as the
  app's own `EXPO_PUBLIC_SUPABASE_ANON_KEY` usage, safe to embed client-side
  since RLS is the actual gate, not key secrecy.
- **Hosting is a manual, undocumented-in-repo step, same treatment as the
  SMTP/email-template dashboard config** (see [Auth emails](#auth-emails)):
  intended to be served from `true-mma.com` (already owned via IONOS, see the
  naming note at the top of this doc), but deploying `website/index.html`
  there is not automated by any workflow in this repo yet.
- **No CI deploys this migration automatically to prod except via the normal
  `stage`→`main` PR flow** (see [GitHub Actions](#environments-dev--stage--main))
  — same as any other migration, nothing waitlist-specific bypasses that.

## Known open items

- ~~`main` had never received any of the dev/stage/main pipeline's work~~ —
  **resolved 2026-07-19.** First promotion since the pipeline was set up:
  PR #11 merged all 21 commits from `stage` into `main` in one go (sync-cost
  optimization, the two live-sync bug fixes, the league-start push and its
  006/007 security fix — shipped together deliberately, see
  [Notifications](#notifications) — auth/voting/favorites/org-follows, OTA
  channel setup, and this session's push-chunking/receipts work).
  `deploy-migrations.yml` applied migrations 001–008 to the production
  Supabase project without error; `publish-ota-update.yml` published to the
  `production` EAS Update channel (a no-op today — no production build has
  ever embedded `expo-updates`, so nothing is listening on that channel
  yet). `main` and `stage` are now at the same commit. Verified against the
  production project post-merge via `supabase login` (CLI-level access
  token, kept separate from local `.env` — which deliberately still holds
  only the stage service-role key, see below) + `supabase projects
  api-keys --reveal`: `league_start_push_health()` returns
  `job_scheduled`/`job_active` true and a recent `succeeded` run on
  production, same as already confirmed on stage.
- ~~EAS Update (OTA) channels configured but not yet live end-to-end~~ —
  **resolved 2026-07-19.** `EXPO_TOKEN` repo secret created (an Expo
  **robot user** token, not a personal one — see [Build &
  deployment](#build--deployment) for why) and a fresh `eas build
  --profile development` completed, so the dev client now has
  `expo-updates` built in. `preview`/`production` builds still need one
  fresh build each before they can receive OTA updates, same reasoning —
  any build made before 2026-07-19 predates `expo-updates` entirely.
- ~~Local `.env` in a broken half-state~~ — **resolved 2026-07-19.**
  `EXPO_PUBLIC_SUPABASE_URL` pointed at stage while
  `SUPABASE_SERVICE_ROLE_KEY` was still the prod key, so any local
  `npm run sync:balldontlie`/`sync:live` failed auth. The stage
  service-role key is now in place and verified against the stage project.
  The prod key was not lost — it lives on as the `production` GitHub
  Actions environment secret.
- ~~League-start push latency~~ — **resolved 2026-07-19** by moving the
  trigger to `pg_cron`, see [Notifications](#notifications). Verified
  against a local Supabase Postgres: the job registers active on
  `* * * * *` and executes on the minute, and all six branches of
  `send_league_start_pushes()` behave correctly (fires when just started;
  ignores events outside the 30-minute window, cancelled events, and
  not-yet-started events; stamps an org with no followers without an HTTP
  call; a simulated 500 releases the attempt and re-issues within the same
  tick; a 200 stamps `league_start_push_sent_at` and stops). **Also
  verified on the deployed stage project** via
  `league_start_push_health()`: `job_scheduled`/`job_active` true,
  `last_run_status = 'succeeded'`, firing on the minute. **Still
  unverified against a real event and a real device** — the Expo POST
  itself was simulated by injecting `net._http_response` rows, so no push
  has actually been delivered end-to-end through this path. Stage
  currently has zero `organization_follows` rows, so following a league
  on a stage build is a precondition for ever exercising it for real.
- **Revoking a function from `anon` takes TWO revokes on Supabase — the
  single most repeated footgun in this project.** Introduced in `006` and
  fixed in `007`: `send_league_start_pushes()` was revoked from `anon,
  authenticated` only, and `anon` could still invoke it over PostgREST
  (confirmed `HTTP 204` against the deployed stage project with nothing but
  the public anon key — an unauthenticated caller could drive the push
  sender). Two independent mechanisms grant EXECUTE, and closing one leaves
  the other:
  1. **Postgres** grants EXECUTE on every new function to `PUBLIC` by
     default. `anon` inherits it. Only `revoke ... from public` removes it.
  2. **Supabase** additionally grants EXECUTE to `anon`/`authenticated`
     explicitly, via `ALTER DEFAULT PRIVILEGES` on the `public` schema.
     `revoke ... from public` does *not* remove an explicit grant.

  So the correct form for any non-public function is
  `revoke execute on function ... from public, anon, authenticated;`
  followed by explicit grants. Verify with
  `select proname, array_to_string(proacl,' | ') from pg_proc ...` — a
  leading `=X/postgres` entry means PUBLIC still has it — and confirm over
  the API, since that is the path an attacker uses.

  Note this is *not* contradicted by
  `004_fix_execute_revoke_regression.sql`'s "narrow the revoke" lesson.
  That regression was a function fired by a **Supabase-internal role**
  (`supabase_auth_admin` on `auth.users` insert) which the broad revoke
  stripped. Where the only callers are the owner (pg_cron runs as the job
  owner, and an owner keeps EXECUTE regardless) and roles you grant
  explicitly, revoking from PUBLIC is correct — which is exactly what the
  pre-existing `notify_fighter_added_to_fight()` already did.
- **A hand-run-only fix can fall out of a fresh project's baseline —
  discovered 2026-07-20 via the Supabase linter (now checked through the
  Supabase MCP server, see below) on stage vs. production.** The linter
  flagged `handle_new_user()` as callable by `anon`/`authenticated` via
  `/rest/v1/rpc/handle_new_user` **on stage only**, not on production.
  Confirmed via `pg_proc.proacl`: stage still had `anon`/`authenticated`
  EXECUTE grants, production didn't. Root cause: the original fix
  (`supabase/migrations_archive/003_security_hardening.sql` +
  `004_fix_execute_revoke_regression.sql`) was hand-run against production
  only, before this project had a CLI migration runner — it was never
  captured as a replayable migration, only archived for reference. When
  stage was bootstrapped 2026-07-19 from a `db dump --linked` baseline
  snapshot of production, that snapshot didn't carry the GRANT/REVOKE state
  forward, so stage silently reverted to Postgres' default EXECUTE-to-PUBLIC
  behavior on this function. Fixed by
  `supabase/migrations/010_fix_handle_new_user_execute.sql` (a no-op on
  production, where the grant was already correct) — now a real migration,
  so it can't fall out of a future rebuild the way the original fix did.
  **Lesson:** anything only ever applied by hand outside the
  `supabase/migrations/` sequence should be assumed lost the next time a
  project is bootstrapped from a baseline snapshot, not just "already
  fixed."
- **Performance advisor findings, fixed 2026-07-20 via
  `supabase/migrations/011_perf_advisor_fixes.sql`** (identical on stage and
  production, unlike the `010` security fix): 12 RLS policies
  (`profiles`/`push_subscriptions`/`organization_follows`/`event_follows`/
  `fighter_favorites`/`event_favorites`) called `auth.uid()` directly, which
  Postgres re-evaluates per row instead of once per statement — rewritten as
  `(select auth.uid())`, same logical condition, cheaper at scale. Also added
  12 missing indexes on foreign-key columns the linter flagged (`INFO`
  level). **Not fixed, and not a bug:** an `unused_index` finding on stage
  only (`idx_events_league_start_push_pending`) — production's real
  `league_start_push_health()` traffic does use that index; stage just has
  too little traffic to have ever hit it, so removing it would hurt
  production for a stage-only non-issue.
- **Supabase's "leaked password protection" (HaveIBeenPwned check) is
  Pro-plan-only** — flagged by the linter as disabled on both stage and
  production, but not fixable on the current Free tier. Same "revisit once
  Prod needs Pro anyway" bucket as
  [Branching](#environments-dev--stage--main).
- **`cron.job` is not writable by the migration role.** `delete from
  cron.job ...` fails with "permission denied for table job"; go through
  `cron.unschedule()` instead, wrapped in an exception block since it
  raises when the job doesn't exist. Caught by local replay, see the
  Supabase CLI notes in [Environments](#environments-dev--stage--main).
- ~~Neither push path chunks messages to Expo's 100-per-request limit~~ /
  ~~Neither push path reads Expo's push tickets~~ — **resolved 2026-07-19**
  by `supabase/migrations/008_push_chunking_and_receipts.sql`, see
  [Notifications](#notifications). Both gaps shared one root cause (neither
  path tracked individual messages past `net.http_post`), fixed together: a
  shared `send_expo_push_chunked()` splits into ≤100-message chunks, and a
  new `push_maintenance()` pg_cron job polls Expo's `/getReceipts` endpoint
  and deletes `push_subscriptions`/`organization_follows` rows for any
  token that comes back `DeviceNotRegistered`. Verified locally via
  fabricated `net._http_response` rows; not yet verified against a real
  uninstalled app.
- **Revisit Supabase Branching vs. two free-tier projects** before a real
  store release — see the trade-off written up in
  [Environments](#environments-dev--stage--main). Switching to Branching
  later is expected to be cheap since stage only ever holds disposable
  test data.
- `push_subscriptions` **and `organization_follows`** anonymous rows
  (`user_id is null`) are still fully public by design (`user_id is null or
  user_id = auth.uid()`, identical policy on both tables) — acceptable for
  MVP (low-sensitivity data: device token ↔ fighter id / org id), but has
  two consequences worth stating plainly: (1) anyone holding a given push
  token could unfollow on someone else's behalf, and (2) the `select`
  policy makes every anonymous row world-readable to any anon-key client,
  so the full set of anonymous Expo push tokens can be enumerated — a
  harvested token is a valid `to:` target for Expo's unauthenticated push
  API, i.e. an unsolicited-push (spam) vector, though not account access.
  Rows tied to a logged-in user (`user_id = auth.uid()`) are scoped. Not
  currently a planned fix for the anonymous case; the clean fix, if
  revisited, is to route anonymous follow/unfollow through a `security
  definer` RPC that never returns tokens to clients, so `select` can be
  tightened to `user_id = auth.uid()` only.
- **Supabase database linter findings (2026-07-16), fixed via
  `supabase/migrations/003_security_hardening.sql`, applied to the live
  database on 2026-07-16:** the original fully-open `push_subscriptions`
  anon policies from before the login feature (`"public can subscribe"`/
  `"public can unsubscribe"`/`"public can view own subscriptions"`, all
  `using`/`with check (true)`) were never dropped after
  `001_profiles_and_login.sql` added the scoped replacements — since RLS
  policies are OR'd together, this silently left every row
  readable/writable/deletable by anyone regardless of `user_id`,
  defeating the scoping. Also revoked public `EXECUTE` on the
  `handle_new_user()`/`notify_fighter_added_to_fight()` trigger
  functions, which were otherwise callable as public RPC endpoints
  (`/rest/v1/rpc/...`).
- **Regression from the above, fixed via
  `supabase/migrations/004_fix_execute_revoke_regression.sql`:**
  `revoke execute ... from public` turned out to affect trigger firing
  after all — it revoked EXECUTE from every role, including Supabase's
  own internal roles that fire these triggers (`supabase_auth_admin`
  inserting into `auth.users` on signup, `service_role`/`postgres`
  inserting into `fights` during the balldontlie sync), not just the
  externally-callable `anon`/`authenticated` roles the linter actually
  flagged. This broke signup outright (`POST /auth/v1/signup` → 500,
  discovered via live testing 2026-07-18). 004 re-grants `EXECUTE` to
  `postgres`/`service_role`/`supabase_auth_admin` and narrows the revoke
  to just `anon`/`authenticated`, which was the linter's actual concern.
  **Lesson:** `revoke ... from public` on a trigger function is not safe
  to assume no-op for trigger firing — verify end-to-end before trusting
  that reasoning again.
- **`pg_net` extension lives in the `public` schema** (linter:
  `extension_in_public`) — **deliberately left as-is, not a planned
  fix.** Verified against the live database (2026-07-16): `pg_net`'s
  `extnamespace` is `public`, but its `http_post` function physically
  lives in a separate `net` schema (a known pg_net quirk — its objects
  aren't confined to the extension's registered schema). The
  `notify_fighter_added_to_fight()` trigger calls `net.http_post(...)`
  explicitly. `ALTER EXTENSION pg_net SET SCHEMA ...` would attempt to
  relocate all of the extension's member objects, including the `net`
  schema's functions — if that succeeds, `net.http_post` would move to
  the new schema and the trigger's hardcoded `net.http_post` call would
  break. The risk of breaking fighter-follow push delivery outweighs
  silencing a WARN-level linter finding with no real exploit path.
- **Privacy policy drafted 2026-07-18**, not yet published:
  [`docs/legal/privacy-policy.de.md`](legal/privacy-policy.de.md) (the
  legally authoritative version — data controller is registered in
  Hamburg, Germany) + [`.en.md`](legal/privacy-policy.en.md) (courtesy
  translation), plus a Play/App Store data-safety-form cheat sheet at
  [`docs/legal/store-data-safety.md`](legal/store-data-safety.md). Both
  are drafts — **need a lawyer's review before publishing**, and both
  stores require a publicly reachable Privacy Policy URL at submission
  time, so the drafted markdown needs to be hosted somewhere (e.g.
  `true-mma.com/privacy`) before it's usable in either console.
  - **Hosting prepared but deliberately not deployed, 2026-07-19:**
    [`docs/legal/site/`](legal/site/) has static HTML versions of both
    languages (`privacy.de.html`/`privacy.en.html`, plus an `index.html`
    and shared `style.css`) converted 1:1 from the Markdown, each with a
    visible "draft, not legally reviewed yet" banner and `<meta
    name="robots" content="noindex, nofollow">` so nothing indexes it
    even if it ends up reachable by URL. This is upload-ready but has
    **not** been uploaded/deployed anywhere and `true-mma.com` has no DNS
    change pointing at it — going live requires (1) the lawyer review
    still pending above, and (2) actually deploying it (e.g. IONOS
    webspace, since that's already the domain/mail provider) and removing
    the draft banner + `noindex` meta tag once the content is final. Do
    not skip straight to a real store submission once this is live — see
    the maintainer's standing requirement for a joint planning/security
    review pass before any store release.
- `AGENTS.md` still points at the SDK 57 docs even though the project
  runs SDK 54 (downgraded to match the currently-published Expo Go app) —
  minor staleness, worth fixing if SDK is bumped again.
- ~~Fighter-follow push doesn't actually deliver on Android yet~~ —
  **resolved 2026-07-18.** FCM V1 credentials (Firebase project,
  service-account JSON uploaded to EAS via `eas credentials`,
  `google-services.json` referenced via `app.json` →
  `android.googleServicesFile` / `GOOGLE_SERVICES_JSON` EAS file env var,
  see [Build & deployment](#build--deployment)) are wired up and verified
  working in a real dev build — tapping the follow bell no longer throws
  `Default FirebaseApp is not initialized`, and a followed fighter being
  added to a fight now delivers a real push. See [Expo's FCM V1 setup
  guide](https://docs.expo.dev/push-notifications/fcm-credentials/) for
  the setup steps that were followed.
- ~~Leftover seed/placeholder events from before the balldontlie sync
  existed~~ — **resolved 2026-07-19.**
  `supabase/migrations/001_remove_seed_test_data.sql` removes "UFC 999:
  Ferreira vs. Volkov" and "OKTAGON 66: Novak vs. Sato" (fake fighter
  names, `external_id is null`, found via direct DB inspection during
  first on-device testing) plus the now-orphaned fake fighters. Matched by
  name pattern rather than fixed UUIDs, so it's safe to run on `stage` and
  `main` regardless of row-id drift between them — takes effect once this
  migration is promoted through the pipeline (PR `dev` → `stage` → `main`,
  see [Environments](#environments-dev--stage--main)), not immediately.
- **Spoiler protection — not implemented, backlog only (flagged
  2026-07-19).** A toggle to hide fight results, likely logged-in-users-only
  (parallels the timezone override's login-gating, see [Login /
  Profile](#login--profile)) so there's somewhere to persist the
  preference server-side. Open design questions, deliberately left for a
  future session rather than guessed at now: scope (per-fight mute, a
  followed-fighter-only mute, or a global "hide all results" toggle?),
  whether it should also suppress spoilers in push-notification text
  (fighter-follow push currently sends the opponent's name the moment a
  fight is announced, not a result — but a future "fight ended" push would
  need this considered), and how it interacts with `FighterDetailScreen`'s
  fight history (which shows W/L for every past fight) versus
  `EventDetailScreen`'s per-fight result line.
- **Full visual/UX redesign — in progress, started 2026-07-20.** Agreed
  process: critical analysis → mood/color → typography → component system →
  screen-by-screen, nothing final without discussion (see [App
  structure](#app-structure) for what's landed). Done: critical analysis of
  the pre-redesign UI; a "Chrome & Indigo" dark+light palette (replaced an
  initial "Steel & Ember" orange direction after user feedback that it read
  as "unsexy") and a Barlow Condensed/Inter type scale in
  `src/lib/theme.tsx`; a filter-system overhaul (`SegmentedControl`,
  `FilterChip`, `FilterModal`/`FilterSection`) covering both list screens,
  including a Männer/Frauen split on the fighter weight-class filter; a
  real weight-class ordering; tab bar icons switched to
  MaterialCommunityIcons; press feedback (`pressedStyle`) on every
  `Pressable` app-wide; the full `useTheme()` migration (every
  screen/component builds styles from the current theme via
  `makeStyles(colors)`); a manual System/Light/Dark appearance toggle
  (`themeOverride`, persisted) plus a consolidated settings area (gear icon
  on `ProfileScreen`, works logged-in or out) that folded the standalone
  Language tab into it; the previously-missing explanation `Alert` on
  `OrganizationFollowBell`. Verified hands-on 2026-07-20 on a real Android
  emulator via Expo Go (had to match the Expo Go APK version to the
  project's exact SDK — 54.0.8 — since the generic download 404s/crashes
  with "Incompatible SDK version" against a mismatched build): palette,
  typography, `SegmentedControl`, `FilterModal`, calendar mode, and live
  data all render correctly with no crashes. Didn't get to visually verify
  `FighterListScreen` in that session — an emulator/adb touch-input quirk
  unrelated to the app code, not a known issue.
  **Second bad transitive/direct dependency found 2026-07-20, same failure
  shape as the `@expo/vector-icons`/`expo-font` one already documented
  under [Build & deployment](#build--deployment):** `expo-linear-gradient`
  was pinned to `^57.0.1` (a version for a much later Expo SDK) instead of
  the SDK 54-compatible `~15.0.8`. Silent on Expo Go / the emulator
  hands-on pass above — only surfaced as an immediate crash on the first
  real **standalone** build (`preview` profile, see [Build &
  deployment](#build--deployment)'s fingerprint auto-build section),
  because that was the first time this project produced a real release
  APK instead of a dev-client build or Expo Go session. `adb logcat` (paired
  wirelessly, no cable, via `adb pair`/`adb connect` — Android's Wireless
  debugging under Developer options) showed `NoClassDefFoundError: Failed
  resolution of: Lexpo/modules/kotlin/types/descriptors/TypeDescriptor`
  inside `LinearGradientModule.definition`, the same
  `expo-modules-core` API-shape mismatch as the vector-icons incident.
  Fixed by `npx expo install expo-linear-gradient@~15.0.8` (confirmed via
  `npx expo install --check`). **Lesson: `npx expo install --check`
  catches this immediately — run it after adding any native dependency,
  not just after routine updates, and don't assume an emulator/Expo Go
  pass proves a native dependency is correctly versioned.**
  **Bugs found from that same hands-on pass, fixed 2026-07-20:**
  `FilterModal`'s `ScrollView` had no `flexShrink` — RN defaults that to 0,
  so content taller than the sheet's `maxHeight: '80%'` was clipped instead
  of scrollable (this is why the Settings modal's "Dunkel" option was hard
  to tap and the timezone section wasn't visible at all — both were just
  past the clipped edge, not actually broken); fixed by giving the
  `ScrollView` `flexShrink: 1`. The settings gear icon was absolutely
  positioned inside `ProfileScreen`'s body, landing it level with the
  screen's own content (e.g. the "Anmelden" heading) instead of the native
  header bar; moved to `headerRight` via `navigation.setOptions()` in a
  `useLayoutEffect`, so it now sits at the "Profil" header's height like a
  standard gear icon. Also this round: the Vergangene/Heute/Kommende
  timeframe reorder and the "Kommende includes today" / org-filter-hides-
  empty-leagues changes described in [App structure](#app-structure).
  Explicitly deferred/decided: no per-organization branding accent
  (UFC/OKTAGON/... stay visually neutral, text-only distinction) — avoids
  trade-dress proximity to real orgs' brand colors. `expo-linear-gradient`
  added 2026-07-20 for a subtle metallic sheen on filled-accent surfaces —
  `colors.accentGradient` (a two-stop `[string, string]` per palette in
  `theme.tsx`) is used by `SegmentedControl`'s active segment,
  `FilterChip`'s active chip, `EventDetailScreen`'s title-fight tag, and its
  vote-bar fill; deliberately not applied everywhere ("ohne zu aufregend zu
  werden" — the flat `accent` value still exists and is still the right
  choice for smaller/text-level uses). This is the redesign's first native
  (non-JS-only) dependency — it renders fine in Expo Go (bundled in the SDK)
  but **needs a fresh `eas build --profile development` before it shows up
  in an existing custom dev client**, since a dev client only has the
  native modules it was built with. Verified hands-on on a real Android
  emulator via Expo Go 2026-07-20: gradient renders correctly on both
  `SegmentedControl` and the org `FilterChip`s, no crash. Not yet done: a
  logo and app icon (must be store-review-distinguishable from
  UFC/OKTAGON, plus font/icon-license checks for commercial use).
  **Country flags, weight-class abbreviations, and fighter sorting — built
  2026-07-20, committed on `dev` only, not yet hands-on-verified and not yet
  promoted.**
  - **Flags:** `src/components/Flag.tsx` renders a country flag via
    `react-native-svg`'s `SvgXml` from `country-flag-icons`' 3x2 SVG strings;
    `src/lib/countryFlags.ts` maps balldontlie's free-text country names
    (`fighters.nationality`, `events.country` — plain English names like
    `USA`/`Brazil`/`England`, not ISO codes) to flag keys, covering all ~120
    distinct DB values plus common alternate spellings, case-insensitive
    fallback, and renders nothing (never errors) on an unmapped name. Uses the
    real **`GB_ENG`/`GB_SCT`/`GB_WLS`/`GB_NIR`** constituent flags for
    England/Scotland/Wales/Northern Ireland, not the Union Jack — worth having
    for a British-Isles-heavy roster. The whole 3x2 set (~265 flags) is
    imported via `import * as` so a fighter from a new country gets a flag with
    no code change beyond a name-map entry; deliberate bundle-size-over-
    per-country-imports trade-off (SVG strings compress well, and this keeps
    the feature self-healing as the roster grows). Shown on: fighter-list rows,
    fighter-detail header, `EventDetailScreen`'s fight-card matchup (next to
    each fighter name), the event location line (list + detail), and the
    nationality **filter chips** (via `FilterChip`'s generic optional `leading`
    prop, so the chips match the flags on the rows they filter). Not shown
    (deliberately, to avoid clutter): the fighter-detail fight-history opponent
    rows — the opponent name is already a tap-link to their detail, which
    carries the flag in its header.
  - **Library choice:** `country-flag-icons` (mainstream, MIT, ~weekly
    releases) as a pure SVG-string data source + Expo's first-party
    `react-native-svg` for rendering — chosen over the dedicated RN flag
    components (`react-native-svg-circle-country-flags`/
    `react-native-country-flag` both unmaintained since 2023,
    `react-native-country-flag-icons` a v1.0.0 single-author package), to avoid
    a stale/immature dependency for a project that's otherwise careful about
    supply-chain surface.
  - **Weight-class abbreviations:** `abbreviateWeightClass()` and the now-
    exported `weightClassRank()` in `queries.ts` share the same free-text
    substring match as `sortWeightClasses()`/`WEIGHT_CLASS_ORDER` (women's get
    a `W` prefix, unrecognized values fall through to the full name). Shown as a
    compact badge on fighter-list cards (the division wasn't surfaced there at
    all before) and on the fight-card weight line; `TaleOfTheTape` and the
    filter chips keep the full names on purpose (room + scannability).
  - **Fighter sorting:** name / weight class / record / nationality, added as a
    `Sortieren nach` section in the existing `FilterModal` (single-select
    chips) rather than a new UI pattern. Favorited fighters still pin to the
    top; the sort key orders within, with name as a deterministic tiebreaker.
    Purely client-side over the already-loaded list — no query change. (Event
    list stays chronological; sorting only makes sense for fighters.)
  - **`react-native-svg@15.12.1` is the redesign's second native dependency**
    (after `expo-linear-gradient`) — same caveat: it renders in Expo Go
    (bundled in the SDK) but **needs a fresh `eas build --profile development`
    before it appears in an existing custom dev client**. Not yet verified on a
    real device/emulator. `country-flag-icons` itself is pure JS (no native
    surface).
- **Fighter-follow push on fight start — built 2026-07-20, promoted to
  stage (PR #12) and main (PR #13) the same day.** Migration
  `009_fighter_fight_start_push.sql` extends `send_league_start_pushes()`
  (name kept for continuity even though it now covers two audiences — see
  [Notifications](#notifications)) to also message followers of any fighter
  with a non-cancelled fight on an event, when that event's broadcast
  starts. Granularity is per-**event**, not per-fight — balldontlie only
  gives broadcast segment start times, never an individual fight's start
  time, so there's nothing finer to key off; this reuses the exact same
  30-minute "did this event just start" gate and
  `league_start_push_sent_at`/`_request_ids` tracking the org-follow push
  already had, just with a second `send_expo_push_chunked()` call tagged
  `'fighter_follow'` (matching the tag `notify_fighter_added_to_fight()`
  already uses for the "booked" push) instead of `'league_start'`. A user
  following both the org and one of the card's fighters gets two separate
  messages — accepted as a minor duplicate rather than adding dedup
  complexity for a rare overlap. `FighterFollowBell`'s explanation text
  updated to match. **Not yet applied to any real database** — migrations
  only auto-deploy on push to `stage`/`main` (see
  `deploy-migrations.yml`); applied cleanly to both stage and production —
  should be checked against a real upcoming event once one is on the
  calendar, still unverified against real push delivery.
- **Data gaps — checked directly against the live DB 2026-07-20, both
  confirmed real, neither a code bug.** (1) Bellator, Invicta, KSW, and ONE
  have **zero** event rows in the database at all (not just zero upcoming)
  — balldontlie simply has no data for them. CW has 2 events/0 upcoming,
  LFA 20/0, RIZIN 4/0 — all past, nothing announced. Confirms
  `sync-balldontlie.ts` (no allowlist, pulls every league balldontlie
  returns) was never the problem. (2) Fight-history coverage: of 1,000
  active fighters checked, 417 (42%) have exactly 1 fight row, 371 (37%)
  have 2, only 1 has 6+; 986 total fight rows across all of them. Confirms
  `getFighterFights()` (no `.limit()`) isn't truncating anything —
  balldontlie's historical coverage is just shallow for most fighters.
  Both are upstream data-source limitations, not bugs to chase in this
  codebase.
- **Auth/profile UX overhaul — in progress, started 2026-07-20.** Triggered by
  the SMTP incident above plus a real-device pass that surfaced further
  problems. Phased plan (full detail, decisions, and file-level notes in the
  session that started it — summarized here): Phase 0 (dashboard template
  re-check, `keyboardShouldPersistTaps` double-tap fix) and Phase 1 (structured
  `AuthResult`/per-error-code messages, i18n split + parity check, autofill/
  chaining/password-visibility form polish) are **done**, see the "Auth error
  handling & form UX" note under [Login / Profile](#login--profile). **Still
  open:**
  - ~~Timezone picker reported unreachable on a real device~~ — **confirmed
    fixed 2026-07-20**, was a stale build, the existing `flexShrink: 1` fix
    was already correct.
  - **Double-tap on submit buttons needed a stronger fix than planned** —
    `keyboardShouldPersistTaps="handled"` (Phase 0) didn't fully solve it with
    manually-typed input (only looked fixed because the first retest
    happened to use autofill); changed to `"always"`, see the "Auth error
    handling & form UX" note under [Login / Profile](#login--profile).
  - Further login-experience polish landed same day: submit-button spinners,
    email trim/lowercase normalization, a distinct network-error message,
    remembered last-used email, and an accessibility label on the
    password-visibility toggle — see the same note.
  - ~~Password policy~~ — **done 2026-07-20**: minimum 8 characters + at
    least one letter and one number, `src/lib/passwordPolicy.ts` drives both
    the live checklist and pre-submit checks. **Still needed:** the matching
    dashboard settings on both stage and prod (local `config.toml` only
    affects local dev).
  - ~~Multilingual auth emails~~ — Edge Function **live on stage** (verified
    working end-to-end) and **now fixed on production too (2026-07-20)**: the
    generic 500 was a stale `IONOS_SMTP_PASSWORD` secret; re-setting it made a
    real prod signup return `POST /auth/v1/signup` → 200. See the "Multilingual
    auth emails via Edge Function" note above (Auth emails section) for the
    `execution_time_ms` diagnosis. The credential-length `console.log`
    diagnostic has since been removed (replaced by a non-sensitive "creds
    missing" `console.error` guard). ~~**Still to do:** (1) redeploy the function
    to stage+prod to ship the new `email_change` template *and* the log cleanup;
    (2) set "Secure email change" OFF on both dashboards.~~ **Both done
    2026-07-20:** the function was redeployed to stage (MCP) and prod (CLI), and
    "Secure email change" was switched OFF on both dashboards — the email-change
    flow is now live end-to-end on both environments.
  - ~~Signup confirmation link-based~~ — **done 2026-07-20**: `confirmSignup()`
    + `resendSignupConfirmation()` (`src/lib/auth.tsx`) and a new
    `signup-confirm` mode in `ProfileScreen.tsx` (code-entry UI, resend button
    with a 60s cooldown) replace the old link-based flow. Verified against
    stage only, since production's Edge Function isn't sending real emails
    yet — the OTP-entry logic itself doesn't depend on which project's hook
    is fixed.
  - ~~Magic-link/OTP-only login~~ — **done 2026-07-20**: `requestMagicLink()`/
    `confirmMagicLink()` (`auth.tsx`) + a new `magic-request`/`magic-confirm`
    mode pair in `ProfileScreen.tsx`, reusing the same code-entry pattern as
    signup/reset. `shouldCreateUser: false` so it can't be used to create new
    accounts (that stays through `signUp()`, keeping the password-policy/OTP
    gate intact). Verified against stage — hook fires successfully for the
    `magiclink` email type. Entry point is a "Log in without a password" link
    on the login screen.
  - ~~Biometric re-auth~~ — **code written 2026-07-20, untested** (needs a new
    EAS native build before any device can use it — `expo-local-authentication`
    is a native module addition). `src/lib/biometrics.ts` (availability check,
    the AsyncStorage-backed on/off preference, the actual
    `authenticateAsync()` call), `src/components/BiometricGate.tsx` (wraps
    `Navigation` in `App.tsx`, inside `AuthProvider` — locks the whole app
    behind a prompt whenever it's foregrounded while logged in and the
    preference is on; no-op for anonymous users or anyone who hasn't enabled
    it), and a toggle in `SettingsModal`/`ProfileScreen` (only shown when
    logged in **and** the device actually reports usable biometric hardware).
    `BiometricGate` uses a three-state machine (`checking`/`locked`/`open`,
    hardened 2026-07-20): while the async enabled-check runs it renders a blank
    cover, never the app content, so a protected app can't flash its content on
    cold start or foreground before the lock engages; and the lock screen has a
    logout escape hatch (plus the device-PIN fallback) so a user who can't
    authenticate is never trapped.
    This gates access to an *already-persisted* session — it is not a new
    sign-in method and never talks to Supabase.
  - ~~Google/Apple social login~~ — **code written 2026-07-20, untested and
    not functional yet** (needs a new EAS native build, plus external console
    setup only the user can do — see below). `signInWithGoogle()`/
    `signInWithApple()` (`auth.tsx`), buttons on the login/signup screen
    (Apple's only rendered when `AppleAuthentication.isAvailableAsync()` is
    true — effectively iOS only, and this project has no iOS build yet
    either way).
    - **Google:** `expo-web-browser` opens `supabase.auth.signInWithOAuth()`'s
      URL, then `expo-auth-session`'s `getQueryParams()` helper
      (`src/lib/oauthRedirect.ts`) parses the returned session tokens out of
      the redirect URL — needed because they come back as a URL *fragment*,
      which React Native's URL parsing doesn't handle reliably on its own.
      `app.json` now has `"scheme": "truemma"` for the redirect to reach the
      app at all.
    - **Apple:** `expo-apple-authentication`'s native `signInAsync()` +
      `supabase.auth.signInWithIdToken({ provider: 'apple' })` — no browser
      round-trip needed.
    - `supabase/config.toml` has `[auth.external.google]`/
      `[auth.external.apple]` stanzas, both `enabled = false`, `client_id`/
      `secret` wired to `env(...)` placeholders.
    - **What's still needed, entirely external and user-only — Claude cannot
      do this part:** a Google Cloud Console OAuth client (web + Android + iOS
      client IDs, consent screen) and an Apple Developer Services ID + Sign
      In with Apple key. Once those exist: real values as env vars (local +
      EAS + `supabase secrets set` for stage/prod), `enabled = true` on both
      Supabase projects, and a fresh EAS native build.
    - **Store-review implication:** adding Google Sign-In makes Sign In with
      Apple close to mandatory on iOS per App Store guideline 4.8, not
      optional — budget for both together, not just Google.
    - `docs/ARCHITECTURE.md:669`'s "email+password only (no magic link, no
      OAuth)" claim is already stale now that magic-link exists — updated
      above; the "no OAuth" half stays accurate until this is actually
      enabled.
- **Production's email-send rate limit was found silently set to 2/hour,
  2026-07-20** (an auth log line surfaced it mid-debugging:
  `"env GOTRUE_RATE_LIMIT_EMAIL_SENT changed, updating Email limiter from 30
  to 2"` — unclear whether ever deliberately changed or a side effect of
  another config change). Raised to 100 as an immediate fix. **Still open:**
  a full review of every rate limit (not just email) on both stage and prod
  dashboards, to confirm each is intentional rather than a leftover/accidental
  value — nobody had reviewed these as a standing setting before this.
- **Automated runtime-error monitoring — built 2026-07-20, committed on `dev`,
  not yet validated live or promoted.** The project's repeated failure mode has
  been *silence* (the production auth-email 500 ran for hours unnoticed), so
  this complements the interactive advisor-check habit with actual runtime
  signals. `scripts/check-supabase-logs.ts` (`npm run check:logs`) scans **both**
  projects over the last ~24h via the Management API log-analytics endpoint
  (`/v1/projects/{ref}/analytics/endpoints/logs.all`) for edge-function 5xx,
  auth `level = 'error'`, and Postgres `ERROR`/`FATAL`, using the single
  account-level `SUPABASE_ACCESS_TOKEN` (no per-project service-role key needed).
  `.github/workflows/monitor-supabase.yml` runs it twice daily; the scan's
  non-zero exit on any error (or on a check that can't run — it fails loudly, it
  never silently passes) fails the workflow, and GitHub emails the repo admins
  about the failed scheduled run (the v1 alert path — no extra secret/vendor;
  upgrade to an open-or-update GitHub issue if the daily "still broken" mails get
  noisy). **Caveats / still to do:** (1) the log-analytics endpoint is an
  unstable Management API surface and its BigQuery-style nested-field SQL is
  best-effort — needs one live `SUPABASE_ACCESS_TOKEN=... npm run check:logs` run
  to confirm the queries return the expected shape before a green result can be
  trusted (the token isn't available in the local shell — the CLI keeps it in
  the OS keychain, not a file); (2) the workflow can't fire until it's on `main`
  (the standard new-workflow constraint); (3) scope is Supabase-side only —
  **Expo/client crash telemetry is deliberately out of v1** (needs a crash
  reporter like Sentry: a new vendor + GDPR surface, a separate decision). The
  `pg_cron` push health (`league_start_push_health()`) stays a service-role-only
  interactive check for now — it's not in the token-only script, though pg_cron
  failures would also surface via the Postgres ERROR scan.
