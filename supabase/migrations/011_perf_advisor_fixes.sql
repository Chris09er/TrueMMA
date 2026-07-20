-- Fixes the two actionable findings from the Supabase performance advisor
-- (checked via the new Supabase MCP server, 2026-07-20 — identical on stage
-- and production, unlike the security finding fixed in 010). Both are
-- mechanical, zero-behavior-change optimizations:
--
-- 1. auth_rls_initplan: every RLS policy below calls `auth.uid()` directly,
--    which Postgres re-evaluates once per row instead of once per statement.
--    Wrapping it as `(select auth.uid())` gives the planner an
--    already-evaluated scalar to compare against instead — same logical
--    condition, cheaper at scale. See
--    https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- 2. unindexed_foreign_keys: FK columns with no covering index, which makes
--    joins/deletes against the referenced table slower as these tables grow.
--
-- Not addressed here: `unused_index` on
-- `idx_events_league_start_push_pending` — flagged on stage only, because
-- stage has too little traffic to have ever used it; production's real
-- `league_start_push_health()` traffic does use it, so removing it would
-- hurt production for a stage-only, not-actually-a-problem signal.

-- 1. auth_rls_initplan
alter policy "manage own event favorites" on public.event_favorites
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "manage own event follows" on public.event_follows
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "manage own fighter favorites" on public.fighter_favorites
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "organization_follows delete" on public.organization_follows
  using ((user_id is null) or (user_id = (select auth.uid())));

alter policy "organization_follows insert" on public.organization_follows
  with check ((user_id is null) or (user_id = (select auth.uid())));

alter policy "organization_follows select" on public.organization_follows
  using ((user_id is null) or (user_id = (select auth.uid())));

alter policy "insert own profile" on public.profiles
  with check ((select auth.uid()) = id);

alter policy "select own profile" on public.profiles
  using ((select auth.uid()) = id);

alter policy "update own profile" on public.profiles
  using ((select auth.uid()) = id);

alter policy "push_subscriptions delete" on public.push_subscriptions
  using ((user_id is null) or (user_id = (select auth.uid())));

alter policy "push_subscriptions insert" on public.push_subscriptions
  with check ((user_id is null) or (user_id = (select auth.uid())));

alter policy "push_subscriptions select" on public.push_subscriptions
  using ((user_id is null) or (user_id = (select auth.uid())));

-- 2. unindexed_foreign_keys
create index if not exists idx_event_favorites_event_id on public.event_favorites (event_id);
create index if not exists idx_event_follows_event_id on public.event_follows (event_id);
create index if not exists idx_fight_votes_picked_fighter_id on public.fight_votes (picked_fighter_id);
create index if not exists idx_fighter_favorites_fighter_id on public.fighter_favorites (fighter_id);
create index if not exists idx_fighters_primary_organization_id on public.fighters (primary_organization_id);
create index if not exists idx_fights_fighter1_id on public.fights (fighter1_id);
create index if not exists idx_fights_fighter2_id on public.fights (fighter2_id);
create index if not exists idx_fights_result_winner_id on public.fights (result_winner_id);
create index if not exists idx_organization_follows_organization_id on public.organization_follows (organization_id);
create index if not exists idx_organization_follows_user_id on public.organization_follows (user_id);
create index if not exists idx_push_subscriptions_fighter_id on public.push_subscriptions (fighter_id);
create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions (user_id);
