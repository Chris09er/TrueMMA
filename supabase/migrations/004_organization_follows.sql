-- League/organization follow, structurally identical to push_subscriptions
-- (anonymous-capable, optionally linked to an account on login). Push
-- delivery fires when a followed organization's event actually starts, not
-- when it's created — see scripts/sync-live-event.ts, which already polls
-- every 5 minutes for "is this event live right now". league_start_push_sent_at
-- lets that poller send the push exactly once per event.
create table if not exists organization_follows (
  id uuid primary key default gen_random_uuid(),
  push_token text not null,
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (push_token, organization_id)
);

alter table organization_follows enable row level security;

create policy "organization_follows delete" on organization_follows for delete using ((user_id is null) or (user_id = auth.uid()));
create policy "organization_follows insert" on organization_follows for insert with check ((user_id is null) or (user_id = auth.uid()));
create policy "organization_follows select" on organization_follows for select using ((user_id is null) or (user_id = auth.uid()));

alter table events add column if not exists league_start_push_sent_at timestamptz;
