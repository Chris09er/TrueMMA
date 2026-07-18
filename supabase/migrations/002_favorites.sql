-- Favorites (heart icon) feature: fighter_favorites, event_favorites.
-- Login-only, no anonymous rows — anonymous favoriting stays fully local
-- (AsyncStorage, see src/lib/favorites.ts), unlike push_subscriptions
-- which has an anonymous path anchored to a push token. Run manually in
-- the Supabase SQL Editor (see docs/ARCHITECTURE.md).

create table if not exists fighter_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fighter_id uuid not null references fighters(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, fighter_id)
);

alter table fighter_favorites enable row level security;

create policy "manage own fighter favorites" on fighter_favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists event_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

alter table event_favorites enable row level security;

create policy "manage own event favorites" on event_favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
