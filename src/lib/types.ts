export type Organization = {
  id: string;
  name: string;
  short_name: string;
  logo_url: string | null;
};

export type Fighter = {
  id: string;
  name: string;
  nickname: string | null;
  nationality: string | null;
  photo_url: string | null;
  tapology_url: string | null;
  sherdog_url: string | null;
  record_wins: number | null;
  record_losses: number | null;
  record_draws: number | null;
  record_no_contests: number | null;
  weight_class: string | null;
  height_inches: number | null;
  reach_inches: number | null;
  weight_lbs: number | null;
  stance: string | null;
  date_of_birth: string | null;
  birth_place: string | null;
  active: boolean | null;
};

export type EventListItem = {
  id: string;
  organization_id: string;
  name: string;
  event_date: string;
  city: string | null;
  country: string | null;
  venue: string | null;
  venue_state: string | null;
  poster_url: string | null;
  status: string | null;
  main_card_start_time: string | null;
  prelims_start_time: string | null;
  early_prelims_start_time: string | null;
  organizations: Pick<Organization, 'short_name'> | null;
};

// balldontlie numbers card_position separately per segment (main card,
// prelims, early prelims each restart at 1) — card_segment is what makes
// the numbers unambiguous. See queries.ts's fight sort comparator.
export type CardSegment = 'main_card' | 'prelims' | 'early_prelims';

export type Fight = {
  id: string;
  event_id: string;
  weight_class: string | null;
  is_main_event: boolean;
  is_title_fight: boolean;
  card_position: number | null;
  card_segment: CardSegment | null;
  status: string | null;
  scheduled_rounds: number | null;
  fighter1: Fighter | null;
  fighter2: Fighter | null;
  result_winner_id: string | null;
  result_method: string | null;
  result_method_detail: string | null;
  result_round: number | null;
  result_time: string | null;
};

export type EventDetail = Omit<EventListItem, 'organization_id'>;

export type FightWithEvent = Fight & {
  event: { id: string; name: string; event_date: string } | null;
};
