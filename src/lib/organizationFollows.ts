import { supabase } from './supabase';
import { hasNotificationPermission, requestNotificationPermission } from './notifications';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

export type FollowResult = 'ok' | 'permission_denied' | 'error';

// Same push-token resolution shape as pushSubscriptions.ts, but kept
// separate rather than shared — the two features (fighter follow, league
// follow) are independent and this avoids coupling their caching/module
// state together for no benefit.
let cachedPushToken: string | null = null;
let pendingTokenPromise: Promise<string | null> | null = null;

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

export async function isFollowingOrganization(organizationId: string): Promise<boolean> {
  const token = await resolvePushToken(false);
  if (!token) return false;

  const { data, error } = await supabase
    .from('organization_follows')
    .select('id')
    .eq('push_token', token)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) return false;
  return data !== null;
}

export async function followOrganization(organizationId: string): Promise<FollowResult> {
  const token = await resolvePushToken(true);
  if (!token) return 'permission_denied';

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('organization_follows')
    .insert({ push_token: token, organization_id: organizationId, user_id: user?.id ?? null });

  return error ? 'error' : 'ok';
}

export async function unfollowOrganization(organizationId: string): Promise<FollowResult> {
  const token = await resolvePushToken(false);
  if (!token) return 'permission_denied';

  const { error } = await supabase
    .from('organization_follows')
    .delete()
    .eq('push_token', token)
    .eq('organization_id', organizationId);

  return error ? 'error' : 'ok';
}

export async function claimAnonymousOrganizationFollows(userId: string): Promise<void> {
  const token = await resolvePushToken(false);
  if (!token) return;

  await supabase
    .from('organization_follows')
    .update({ user_id: userId })
    .eq('push_token', token)
    .is('user_id', null);
}
