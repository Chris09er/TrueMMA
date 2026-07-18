-- Fixes for Supabase database linter warnings.
-- Run manually in the Supabase SQL Editor (see docs/ARCHITECTURE.md).

-- 1. push_subscriptions: drop the original fully-open anon policies.
-- These predate the login feature and were never dropped after
-- 001_profiles_and_login.sql added the scoped replacements — since RLS
-- policies are OR'd together, they were silently letting anyone
-- read/write/delete ANY row regardless of user_id. Confirmed via the
-- Supabase linter (rls_policy_always_true), which reported their real
-- names: "public can subscribe" (INSERT) and "public can unsubscribe"
-- (DELETE). A third, "public can view own subscriptions" (SELECT), isn't
-- flagged by that linter check (SELECT `using (true)` is intentionally
-- excluded) but is dropped here too for consistency — the scoped
-- "push_subscriptions select" policy from 001 already covers the
-- legitimate anonymous-read case (`user_id is null`). Names confirmed
-- against the live database via pg_policies on 2026-07-16.
drop policy if exists "public can subscribe" on push_subscriptions;
drop policy if exists "public can unsubscribe" on push_subscriptions;
drop policy if exists "public can view own subscriptions" on push_subscriptions;

-- 2. Lock down SECURITY DEFINER trigger functions so they aren't also
-- exposed as public RPC endpoints (/rest/v1/rpc/<function>). Neither is
-- meaningfully exploitable via direct RPC call today (both reference NEW,
-- which only exists in a trigger context, so a direct call errors out),
-- but there's no reason to leave the attack surface open. Revoking EXECUTE
-- does not affect trigger firing — trigger invocation isn't subject to the
-- same grant checks as an RPC call.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.notify_fighter_added_to_fight() from public;

-- Note on extension_in_public (pg_net): NOT included here. Moving pg_net
-- out of the public schema could break notify_fighter_added_to_fight() if
-- its body references pg_net's objects by an implicit/public-schema path
-- — needs the function body checked before attempting, otherwise this
-- could silently break fighter-follow push delivery. Left as a documented
-- open item (see docs/ARCHITECTURE.md).
