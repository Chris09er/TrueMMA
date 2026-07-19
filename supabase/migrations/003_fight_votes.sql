-- Anonymous community voting on upcoming fights ("who wins?"). One vote per
-- device, keyed on a locally-generated device id (see src/lib/voting.ts) —
-- not the push token, since voting must not require the OS notification
-- permission prompt. Same anonymous-write trust model already accepted for
-- push_subscriptions (client self-reports its own identifier; low-sensitivity
-- data, no server-verifiable anti-abuse beyond the per-device uniqueness
-- constraint).
create table if not exists fight_votes (
  id uuid primary key default gen_random_uuid(),
  fight_id uuid not null references fights(id) on delete cascade,
  device_id text not null,
  picked_fighter_id uuid not null references fighters(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (fight_id, device_id)
);

alter table fight_votes enable row level security;

create policy "fight_votes insert" on fight_votes for insert with check (true);
create policy "fight_votes select" on fight_votes for select using (true);
create policy "fight_votes update" on fight_votes for update using (true) with check (true);
