# MMAPocket — Technical Architecture

Project name is "MMAPocket" as of 2026-07-15 (renamed from "MMA Pocket";
GitHub repo, `package.json`, and `app.json` display name updated — the
EAS project slug and Supabase-adjacent identifiers were intentionally left
as `mma-pocket`/`mmapocket` to avoid disrupting live infrastructure
mid-build; revisit if/when the final go-live name is chosen).

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
| `push_subscriptions` | Device push token ↔ followed fighter, optional `user_id` | **insert/select/delete** (anon, or own rows if logged in) |
| `profiles` | Login-only: nickname per account (`id` = `auth.users.id`) | own row only |
| `event_follows` | Login-only: user ↔ followed event (profile visibility) | own rows only |
| `fighter_favorites` / `event_favorites` | Login-only: user ↔ favorited fighter/event | own rows only |

`push_subscriptions` is the one exception to "app is read-only" for
anonymous users — it's how the fighter-follow bell registers/unregisters
without requiring login. See [Notifications](#notifications) and
[Login / Profile](#login--profile).

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
    upcoming/past toggle, org filter (UFC/OKTAGON pinned first via
    `PINNED_ORG_ORDER` in `queries.ts`, rest alphabetical; horizontally
    scrollable — the org list is longer than one screen width, e.g. PFL
    only shows up if you scroll), text search (client-side substring
    match), pull-to-refresh; calendar mode: month grid
    (`react-native-calendars`, pure JS — no native module, no EAS rebuild)
    with a dot on days that have events, fed per-month by
    `getEventsInRange()` (independent of the upcoming/past split), tapping
    a day filters the list below to that day; org filter applies in both
    modes. Per-event reminder bell + favorite heart (only bell rendered
    for events where `isEventUpcoming()` is true, heart always).
  - `EventDetailScreen` — event header + fight card list in **chronological
    fight-night order** (opener first, main event last —
    `getFightsForEvent` orders `card_position` descending, since
    balldontlie's `fight_order` numbers the main event lowest and
    increases toward the undercard; `nullsFirst: false` so manually-entered
    fights without a `card_position` sort last, not first). This direction
    was flipped twice during testing (main-event-first was the original
    ask, then reversed to chronological after live testing — see git
    history on `queries.ts` if this needs revisiting again); shows main
    event/title fight tags, weight class, and (for past fights) the result
    (winner highlighted gold, method/round/time).
  - `FighterListScreen` — search, nationality filter (derived client-side
    from the loaded fighters, horizontally scrollable, same
    `FilterButton` component as the event org filter), pull-to-refresh,
    per-fighter follow bell. Tapping a fighter opens `FighterDetailScreen`
    (used to jump straight to Tapology/Sherdog — now shows an in-app
    profile first, external links are explicit buttons there).
  - `FighterDetailScreen` — photo/name/nickname/nationality, Tapology/
    Sherdog link buttons, follow bell, upcoming fight (if any, via
    `isEventUpcoming`) and full fight history (opponent, event, win/loss
    by comparing `result_winner_id`), fed by `getFighterFights()` in
    `queries.ts` (fetches both `fighter1_id`/`fighter2_id` sides via
    `.or()`, sorted by the embedded event's date client-side). Reachable
    both from `FighterListScreen` and from tapping a fighter's name in
    `EventDetailScreen`'s fight card (cross-tab navigation, see
    Navigation above). Within each upcoming/history row, the opponent name
    and event name are themselves tappable, navigating on to that
    opponent's `FighterDetail` or the event's `EventDetail` respectively.
  - `LanguageScreen`, `ContactScreen` — simple settings-style screens.
    `LanguageScreen` shows a flag emoji per entry (`SUPPORTED_LOCALES` in
    `i18n.tsx` now carries a `flag` field alongside `code`/`label`).
  - `ProfileScreen` — logged-out: login/signup form + forgot-password (OTP)
    flow. Logged-in: nickname, change email/password, followed and
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
  re-layout.

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

### Auth emails

Supabase's built-in email service (used during early development) is
heavily rate-limited and only meant for testing — it also doesn't allow
editing email templates at all without a custom SMTP provider configured,
which is a hard requirement, not just a "nice to have for scale."

- **Domain:** `true-mma.com`, purchased 2026-07-16 specifically to get a
  real sender domain for auth emails — **not necessarily the app's final
  name** (see the `MMAPocket` naming note at the top of this doc; the
  business name is still undecided). Cheap to replace later: swapping to
  a different domain only means re-verifying it with the SMTP
  provider and updating the sender address in Supabase — no app code
  depends on this domain at all.
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
  (`mma-pocket:favorites:fighters` / `:events`) — until login, at which
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
- Once notifications/data collection ship to the app stores, a privacy
  policy + Apple/Google data-safety disclosures are required before
  release (flagged, not yet done).
- `AGENTS.md` still points at the SDK 57 docs even though the project
  runs SDK 54 (downgraded to match the currently-published Expo Go app) —
  minor staleness, worth fixing if SDK is bumped again.
- **Fighter-follow push doesn't actually deliver on Android yet.**
  Tapping the follow bell throws `Default FirebaseApp is not initialized`
  from `Notifications.getExpoPushTokenAsync()` — Android push delivery
  requires Firebase Cloud Messaging (FCM V1) credentials, which is a
  separate setup from everything else in this project (needs a Firebase
  project, a service-account JSON uploaded to EAS via `eas credentials`,
  and `google-services.json` referenced in `app.json` →
  `android.googleServicesFile`, followed by another native rebuild).
  Deliberately deferred (2026-07-15) — not needed to keep developing other
  features, but must be done before the fighter-follow feature actually
  works on a real device. See
  [Expo's FCM V1 setup guide](https://docs.expo.dev/push-notifications/fcm-credentials/).
  The event-reminder bell (local notifications) is unaffected and already
  works.
