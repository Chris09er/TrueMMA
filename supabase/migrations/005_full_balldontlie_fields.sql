-- Syncs the full set of fields balldontlie provides that we were
-- previously discarding, across fighters/events/fights. Storage is cheap
-- and pulling these costs nothing extra (already part of the same API
-- response) — better to have them available than to re-touch schema +
-- sync script every time a new UI idea needs one.

-- fights: card_segment/status needed to correctly order a fight card
-- (balldontlie's card_position/fight_order resets to 1 separately per
-- segment — main card, prelims, early prelims — so card_segment must be
-- the primary sort key, see queries.ts's sortFightCard). scheduled_rounds
-- and result_method_detail are additional display data.
alter table fights
  add column if not exists card_segment text,
  add column if not exists status text,
  add column if not exists scheduled_rounds integer,
  add column if not exists result_method_detail text;

-- events: venue_state for a fuller location string, status to flag a
-- cancelled/postponed event (distinct from a cancelled individual fight),
-- and per-segment broadcast start times.
alter table events
  add column if not exists venue_state text,
  add column if not exists status text,
  add column if not exists main_card_start_time timestamptz,
  add column if not exists prelims_start_time timestamptz,
  add column if not exists early_prelims_start_time timestamptz;

-- fighters: record + "tale of the tape" fields balldontlie provides per
-- fighter but the sync script previously ignored entirely.
alter table fighters
  add column if not exists record_wins integer,
  add column if not exists record_losses integer,
  add column if not exists record_draws integer,
  add column if not exists record_no_contests integer,
  add column if not exists weight_class text,
  add column if not exists height_inches integer,
  add column if not exists reach_inches integer,
  add column if not exists weight_lbs integer,
  add column if not exists stance text,
  add column if not exists date_of_birth date,
  add column if not exists birth_place text,
  add column if not exists active boolean;
