import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// Favorites (heart) are a separate concept from follows (bell): pinning to
// the top of a list, unrelated to push/local notifications. Anonymous
// favoriting has no push-token identity to anchor a server row to, so it
// stays fully local (AsyncStorage) until login, unlike push_subscriptions.
type Kind = 'fighter' | 'event';

const STORAGE_KEYS: Record<Kind, string> = {
  fighter: 'mma-pocket:favorites:fighters',
  event: 'mma-pocket:favorites:events',
};

const TABLES: Record<Kind, string> = {
  fighter: 'fighter_favorites',
  event: 'event_favorites',
};

const COLUMNS: Record<Kind, string> = {
  fighter: 'fighter_id',
  event: 'event_id',
};

async function getLocalIds(kind: Kind): Promise<string[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS[kind]);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function setLocalIds(kind: Kind, ids: string[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS[kind], JSON.stringify(ids));
}

async function isFavorited(kind: Kind, id: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data, error } = await supabase
      .from(TABLES[kind])
      .select('id')
      .eq('user_id', user.id)
      .eq(COLUMNS[kind], id)
      .maybeSingle();
    if (error) return false;
    return data !== null;
  }

  const ids = await getLocalIds(kind);
  return ids.includes(id);
}

// Returns the new active state.
async function toggleFavorite(kind: Kind, id: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const currentlyFavorited = await isFavorited(kind, id);
    if (currentlyFavorited) {
      await supabase.from(TABLES[kind]).delete().eq('user_id', user.id).eq(COLUMNS[kind], id);
      return false;
    }
    await supabase.from(TABLES[kind]).insert({ user_id: user.id, [COLUMNS[kind]]: id });
    return true;
  }

  const ids = await getLocalIds(kind);
  const index = ids.indexOf(id);
  if (index >= 0) {
    ids.splice(index, 1);
    await setLocalIds(kind, ids);
    return false;
  }
  ids.push(id);
  await setLocalIds(kind, ids);
  return true;
}

async function getFavoriteIds(kind: Kind): Promise<Set<string>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data, error } = await supabase.from(TABLES[kind]).select(COLUMNS[kind]).eq('user_id', user.id);
    if (error) return new Set();
    return new Set((data ?? []).map((row) => (row as unknown as Record<string, string>)[COLUMNS[kind]]));
  }

  return new Set(await getLocalIds(kind));
}

export const isFighterFavorited = (fighterId: string) => isFavorited('fighter', fighterId);
export const toggleFighterFavorite = (fighterId: string) => toggleFavorite('fighter', fighterId);
export const isEventFavorited = (eventId: string) => isFavorited('event', eventId);
export const toggleEventFavorite = (eventId: string) => toggleFavorite('event', eventId);
export const getFighterFavoriteIds = () => getFavoriteIds('fighter');
export const getEventFavoriteIds = () => getFavoriteIds('event');

// Called once on sign-in: copies favorites made anonymously on this device
// into the now-known account, so they show up in the profile. Local
// storage is left untouched (harmless if the user logs out again later).
export async function claimLocalFavorites(userId: string): Promise<void> {
  for (const kind of ['fighter', 'event'] as Kind[]) {
    const ids = await getLocalIds(kind);
    if (ids.length === 0) continue;
    const rows = ids.map((id) => ({ user_id: userId, [COLUMNS[kind]]: id }));
    await supabase.from(TABLES[kind]).upsert(rows, { onConflict: `user_id,${COLUMNS[kind]}` });
  }
}
