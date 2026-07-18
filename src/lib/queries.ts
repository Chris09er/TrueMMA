import { supabase } from './supabase';
import type { EventDetail, EventListItem, Fight, FightWithEvent, Fighter, Organization } from './types';

// DACH audience cares about these first; every other league (auto-synced from
// balldontlie) still shows up, just after, alphabetically.
const PINNED_ORG_ORDER = ['UFC', 'OKTAGON'];

export async function getOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, short_name, logo_url')
    .order('short_name', { ascending: true });

  if (error) throw error;
  const organizations = (data ?? []) as Organization[];

  return organizations.sort((a, b) => {
    const aPin = PINNED_ORG_ORDER.indexOf(a.short_name);
    const bPin = PINNED_ORG_ORDER.indexOf(b.short_name);
    if (aPin !== -1 || bPin !== -1) {
      if (aPin === -1) return 1;
      if (bPin === -1) return -1;
      return aPin - bPin;
    }
    return a.short_name.localeCompare(b.short_name);
  });
}

const EVENT_LIST_COLUMNS =
  'id, organization_id, name, event_date, city, country, venue, poster_url, organizations(short_name)';

// Single source of truth for "is this event upcoming" — matches the `>=`
// used by the events query below, so a screen deciding whether to show the
// reminder bell never disagrees with which list (upcoming/past) an event
// actually landed in.
export function isEventUpcoming(eventDateIso: string): boolean {
  return new Date(eventDateIso).getTime() >= Date.now();
}

async function getEvents(
  direction: 'upcoming' | 'past',
  organizationId?: string
): Promise<EventListItem[]> {
  const now = new Date().toISOString();
  let query = supabase.from('events').select(EVENT_LIST_COLUMNS);

  query =
    direction === 'upcoming'
      ? query.gte('event_date', now).order('event_date', { ascending: true })
      : query.lt('event_date', now).order('event_date', { ascending: false });

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as EventListItem[];
}

export function getUpcomingEvents(organizationId?: string): Promise<EventListItem[]> {
  return getEvents('upcoming', organizationId);
}

export function getPastEvents(organizationId?: string): Promise<EventListItem[]> {
  return getEvents('past', organizationId);
}

// For the calendar view — independent of the upcoming/past split, covers
// whatever month range is currently on screen.
export async function getEventsInRange(
  startIso: string,
  endIso: string,
  organizationId?: string
): Promise<EventListItem[]> {
  let query = supabase
    .from('events')
    .select(EVENT_LIST_COLUMNS)
    .gte('event_date', startIso)
    .lt('event_date', endIso)
    .order('event_date', { ascending: true });

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as EventListItem[];
}

export async function getFighters(): Promise<Fighter[]> {
  const { data, error } = await supabase
    .from('fighters')
    .select('id, name, nickname, nationality, photo_url, tapology_url, sherdog_url')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Fighter[];
}

export async function getFighterById(fighterId: string): Promise<Fighter> {
  const { data, error } = await supabase
    .from('fighters')
    .select('id, name, nickname, nationality, photo_url, tapology_url, sherdog_url')
    .eq('id', fighterId)
    .single();

  if (error) throw error;
  return data as Fighter;
}

export async function getEventDetail(eventId: string): Promise<EventDetail> {
  const { data, error } = await supabase
    .from('events')
    .select('id, name, event_date, city, country, venue, poster_url, organizations(short_name)')
    .eq('id', eventId)
    .single();

  if (error) throw error;
  return data as unknown as EventDetail;
}

export async function getFollowedFighters(userId: string): Promise<Fighter[]> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('fighters(id, name, nickname, nationality, photo_url, tapology_url, sherdog_url)')
    .eq('user_id', userId)
    .not('fighter_id', 'is', null);

  if (error) throw error;
  return ((data ?? []) as unknown as { fighters: Fighter | null }[])
    .map((row) => row.fighters)
    .filter((fighter): fighter is Fighter => fighter !== null);
}

export async function getFollowedEvents(userId: string): Promise<EventListItem[]> {
  const { data, error } = await supabase
    .from('event_follows')
    .select(`events(${EVENT_LIST_COLUMNS})`)
    .eq('user_id', userId);

  if (error) throw error;
  return ((data ?? []) as unknown as { events: EventListItem | null }[])
    .map((row) => row.events)
    .filter((event): event is EventListItem => event !== null);
}

export async function getFighterFights(fighterId: string): Promise<FightWithEvent[]> {
  const { data, error } = await supabase
    .from('fights')
    .select(
      'id, event_id, weight_class, is_main_event, is_title_fight, card_position, result_winner_id, result_method, result_round, result_time, fighter1:fighter1_id(id,name,nickname,nationality,photo_url,tapology_url,sherdog_url), fighter2:fighter2_id(id,name,nickname,nationality,photo_url,tapology_url,sherdog_url), event:event_id(id,name,event_date)'
    )
    .or(`fighter1_id.eq.${fighterId},fighter2_id.eq.${fighterId}`);

  if (error) throw error;
  const fights = (data ?? []) as unknown as FightWithEvent[];
  return fights.sort((a, b) => {
    if (!a.event) return 1;
    if (!b.event) return -1;
    return new Date(b.event.event_date).getTime() - new Date(a.event.event_date).getTime();
  });
}

export async function getFavoritedFighters(userId: string): Promise<Fighter[]> {
  const { data, error } = await supabase
    .from('fighter_favorites')
    .select('fighters(id, name, nickname, nationality, photo_url, tapology_url, sherdog_url)')
    .eq('user_id', userId);

  if (error) throw error;
  return ((data ?? []) as unknown as { fighters: Fighter | null }[])
    .map((row) => row.fighters)
    .filter((fighter): fighter is Fighter => fighter !== null);
}

export async function getFavoritedEvents(userId: string): Promise<EventListItem[]> {
  const { data, error } = await supabase
    .from('event_favorites')
    .select(`events(${EVENT_LIST_COLUMNS})`)
    .eq('user_id', userId);

  if (error) throw error;
  return ((data ?? []) as unknown as { events: EventListItem | null }[])
    .map((row) => row.events)
    .filter((event): event is EventListItem => event !== null);
}

export async function getFightsForEvent(eventId: string): Promise<Fight[]> {
  const { data, error } = await supabase
    .from('fights')
    .select(
      'id, event_id, weight_class, is_main_event, is_title_fight, card_position, result_winner_id, result_method, result_round, result_time, fighter1:fighter1_id(id,name,nickname,nationality,photo_url,tapology_url,sherdog_url), fighter2:fighter2_id(id,name,nickname,nationality,photo_url,tapology_url,sherdog_url)'
    )
    .eq('event_id', eventId)
    // Chronological fight-night order (opener first, main event last) —
    // confirmed with the maintainer after testing both directions.
    // balldontlie's fight_order (mapped to card_position) numbers the
    // main event lowest (1) and increases toward the undercard, so this
    // needs descending order to end with the main event.
    // nullsFirst: false keeps manually-entered fights without a
    // card_position (e.g. OKTAGON) at the end instead of jumping first.
    .order('card_position', { ascending: false, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as unknown as Fight[];
}
