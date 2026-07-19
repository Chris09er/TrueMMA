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
  testing can't accidentally read/write real production data. Note this
  is orthogonal to the `dev`/`stage`/`main` **git branches**: pushing to
  `dev` triggers no CI at all (`deploy-migrations.yml`/
  `publish-ota-update.yml` only watch `stage`/`main`); a dev-client APK
  reflects whatever's on disk live via Metro (`npx expo start`), not any
  git or CI state. `SUPABASE_SERVICE_ROLE_KEY` in local `.env` is **still
  the prod key** — only the sync scripts read it, not the app, but fetch
  the stage key too (`supabase projects api-keys --project-ref
  qvjgsbeugllobgwabebv --reveal`, or the stage project's dashboard) before
  running `npm run sync:balldontlie`/`sync:live` locally against stage.
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
  environment/branch/secrets. Stage's full sync runs hourly instead of
  prod's 6-hourly cadence (shorter feedback loop while testing); the
  5-minute live-event check stays the same cadence for both since it's
  already near-free when nothing is live.
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

- `App.tsx` — root: `LocaleProvider` → `NavigationContainer` (dark theme) →
  bottom tabs.
- **Navigation** (`src/navigation.ts`): `RootTabParamList` (EventsTab,
  FightersTab, ProfileTab, LanguageTab, ContactTab) +
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
  - `EventListScreen` — list/calendar view toggle (top row); list mode:
    today/upcoming/past toggle (added 2026-07-19 — "today" =
    `getTodayEvents()` in `queries.ts`, events on today's local calendar
    date **or** still `isEventLive()` — covers a card that started before
    midnight and hasn't rolled into "past" yet), org filter (UFC/OKTAGON pinned first via
    `PINNED_ORG_ORDER` in `queries.ts`, rest alphabetical; horizontally
    scrollable — the org list is longer than one screen width, e.g. PFL
    only shows up if you scroll), text search (client-side substring
    match), pull-to-refresh; calendar mode: month grid
    (`react-native-calendars`, pure JS — no native module, no EAS rebuild)
    with a dot on days that have events, fed per-month by
    `getEventsInRange()` (independent of the upcoming/past split), tapping
    a day filters the list below to that day; org filter applies in both
    modes. Per-event reminder bell + favorite heart (only bell rendered
    for events where `isEventUpcoming()` is true, heart always). A pulsing
    red `LiveBadge` (`src/components/`, added 2026-07-19, RN's built-in
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
  - `FighterListScreen` — search, a single "Filter" button (added
    2026-07-19, replacing what used to be a lone horizontal-scroll
    nationality row) opening a bottom-sheet `Modal` (RN built-in, no new
    dependency) with three independently-combinable (AND) sections —
    Organisation (`primary_organization_id`, see [Data
    model](#data-model)), Gewichtsklasse (`weight_class`), Nationalität —
    each a wrapped chip row rather than horizontal-scroll, since a modal
    has the vertical room a header row doesn't. All three still derive
    their options client-side from the already-loaded fighter list, same
    as the original nationality-only filter. Pull-to-refresh, per-fighter
    follow bell. Tapping a fighter opens `FighterDetailScreen`
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
  - `LanguageScreen`, `ContactScreen` — simple settings-style screens.
    `LanguageScreen` shows a flag emoji per entry (`SUPPORTED_LOCALES` in
    `i18n.tsx` now carries a `flag` field alongside `code`/`label`).
    `ContactScreen` (updated 2026-07-19) shows the support email as
    selectable `Text` (RN's built-in `selectable` prop — native
    long-press-copy, no new dependency) above the mailto button, and
    guards `Linking.openURL` with `Linking.canOpenURL` first, falling back
    to an alert instead of failing silently if no mail client is
    configured.
  - `ProfileScreen` — logged-out: login/signup form + forgot-password (OTP)
    flow. Logged-in: nickname, change email/password, a timezone-override
    picker (added 2026-07-19, see [Login / Profile](#login--profile)),
    followed fighters/events/**organizations** (added 2026-07-19) and
    favorited fighters/events (reusing the same bell/heart components to
    unfollow/unfavorite directly from the list), logout. See
    [Login / Profile](#login--profile) and [Favorites](#favorites).
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
  presentational icon-button, `icon`/`offsetRight` props), `EventReminderBell`,
  `FighterFollowBell` (each wraps `BellIconButton`, shows an `Alert` after
  a successful toggle explaining what enabling/disabling the reminder
  does), `EventFavoriteHeart`, `FighterFavoriteHeart` (same pattern, see
  [Favorites](#favorites)). `FilterButton` (shared filter-chip, used by
  the event org filter and the fighter nationality filter) — always
  resolves to a concrete style object per state (`active ? styleA :
  styleB`, never a bare `false` in a style array) with an explicit
  `minHeight`, after a real-device Android bug where inactive chips
  rendered as an unreadable blank/white sliver until the row was
  otherwise forced to re-layout. The wrapping horizontal `ScrollView` in
  both `EventListScreen` and `FighterListScreen` also needs an explicit
  `style={{ flexGrow: 0 }}` (separate from `contentContainerStyle`) —
  without it, RN's default `flexGrow` behavior lets the row collapse when
  a flex-column sibling (the list/calendar below) claims space on
  re-layout. **Same bug family, hit again 2026-07-19:** `flexGrow: 0`
  alone still wasn't enough on a real device for `EventListScreen`'s org
  filter row — the first event card visibly overlapped it. Fixed with an
  explicit `height: 60` (36px `FilterButton` `minHeight` + 2×12px vertical
  padding) on the container, so its height is reserved immediately instead
  of depending on the horizontal `ScrollView`'s intrinsic-size layout
  timing at all. Worth applying the same explicit-height fix proactively
  to any future horizontal filter row, rather than waiting for it to
  surface again on-device.

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
3. **League-follow push** (`src/lib/organizationFollows.ts`, added
   2026-07-19) — same push-token/anonymous-follow shape as fighter-follow,
   but fires when a followed organization's event actually **starts**, not
   when it's created — so it can't be a simple `AFTER INSERT` trigger.
   Instead, `scripts/sync-live-event.ts`'s existing 5-minute "is anything
   live right now?" poll (see [balldontlie sync](#balldontlie-sync)) got a
   `sendLeagueStartPushes()` step: for each event that just went live and
   hasn't been notified yet (`events.league_start_push_sent_at is null`),
   it looks up `organization_follows` for that org and POSTs to the same
   Expo push endpoint directly from Node (not SQL, since the "is it live"
   logic already lives here in JS), then stamps
   `league_start_push_sent_at` so it only fires once per event.

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

- **Auth backend:** Supabase Auth, email+password only (no magic link, no
  OAuth). `src/lib/supabase.ts` now persists the session
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
  beyond the per-device uniqueness constraint).
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
per-minute cap — the 5-minute live-check alone is ~8,600 runs/month,
which would blow through the 2,000 free minutes/month a private repo
gets (GitHub bills a minimum of 1 minute per job run even for an
instant no-op). Git history was checked for leaked secrets before
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
- **EAS Update (OTA), set up 2026-07-19:** `expo-updates` installed (a
  native module — requires a fresh `eas build --profile development` once,
  same as any native module addition, see the rebuild-triggers note
  above). `app.config.js` sets `updates.url` (the project's EAS Update
  endpoint, `https://u.expo.dev/<projectId>`) and `runtimeVersion: {
  policy: 'appVersion' }` — a build and an OTA update are only compatible
  if `app.json`'s `version` matches, so bumping `version` on a release
  that also changes native code is what forces a fresh build instead of
  silently serving an incompatible update.
  - **Channels** (`eas.json` → `build.<profile>.channel`), named after the
    branch pipeline rather than the build-profile names: `development`
    profile → `development` channel, `preview` profile → `stage` channel,
    `production` profile → `production` channel. A build only ever pulls
    updates published to its own channel.
  - **`.github/workflows/publish-ota-update.yml`** (new) — on every push
    to `main`/`stage` (excluding migration/docs/workflow-only changes,
    which don't need a JS republish), runs `eas update --channel
    <channel> --branch <channel>`, targeting the matching channel via
    `github.ref_name`. Uses `--environment production`/`preview` (not
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

## Known open items

- ~~EAS Update (OTA) channels configured but not yet live end-to-end~~ —
  **resolved 2026-07-19.** `EXPO_TOKEN` repo secret created (an Expo
  **robot user** token, not a personal one — see [Build &
  deployment](#build--deployment) for why) and a fresh `eas build
  --profile development` completed, so the dev client now has
  `expo-updates` built in. `preview`/`production` builds still need one
  fresh build each before they can receive OTA updates, same reasoning —
  any build made before 2026-07-19 predates `expo-updates` entirely.
- **Revisit Supabase Branching vs. two free-tier projects** before a real
  store release — see the trade-off written up in
  [Environments](#environments-dev--stage--main). Switching to Branching
  later is expected to be cheap since stage only ever holds disposable
  test data.
- `push_subscriptions` anonymous rows (`user_id is null`) are still fully
  public by design (`user_id is null or user_id = auth.uid()`) —
  acceptable for MVP (low-sensitivity data: device token ↔ fighter id),
  but means anyone holding a given push token could theoretically
  unfollow on someone else's behalf. Rows tied to a logged-in user
  (`user_id = auth.uid()`) are scoped. Not currently a planned fix for
  the anonymous case.
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
