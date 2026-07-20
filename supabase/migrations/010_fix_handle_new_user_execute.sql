-- Re-applies a fix that only ever existed as hand-run SQL against production
-- (supabase/migrations_archive/003_security_hardening.sql +
-- 004_fix_execute_revoke_regression.sql, from before this project had a CLI
-- migration runner) and was never captured as a replayable migration. When
-- the stage project was bootstrapped 2026-07-19 from a `db dump --linked`
-- baseline snapshot of production, that snapshot didn't carry over the
-- GRANT/REVOKE state — so stage silently reverted to Postgres' default
-- EXECUTE-to-PUBLIC behavior on this function, letting anon/authenticated
-- call it as a public RPC endpoint (confirmed via the Supabase linter and a
-- direct pg_proc.proacl check: stage had anon/authenticated grants,
-- production didn't). This is a no-op on production, where the grant is
-- already correctly narrowed — see docs/ARCHITECTURE.md's "Known open
-- items" for the general "two independent EXECUTE grants" footgun this
-- follows.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to postgres, service_role, supabase_auth_admin;
