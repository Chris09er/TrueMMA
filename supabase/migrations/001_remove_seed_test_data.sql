-- Removes placeholder/seed data created before the balldontlie sync existed
-- ("UFC 999: Ferreira vs. Volkov", "OKTAGON 66: Novak vs. Sato" — fake
-- fighter names, external_id is null, confirmed via manual inspection).
-- Matched by name pattern rather than fixed UUIDs so this is safe to run
-- on any environment regardless of row-id drift between stage and main.

delete from fights
where event_id in (
  select id from events
  where external_id is null
    and name in ('UFC 999: Ferreira vs. Volkov', 'OKTAGON 66: Novak vs. Sato')
);

delete from events
where external_id is null
  and name in ('UFC 999: Ferreira vs. Volkov', 'OKTAGON 66: Novak vs. Sato');

-- Clean up the now-orphaned fake fighters (no remaining fights reference them).
delete from fighters
where external_id is null
  and id not in (select fighter1_id from fights)
  and id not in (select fighter2_id from fights)
  and name in ('Alex Ferreira', 'Dmitri Volkov', 'Kenji Sato', 'Liam O''Connor', 'Tomas Wagner', 'Marko Novak');
