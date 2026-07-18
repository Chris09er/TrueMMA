import { supabase } from './supabase';

export type EventFollowResult = 'ok' | 'error';

// event_follows only exists for logged-in users — event reminders stay
// fully local (AsyncStorage) regardless of login, this table is purely so
// a followed event shows up in the profile across devices.
export async function isEventFollowed(userId: string, eventId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('event_follows')
    .select('id')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) return false;
  return data !== null;
}

export async function followEvent(userId: string, eventId: string): Promise<EventFollowResult> {
  const { error } = await supabase.from('event_follows').insert({ user_id: userId, event_id: eventId });
  return error ? 'error' : 'ok';
}

export async function unfollowEvent(userId: string, eventId: string): Promise<EventFollowResult> {
  const { error } = await supabase
    .from('event_follows')
    .delete()
    .eq('user_id', userId)
    .eq('event_id', eventId);

  return error ? 'error' : 'ok';
}
