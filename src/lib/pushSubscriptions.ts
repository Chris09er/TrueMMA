import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { hasNotificationPermission, requestNotificationPermission } from './notifications';

export type FollowResult = 'ok' | 'permission_denied' | 'error';

let cachedPushToken: string | null = null;
let pendingTokenPromise: Promise<string | null> | null = null;

// `interactive: false` never prompts the OS permission dialog — only reads
// current status. `interactive: true` (only used when the user actively
// taps "follow") may prompt. Concurrent callers share one in-flight promise
// instead of each firing their own permission check / token request.
async function resolvePushToken(interactive: boolean): Promise<string | null> {
  if (pendingTokenPromise) return pendingTokenPromise;

  pendingTokenPromise = (async () => {
    const granted = interactive ? await requestNotificationPermission() : await hasNotificationPermission();

    if (!granted) {
      cachedPushToken = null;
      return null;
    }

    if (cachedPushToken) return cachedPushToken;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    cachedPushToken = data;
    return data;
  })();

  try {
    return await pendingTokenPromise;
  } finally {
    pendingTokenPromise = null;
  }
}

export async function isFollowingFighter(fighterId: string): Promise<boolean> {
  const token = await resolvePushToken(false);
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

export async function followFighter(fighterId: string): Promise<FollowResult> {
  const token = await resolvePushToken(true);
  if (!token) return 'permission_denied';

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('push_subscriptions')
    .insert({ push_token: token, fighter_id: fighterId, user_id: user?.id ?? null });

  return error ? 'error' : 'ok';
}

export async function unfollowFighter(fighterId: string): Promise<FollowResult> {
  const token = await resolvePushToken(false);
  if (!token) return 'permission_denied';

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('push_token', token)
    .eq('fighter_id', fighterId);

  return error ? 'error' : 'ok';
}

// Called once on sign-in: attaches any follows made anonymously on this
// device (before login, or while logged out) to the now-known account, so
// they show up in the profile instead of staying orphaned to the device
// token only.
export async function claimAnonymousFollows(userId: string): Promise<void> {
  const token = await resolvePushToken(false);
  if (!token) return;

  await supabase
    .from('push_subscriptions')
    .update({ user_id: userId })
    .eq('push_token', token)
    .is('user_id', null);
}
