import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { getDeviceId } from './deviceId';

// Unified "saves" client — the single source of truth for the ❤️ (save +
// notify) concept, consolidating the five legacy libs (favorites,
// pushSubscriptions, organizationFollows, eventFollows, notifications).
//
// Identity model (mirrors the saved_* tables, see 013_saved_objects_schema.sql):
//   * device_id  — always present (shared with fight_votes via ./deviceId), the
//                  row anchor; saving never requires a permission prompt.
//   * push_token — stamped onto ALL of this device's rows once the OS
//                  notification permission is granted (attach_push_token). Only
//                  rows with a token + the matching notify_* flag get push.
//   * user_id    — attached on login (claim_saves_for_user), derived
//                  server-side from auth.uid(); never passed from the client.
// All access goes through the SECURITY DEFINER RPCs; the base tables are
// RLS-locked, so a client can never read another device's push_token.

// Registered once at module load (was the side-effect of notifications.ts).
// saves.ts is pulled in at app start via auth.tsx (AuthProvider wraps the whole
// tree in App.tsx and imports claimSavesForUser from here), so this always runs.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type SaveKind = 'fighter' | 'event' | 'organization';
export type SaveResult = 'ok' | 'error';

type KindConfig = {
  save: string;
  unsave: string;
  list: string;
  idParam: string;
  idField: 'fighter_id' | 'event_id' | 'organization_id';
};

const CONFIG: Record<SaveKind, KindConfig> = {
  fighter: {
    save: 'save_fighter',
    unsave: 'unsave_fighter',
    list: 'list_saved_fighters',
    idParam: 'p_fighter_id',
    idField: 'fighter_id',
  },
  event: {
    save: 'save_event',
    unsave: 'unsave_event',
    list: 'list_saved_events',
    idParam: 'p_event_id',
    idField: 'event_id',
  },
  organization: {
    save: 'save_organization',
    unsave: 'unsave_organization',
    list: 'list_saved_organizations',
    idParam: 'p_organization_id',
    idField: 'organization_id',
  },
};

// ---------------------------------------------------------------------------
// Notification permission primitives (moved verbatim from notifications.ts).
// ---------------------------------------------------------------------------

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// Reads the current permission status without ever prompting — use anywhere
// permission is only being read, not acted on, so the OS's one-shot dialog is
// never triggered as a side effect of rendering.
export async function hasNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

// ---------------------------------------------------------------------------
// Push token resolution (deduplicated — the three legacy libs each had a copy).
// `interactive: false` never prompts, only reads current status.
// ---------------------------------------------------------------------------

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

// Resolves this device's push token (optionally prompting) and, if there is
// one, stamps it onto every saved_* row of this device so they become
// push-eligible. Also (re)stamps on token rotation. No-op when permission is
// denied — the saves still stand, push just doesn't fire.
async function ensurePushTokenAttached(interactive: boolean): Promise<string | null> {
  const token = await resolvePushToken(interactive);
  if (!token) return null;
  const deviceId = await getDeviceId();
  await supabase.rpc('attach_push_token', { p_device_id: deviceId, p_push_token: token });
  return token;
}

// ---------------------------------------------------------------------------
// Save / unsave. A save is device-anchored and always succeeds without a
// permission prompt; attaching the push token (which may prompt) happens after,
// so a denied permission never blocks the save itself.
// ---------------------------------------------------------------------------

export async function save(kind: SaveKind, id: string): Promise<SaveResult> {
  const deviceId = await getDeviceId();
  const { error } = await supabase.rpc(CONFIG[kind].save, {
    p_device_id: deviceId,
    [CONFIG[kind].idParam]: id,
    // Pass the token we already hold (if any); coalesced server-side, so null
    // never wipes an existing token. The interactive attach below covers the
    // first-ever grant.
    p_push_token: cachedPushToken,
  });
  if (error) return 'error';

  // Best-effort: prompt for permission (first save) and stamp the token onto
  // this device's rows. Failure here doesn't undo the save.
  await ensurePushTokenAttached(true).catch(() => {});
  return 'ok';
}

export async function unsave(kind: SaveKind, id: string): Promise<SaveResult> {
  const deviceId = await getDeviceId();
  const { error } = await supabase.rpc(CONFIG[kind].unsave, {
    p_device_id: deviceId,
    [CONFIG[kind].idParam]: id,
  });
  return error ? 'error' : 'ok';
}

// ---------------------------------------------------------------------------
// Reads. The list RPCs return this device's rows UNION the logged-in user's
// rows (across devices), deduplicated per object; push_token is never returned.
// ---------------------------------------------------------------------------

export type SavedFighter = {
  id: string;
  notifyNewFight: boolean;
  notifyFightStart: boolean;
  hasPush: boolean;
  createdAt: string;
};
export type SavedEvent = { id: string; notifyEventStart: boolean; hasPush: boolean; createdAt: string };
export type SavedOrganization = { id: string; notifyEventStart: boolean; hasPush: boolean; createdAt: string };

async function listRaw(kind: SaveKind): Promise<Record<string, unknown>[]> {
  const deviceId = await getDeviceId();
  const { data, error } = await supabase.rpc(CONFIG[kind].list, { p_device_id: deviceId });
  if (error) return [];
  return (data ?? []) as Record<string, unknown>[];
}

// Just the object ids for a kind — used by list screens (favorites float to the
// top) and by SaveHeart's uncontrolled initial-state lookup.
export async function getSavedIds(kind: SaveKind): Promise<Set<string>> {
  const rows = await listRaw(kind);
  return new Set(rows.map((r) => r[CONFIG[kind].idField] as string));
}

export async function isSaved(kind: SaveKind, id: string): Promise<boolean> {
  return (await getSavedIds(kind)).has(id);
}

export async function getSavedFighters(): Promise<SavedFighter[]> {
  return (await listRaw('fighter')).map((r) => ({
    id: r.fighter_id as string,
    notifyNewFight: r.notify_new_fight as boolean,
    notifyFightStart: r.notify_fight_start as boolean,
    hasPush: r.has_push as boolean,
    createdAt: r.created_at as string,
  }));
}

export async function getSavedEvents(): Promise<SavedEvent[]> {
  return (await listRaw('event')).map((r) => ({
    id: r.event_id as string,
    notifyEventStart: r.notify_event_start as boolean,
    hasPush: r.has_push as boolean,
    createdAt: r.created_at as string,
  }));
}

export async function getSavedOrganizations(): Promise<SavedOrganization[]> {
  return (await listRaw('organization')).map((r) => ({
    id: r.organization_id as string,
    notifyEventStart: r.notify_event_start as boolean,
    hasPush: r.has_push as boolean,
    createdAt: r.created_at as string,
  }));
}

// ---------------------------------------------------------------------------
// Per-object notification preferences (profile toggles).
// ---------------------------------------------------------------------------

export async function setFighterNotify(id: string, notifyNewFight: boolean, notifyFightStart: boolean): Promise<void> {
  const deviceId = await getDeviceId();
  await supabase.rpc('set_fighter_notify', {
    p_device_id: deviceId,
    p_fighter_id: id,
    p_notify_new_fight: notifyNewFight,
    p_notify_fight_start: notifyFightStart,
  });
}

export async function setEventNotify(id: string, notifyEventStart: boolean): Promise<void> {
  const deviceId = await getDeviceId();
  await supabase.rpc('set_event_notify', { p_device_id: deviceId, p_event_id: id, p_notify_event_start: notifyEventStart });
}

export async function setOrganizationNotify(id: string, notifyEventStart: boolean): Promise<void> {
  const deviceId = await getDeviceId();
  await supabase.rpc('set_organization_notify', {
    p_device_id: deviceId,
    p_organization_id: id,
    p_notify_event_start: notifyEventStart,
  });
}

// ---------------------------------------------------------------------------
// Login: attach this device's anonymous rows to the account (user_id derived
// server-side from auth.uid()). No-op when anonymous. Called from auth.tsx.
// ---------------------------------------------------------------------------

export async function claimSavesForUser(): Promise<void> {
  const deviceId = await getDeviceId();
  await supabase.rpc('claim_saves_for_user', { p_device_id: deviceId });
}

// ---------------------------------------------------------------------------
// First-tap hint: shown once, before the very first OS permission prompt.
// ---------------------------------------------------------------------------

const HINT_KEY = 'true-mma:saves-hint-shown';

export async function hasShownFirstSaveHint(): Promise<boolean> {
  return (await AsyncStorage.getItem(HINT_KEY)) !== null;
}

export async function markFirstSaveHintShown(): Promise<void> {
  await AsyncStorage.setItem(HINT_KEY, '1');
}
