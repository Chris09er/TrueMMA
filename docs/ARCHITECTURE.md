# MMA Pocket — Technical Architecture

Living document. Update this alongside the code whenever a feature, schema
change, or architectural decision lands — not as a separate cleanup pass.
For product scope (what's in/out of scope), see the project's own
conversations/decisions with the maintainer; this file is technical only.

## Tech stack

- **App:** React Native + Expo SDK 54 (managed workflow), TypeScript, no
  Expo Router — plain `@react-navigation` (bottom tabs + one native stack).
- **Backend:** Supabase (Postgres + PostgREST + `pg_net`), region
  eu-central-1. No custom server — the only "backend logic" is SQL
  (triggers/functions) plus a standalone local Node sync script.
- **External data source:** balldontlie.io MMA API (paid ALL-STAR tier),
  synced into Supabase on demand, never called from the app itself.
- **Build:** EAS Build for a development client (required — see
  [Push notifications](#notifications) for why Expo Go isn't enough).

## Data model

Tables (Supabase Postgres), all with RLS enabled:

| Table | Purpose | Client write access |
|---|---|---|
| `organizations` | Leagues/promotions (UFC, OKTAGON, + 9 auto-synced) | none (read-only) |
| `fighters` | Fighter roster | none (read-only) |
| `events` | Event calendar entries | none (read-only) |
| `fights` | Matchups within an event, incl. results | none (read-only) |
| `push_subscriptions` | Device push token ↔ followed fighter | **insert/select/delete** (anon) |

`push_subscriptions` is the one exception to "app is read-only" — it's how
the fighter-follow bell registers/unregisters without requiring login. See
[Notifications](#notifications).

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

- `App.tsx` — root: `LocaleProvider` → `NavigationContainer` (dark theme) →
  bottom tabs.
- **Navigation** (`src/navigation.ts`): `RootTabParamList` (EventsTab,
  FightersTab, LanguageTab, ContactTab) + `EventsStackParamList`
  (EventList → EventDetail, native stack nested inside the Events tab).
- **Screens** (`src/screens/`):
  - `EventListScreen` — upcoming/past toggle, org filter (UFC/OKTAGON
    pinned first via `PINNED_ORG_ORDER` in `queries.ts`, rest alphabetical),
    text search (client-side substring match), pull-to-refresh, per-event
    reminder bell (only rendered for events where `isEventUpcoming()` is
    true).
  - `EventDetailScreen` — event header + fight card list; shows main
    event/title fight tags, weight class, and (for past fights) the result
    (winner highlighted gold, method/round/time).
  - `FighterListScreen` — search, pull-to-refresh, per-fighter follow bell.
    Tapping a fighter opens their Tapology/Sherdog profile if one exists.
  - `LanguageScreen`, `ContactScreen` — simple settings-style screens.
- **Shared lib** (`src/lib/`):
  - `theme.ts` — dark palette, spacing/radius tokens, `commonStyles`
    (loading/error/empty — reused by every list/detail screen).
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
  presentational icon-button), `EventReminderBell`, `FighterFollowBell`
  (each wraps `BellIconButton` with its own state/data logic).

## Notifications

Two independent mechanisms, because they have fundamentally different
constraints:

1. **Event reminders** (`src/lib/notifications.ts`) — **local** device
   notifications via `expo-notifications`, scheduled on-device for a
   specific event's start time, tracked in AsyncStorage
   (`mma-pocket:event-reminder:<eventId>` → notification id). No backend
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

`resolvePushToken()` in `pushSubscriptions.ts` deliberately never prompts
for permission just to *check* follow-state (`isFollowingFighter`) — only
an explicit `followFighter()` call (interactive) may trigger the OS
permission dialog. Concurrent callers share one in-flight token-resolution
promise.

## balldontlie sync

`scripts/sync-balldontlie.ts`, run manually: `npm run sync:balldontlie`.
Needs `SUPABASE_SERVICE_ROLE_KEY` + `BALLDONTLIE_API_KEY` in `.env`
(server-side only — never `EXPO_PUBLIC_`-prefixed, never shipped in the
app; the service-role key bypasses RLS, which is required since this is
the only thing that writes to the otherwise read-only tables).

**Why a local script and not a scheduled job:** thinnest option that fits
the project's "no backend beyond Supabase" principle; the maintainer runs
it on demand. Nothing prevents wiring it into a cron/GitHub Action later
if that becomes worth the complexity.

**API quirks (all discovered empirically, not documented by balldontlie):**
- `/fights` requires the paid ALL-STAR tier ($9.99/mo); `/leagues`,
  `/events`, `/fighters` are on the free tier.
- Neither `statuses[]=scheduled` nor date-range params (`start_date`,
  `dates[]`) are honored by `/events` — confirmed identical responses with
  and without them. Every sync paginates through balldontlie's **entire**
  history (~28k events across 10 leagues) and filters by date client-side.
  This is why the sync also keeps a rolling past window
  (`PAST_WINDOW_DAYS = 365`, see below) — it costs nothing extra since the
  full pagination pass is unavoidable anyway.
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
- Fighter objects are fully embedded in `/fights` responses, so there's no
  separate `/fighters` crawl; the fighter set is derived from whichever
  fights got synced.
- Rate limit on ALL-STAR: 60 req/min. The script paces requests
  (`MIN_REQUEST_INTERVAL_MS`) and retries once on 429 with a capped number
  of attempts (`MAX_RATE_LIMIT_RETRIES`) rather than retrying forever.

**Sync flow:** `syncLeagues()` (also backfills `external_id` onto
pre-existing manually-entered orgs matched by `short_name`, so re-running
after seeding data doesn't create duplicate organizations) →
`syncEvents()` (full history fetch, filtered to the past-window + future)
→ `syncFightersAndFights()` (fights for those events, batched by
`event_ids[]`; fighters derived from the fight payloads).

## Build & deployment

- **EAS project:** `@chris09er/mma-pocket`, `app.json` →
  `extra.eas.projectId`. Android package / iOS bundle id:
  `com.mmapocket.app`.
- **`eas.json` profiles:** `development` (dev client, internal APK),
  `preview` (internal APK), `production`.
- **Environment variables for builds:** `EXPO_PUBLIC_SUPABASE_URL` /
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` are registered as EAS project env vars
  (`eas env:create`) for all three environments — EAS builds do **not**
  read the local `.env` file, so these must be kept in sync manually if
  they ever change.
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

## Known open items

- `push_subscriptions` RLS is fully public (`insert`/`select`/`delete` all
  `using (true)`) — acceptable for MVP (no login, low-sensitivity data:
  device token ↔ fighter id), but means anyone holding a given push token
  could theoretically unfollow on someone else's behalf. Documented in the
  SQL setup comment, not currently a planned fix.
- Once notifications/data collection ship to the app stores, a privacy
  policy + Apple/Google data-safety disclosures are required before
  release (flagged, not yet done).
- `AGENTS.md` still points at the SDK 57 docs even though the project
  runs SDK 54 (downgraded to match the currently-published Expo Go app) —
  minor staleness, worth fixing if SDK is bumped again.
