-- Fighters have no organization link today (only events.organization_id).
-- Adds a best-effort "primary organization" for filtering the fighter list
-- by org — populated by the sync scripts on every upsert (most-recently
-- synced org wins; a fighter who has switched organizations will show
-- their latest one, not a full history — acceptable simplification, see
-- docs/ARCHITECTURE.md). Manually-entered OKTAGON fighters need a one-off
-- manual UPDATE after this ships, since they aren't touched by the sync.
alter table fighters
  add column if not exists primary_organization_id uuid references organizations(id);
