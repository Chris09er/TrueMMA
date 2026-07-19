-- Fixes a regression introduced by 003_security_hardening.sql.
-- `revoke execute ... from public` revoked EXECUTE from every role,
-- including Supabase's internal roles that actually fire these triggers
-- (supabase_auth_admin inserts into auth.users on signup, service_role /
-- postgres inserts into fights during the balldontlie sync) — breaking
-- signup ("Das hat nicht geklappt") and likely the fight-insert push
-- trigger too. The linter's actual concern was anon/authenticated being
-- able to call these as public RPC endpoints — re-grant EXECUTE broadly
-- to internal roles, keep it revoked only for anon/authenticated.

grant execute on function public.handle_new_user() to postgres, service_role, supabase_auth_admin;
grant execute on function public.notify_fighter_added_to_fight() to postgres, service_role, supabase_auth_admin;

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.notify_fighter_added_to_fight() from anon, authenticated;
