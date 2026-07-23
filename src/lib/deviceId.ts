import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'true-mma:device-id';

let cachedDeviceId: string | null = null;

// A device-scoped anonymous id, independent of the push token and of any
// account. Generated locally on first launch; the anchor for both fight votes
// (fight_votes) and the unified saved_* rows (saves.ts) — neither requires the
// OS notification-permission prompt. Not cryptographically strong, just needs
// to be unique per install; deliberately not using expo-crypto's randomUUID to
// avoid pulling in a native module for this.
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }

  const generated = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, generated);
  cachedDeviceId = generated;
  return generated;
}
