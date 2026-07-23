-- Gruppe C, cutover: drop the five legacy favorite/follow tables.
--
-- These were deliberately left in place by 014 ("nothing reads them after this,
-- but don't drop until it's verified on a real build, so a rollback doesn't
-- strand data"). That verification is done — see the "Verified on a real build"
-- note in docs/ARCHITECTURE.md — so this migration completes the cutover.
--
-- What replaced each of them:
--   fighter_favorites   → saved_fighters
--   event_favorites     → saved_events
--   event_follows       → saved_events        (was user_id-only, no push at all)
--   organization_follows→ saved_organizations
--   push_subscriptions  → saved_fighters.push_token
--
-- No data is migrated. That was decided when the model was locked: both
-- environments held only a handful of test rows (prod: 4, one test user;
-- stage: 3), so a clean cutover beats carrying a migration path for rows nobody
-- will miss. Anything a real user had saved is re-savable with one tap.
--
-- Pre-drop checks run against stage before writing this (all empty):
--   * no function in `public` references any of the five tables
--   * no view references them
--   * no foreign key from another table points AT them (they are only ever the
--     child side), so dropping needs no cascade to unrelated objects
-- `cascade` is still used, because each table owns its own indexes/constraints
-- and the outgoing FKs to auth.users / fighters / events / organizations.

drop table if exists public.fighter_favorites    cascade;
drop table if exists public.event_favorites      cascade;
drop table if exists public.event_follows        cascade;
drop table if exists public.organization_follows cascade;
drop table if exists public.push_subscriptions   cascade;
