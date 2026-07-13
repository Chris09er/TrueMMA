import { supabase } from './supabase';
import type { EventDetail, EventListItem, Fight, Organization } from './types';

export async function getOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, short_name, logo_url')
    .order('short_name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Organization[];
}

export async function getUpcomingEvents(organizationId?: string): Promise<EventListItem[]> {
  let query = supabase
    .from('events')
    .select(
      'id, organization_id, name, event_date, city, country, venue, poster_url, organizations(short_name)'
    )
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true });

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as EventListItem[];
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

export async function getFightsForEvent(eventId: string): Promise<Fight[]> {
  const { data, error } = await supabase
    .from('fights')
    .select(
      'id, event_id, weight_class, is_main_event, is_title_fight, card_position, fighter1:fighter1_id(id,name,nickname,nationality,photo_url,tapology_url,sherdog_url), fighter2:fighter2_id(id,name,nickname,nationality,photo_url,tapology_url,sherdog_url)'
    )
    .eq('event_id', eventId)
    .order('card_position', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as Fight[];
}
