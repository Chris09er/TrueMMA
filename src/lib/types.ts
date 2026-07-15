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
};

export type EventListItem = {
  id: string;
  organization_id: string;
  name: string;
  event_date: string;
  city: string | null;
  country: string | null;
  venue: string | null;
  poster_url: string | null;
  organizations: Pick<Organization, 'short_name'> | null;
};

export type Fight = {
  id: string;
  event_id: string;
  weight_class: string | null;
  is_main_event: boolean;
  is_title_fight: boolean;
  card_position: number | null;
  fighter1: Fighter | null;
  fighter2: Fighter | null;
  result_winner_id: string | null;
  result_method: string | null;
  result_round: number | null;
  result_time: string | null;
};

export type EventDetail = Omit<EventListItem, 'organization_id'>;
