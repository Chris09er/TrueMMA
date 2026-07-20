-- Pre-launch waitlist signups for the marketing landing page (docs/MARKETING.md §6 Phase A).
-- Anonymous insert-only, mirroring fight_votes' trust model — no login concept, and no select
-- policy at all (unlike fight_votes/push_subscriptions, nothing here ever needs to be read back
-- via the anon key from the client, so RLS simply has no SELECT/UPDATE/DELETE policy to grant it).
-- utm_* columns capture attribution per the launch-plan tagging requirement (§6) — populated
-- client-side from the landing page's own query string, not validated server-side since they're
-- informational only.
create table if not exists waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now(),
  unique (email)
);

alter table waitlist_signups enable row level security;

create policy "waitlist_signups insert" on waitlist_signups for insert with check (true);
