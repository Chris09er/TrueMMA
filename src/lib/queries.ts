import { supabase } from './supabase';
import type { EventDetail, EventListItem, Fight, FightWithEvent, Fighter, Organization } from './types';

// DACH audience cares about these first; every other league (auto-synced from
// balldontlie) still shows up, just after, alphabetically.
const PINNED_ORG_ORDER = ['UFC', 'OKTAGON'];

// Pinned orgs first, rest alphabetical — shared by getOrganizations() and
// EventListScreen's client-side "which orgs actually have events in the
// current timeframe" derivation, so both sort identically.
export function sortOrganizations(organizations: Organization[]): Organization[] {
  return [...organizations].sort((a, b) => {
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

export async function getOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, short_name, logo_url')
    .order('short_name', { ascending: true });

  if (error) throw error;
  return sortOrganizations((data ?? []) as Organization[]);
}

const EVENT_LIST_COLUMNS =
  'id, organization_id, name, event_date, city, country, venue, venue_state, poster_url, status, main_card_start_time, prelims_start_time, early_prelims_start_time, organizations(short_name)';

const FIGHTER_COLUMNS =
  'id, name, nickname, nationality, photo_url, tapology_url, sherdog_url, record_wins, record_losses, record_draws, record_no_contests, weight_class, height_inches, reach_inches, weight_lbs, stance, date_of_birth, birth_place, active, primary_organization_id';

const FIGHT_COLUMNS = `id, event_id, weight_class, is_main_event, is_title_fight, card_position, card_segment, status, scheduled_rounds, result_winner_id, result_method, result_method_detail, result_round, result_time, fighter1:fighter1_id(${FIGHTER_COLUMNS}), fighter2:fighter2_id(${FIGHTER_COLUMNS})`;

// Single source of truth for "is this event upcoming" — matches the `>=`
// used by the events query below, so a screen deciding whether to show the
// reminder bell never disagrees with which list (upcoming/past) an event
// actually landed in.
export function isEventUpcoming(eventDateIso: string): boolean {
  return new Date(eventDateIso).getTime() >= Date.now();
}

// balldontlie gives us broadcast start times but no end time. A full card
// (early prelims through main event) rarely runs past ~6 hours from its
// earliest segment's start — same generous buffer used by
// scripts/sync-live-event.ts, kept in sync with that file if it ever changes.
const CARD_DURATION_BUFFER_MS = 6 * 60 * 60 * 1000;

export function isEventLive(event: Pick<EventListItem, 'event_date' | 'early_prelims_start_time' | 'prelims_start_time' | 'main_card_start_time'>): boolean {
  const earliestStart = new Date(
    event.early_prelims_start_time ?? event.prelims_start_time ?? event.main_card_start_time ?? event.event_date
  ).getTime();
  const estimatedEnd = earliestStart + CARD_DURATION_BUFFER_MS;
  const now = Date.now();
  return now >= earliestStart && now <= estimatedEnd;
}

// Local (device) start-of-day, matching the boundary getTodayEvents()
// already uses — so "upcoming" always includes all of today (intentional
// overlap with the "today" tab, see EventListScreen) and "past" never
// includes an event from today, even one that already concluded.
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

async function getEvents(
  direction: 'upcoming' | 'past',
  organizationId?: string
): Promise<EventListItem[]> {
  const todayStart = startOfLocalDay(new Date()).toISOString();
  let query = supabase.from('events').select(EVENT_LIST_COLUMNS);

  query =
    direction === 'upcoming'
      ? query.gte('event_date', todayStart).order('event_date', { ascending: true })
      : query.lt('event_date', todayStart).order('event_date', { ascending: false });

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

// Local YYYY-MM-DD, from the device's own calendar fields — deliberately not
// via toISOString(), which converts to UTC and would name the previous day
// for any positive-UTC-offset zone (all of Europe).
function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// "Today" = events whose local calendar date is today, plus anything still
// live from before midnight (see isEventLive) so a card that started late
// last night doesn't disappear from "today" the moment the day rolls over.
export async function getTodayEvents(organizationId?: string): Promise<EventListItem[]> {
  const now = new Date();
  const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const todayKey = localDateKey(now);

  const events = await getEventsInRange(startOfYesterday.toISOString(), startOfTomorrow.toISOString(), organizationId);
  // Compare the event's *local* calendar date, not event_date.slice(0, 10)
  // (which is the UTC date) — both sides must be in the device's zone.
  return events.filter((event) => localDateKey(new Date(event.event_date)) === todayKey || isEventLive(event));
}

export async function getFighters(): Promise<Fighter[]> {
  const { data, error } = await supabase
    .from('fighters')
    .select(FIGHTER_COLUMNS)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as Fighter[];
}

export async function getFighterById(fighterId: string): Promise<Fighter> {
  const { data, error } = await supabase
    .from('fighters')
    .select(FIGHTER_COLUMNS)
    .eq('id', fighterId)
    .single();

  if (error) throw error;
  return data as unknown as Fighter;
}

export async function getEventDetail(eventId: string): Promise<EventDetail> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, organization_id, name, event_date, city, country, venue, venue_state, poster_url, status, main_card_start_time, prelims_start_time, early_prelims_start_time, organizations(short_name)'
    )
    .eq('id', eventId)
    .single();

  if (error) throw error;
  return data as unknown as EventDetail;
}

export async function getFollowedFighters(userId: string): Promise<Fighter[]> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select(`fighters(${FIGHTER_COLUMNS})`)
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

export async function getFollowedOrganizations(userId: string): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organization_follows')
    .select('organizations(id, name, short_name, logo_url)')
    .eq('user_id', userId);

  if (error) throw error;
  return ((data ?? []) as unknown as { organizations: Organization | null }[])
    .map((row) => row.organizations)
    .filter((org): org is Organization => org !== null);
}

// Anonymous (logged-out) equivalents of the getFollowed* queries above:
// fighter and org follows are anchored to the device push_token (user_id is
// optional), so they resolve without an account. Event follows have no
// push_token column and stay local — the profile reads them from the
// scheduled reminders instead (see getReminderEventIds + getEventsByIds).
export async function getFollowedFightersByToken(pushToken: string): Promise<Fighter[]> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select(`fighters(${FIGHTER_COLUMNS})`)
    .eq('push_token', pushToken)
    .not('fighter_id', 'is', null);

  if (error) throw error;
  return ((data ?? []) as unknown as { fighters: Fighter | null }[])
    .map((row) => row.fighters)
    .filter((fighter): fighter is Fighter => fighter !== null);
}

export async function getFollowedOrganizationsByToken(pushToken: string): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organization_follows')
    .select('organizations(id, name, short_name, logo_url)')
    .eq('push_token', pushToken);

  if (error) throw error;
  return ((data ?? []) as unknown as { organizations: Organization | null }[])
    .map((row) => row.organizations)
    .filter((org): org is Organization => org !== null);
}

// Fetch full fighter/event records for a set of ids — used to resolve
// locally-stored anonymous favorites (and local reminder ids) into the
// objects the profile lists render. Returns [] for an empty id list without
// hitting the network.
export async function getFightersByIds(ids: string[]): Promise<Fighter[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('fighters').select(FIGHTER_COLUMNS).in('id', ids);
  if (error) throw error;
  return (data ?? []) as unknown as Fighter[];
}

export async function getEventsByIds(ids: string[]): Promise<EventListItem[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_LIST_COLUMNS)
    .in('id', ids)
    .order('event_date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as EventListItem[];
}

export async function getFighterFights(fighterId: string): Promise<FightWithEvent[]> {
  const { data, error } = await supabase
    .from('fights')
    .select(`${FIGHT_COLUMNS}, event:event_id(id,name,event_date)`)
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
    .select(`fighters(${FIGHTER_COLUMNS})`)
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

// balldontlie's card_position (fight_order) restarts at 1 separately for
// each card_segment (main card / prelims / early prelims) — confirmed
// against live data: e.g. UFC Fight Night: Du Plessis vs. Usman had both
// "Delgado vs Bashi" (prelims) and "Usman vs Du Plessis" (main_card) at
// card_position 1. Sorting by card_position alone therefore interleaves
// fights from different segments; card_segment must be the primary sort
// key, with card_position only breaking ties within a segment. Cancelled
// fights (status === 'cancelled') sort last regardless of segment.
// Manually-entered fights (e.g. OKTAGON) have no card_segment/position at
// all and fall back to the end, in whatever order they were inserted.
const CARD_SEGMENT_ORDER: Record<string, number> = { main_card: 0, prelims: 1, early_prelims: 2 };

function sortFightCard(fights: Fight[]): Fight[] {
  return [...fights].sort((a, b) => {
    const aCancelled = a.status === 'cancelled' ? 1 : 0;
    const bCancelled = b.status === 'cancelled' ? 1 : 0;
    if (aCancelled !== bCancelled) return aCancelled - bCancelled;

    const aSegment = a.card_segment ? CARD_SEGMENT_ORDER[a.card_segment] ?? 99 : 99;
    const bSegment = b.card_segment ? CARD_SEGMENT_ORDER[b.card_segment] ?? 99 : 99;
    if (aSegment !== bSegment) return aSegment - bSegment;

    const aPos = a.card_position ?? Infinity;
    const bPos = b.card_position ?? Infinity;
    if (aPos !== bPos) return aPos - bPos;

    return a.id.localeCompare(b.id);
  });
}

// weight_class is free text from balldontlie, not a fixed enum — this is a
// best-effort real-world (light-to-heavy) ordering for known division names.
// Anything unrecognized (a typo, a future division, "Catchweight") sorts
// alphabetically after all recognized ones rather than erroring.
const WEIGHT_CLASS_ORDER = [
  'strawweight',
  'flyweight',
  'bantamweight',
  'featherweight',
  'lightweight',
  'welterweight',
  'middleweight',
  'light heavyweight',
  'heavyweight',
];

// Exported so the fighter list can sort by division (light-to-heavy). Accepts
// null (a fighter with no weight_class) and unrecognized values, both of which
// rank last so they sort to the bottom.
export function weightClassRank(weightClass: string | null): number {
  if (!weightClass) return WEIGHT_CLASS_ORDER.length;
  const normalized = weightClass.toLowerCase();
  const rank = WEIGHT_CLASS_ORDER.findIndex((known) => normalized.includes(known));
  return rank === -1 ? WEIGHT_CLASS_ORDER.length : rank;
}

// Short division codes for dense contexts (fighter cards, fight cards). Keyed
// by the same substring match as weightClassRank/WEIGHT_CLASS_ORDER, so it
// tolerates balldontlie's free-text weight_class. Women's divisions get a "W"
// prefix (matching how the fighter filter already splits them, see
// FighterListScreen). Order matters: "light heavyweight" must be checked before
// "heavyweight" since the latter is a substring of the former.
const WEIGHT_CLASS_ABBREV: [string, string][] = [
  ['strawweight', 'SW'],
  ['flyweight', 'FLW'],
  ['bantamweight', 'BW'],
  ['featherweight', 'FW'],
  ['lightweight', 'LW'],
  ['welterweight', 'WW'],
  ['middleweight', 'MW'],
  ['light heavyweight', 'LHW'],
  ['heavyweight', 'HW'],
  ['catchweight', 'CW'],
  ['openweight', 'OW'],
];

export function abbreviateWeightClass(weightClass: string | null): string | null {
  if (!weightClass) return null;
  const normalized = weightClass.toLowerCase();
  const isWomen = normalized.includes('women');
  for (const [term, abbr] of WEIGHT_CLASS_ABBREV) {
    if (normalized.includes(term)) return isWomen ? `W${abbr}` : abbr;
  }
  return weightClass; // unrecognized (e.g. a typo or a future division) — show as-is
}

export function sortWeightClasses(weightClasses: string[]): string[] {
  return [...weightClasses].sort((a, b) => {
    const rankDiff = weightClassRank(a) - weightClassRank(b);
    return rankDiff !== 0 ? rankDiff : a.localeCompare(b);
  });
}

export async function getFightsForEvent(eventId: string): Promise<Fight[]> {
  const { data, error } = await supabase.from('fights').select(FIGHT_COLUMNS).eq('event_id', eventId);

  if (error) throw error;
  return sortFightCard((data ?? []) as unknown as Fight[]);
}
