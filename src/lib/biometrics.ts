import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

// A local unlock gate in front of an already-persisted Supabase session
// (see docs/ARCHITECTURE.md, Login/Profile — persistSession: true) — this is
// not a sign-in method, it never talks to Supabase. Requires a native
// rebuild (expo-local-authentication) before it's usable on a given build.
const ENABLED_STORAGE_KEY = 'true-mma:biometric-lock-enabled';

export async function isBiometricLockAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

export async function isBiometricLockEnabled(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(ENABLED_STORAGE_KEY);
  return stored === 'true';
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
}

export async function authenticateWithBiometrics(promptMessage: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage, disableDeviceFallback: false });
  return result.success;
}
