import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { requestNotificationPermission } from './notifications';

let cachedPushToken: string | null = null;

async function getPushToken(): Promise<string | null> {
  if (cachedPushToken) return cachedPushToken;

  const granted = await requestNotificationPermission();
  if (!granted) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  cachedPushToken = data;
  return data;
}

export async function isFollowingFighter(fighterId: string): Promise<boolean> {
  const token = await getPushToken();
  if (!token) return false;

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('push_token', token)
    .eq('fighter_id', fighterId)
    .maybeSingle();

  if (error) return false;
  return data !== null;
}

export async function followFighter(fighterId: string): Promise<boolean> {
  const token = await getPushToken();
  if (!token) return false;

  const { error } = await supabase
    .from('push_subscriptions')
    .insert({ push_token: token, fighter_id: fighterId });

  return !error;
}

export async function unfollowFighter(fighterId: string): Promise<boolean> {
  const token = await getPushToken();
  if (!token) return false;

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('push_token', token)
    .eq('fighter_id', fighterId);

  return !error;
}
