-- Optional manual timezone override, logged-in users only. Device-local
-- time is already the default everywhere (Intl calls with no explicit
-- timeZone already resolve to the device's zone) — this is purely additive.
alter table profiles add column if not exists timezone_override text;
