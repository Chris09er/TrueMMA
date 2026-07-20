import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { authenticateWithBiometrics, isBiometricLockEnabled } from '../lib/biometrics';
import { useLocale } from '../lib/i18n';
import { pressedStyle, spacing, useTheme, type ColorTokens } from '../lib/theme';

// Locks the whole app behind a biometric prompt whenever it's foregrounded
// while logged in and the user has enabled it in Settings (see
// ProfileScreen.tsx / SettingsModal.tsx) — a local unlock gate in front of
// the already-persisted Supabase session, not a sign-in method. No-op for
// anonymous users and for anyone who hasn't turned it on.
export default function BiometricGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [locked, setLocked] = useState(false);
  const appState = useRef(AppState.currentState);

  const checkLock = async () => {
    if (!user) {
      setLocked(false);
      return;
    }
    const enabled = await isBiometricLockEnabled();
    if (enabled) setLocked(true);
  };

  useEffect(() => {
    if (!loading) checkLock();
  }, [loading, user]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        checkLock();
      }
      appState.current = next;
    });
    return () => subscription.remove();
  }, [user]);

  const unlock = async () => {
    const success = await authenticateWithBiometrics(t.profile.biometricPrompt);
    if (success) setLocked(false);
  };

  if (!locked) return <>{children}</>;

  return (
    <View style={styles.container}>
      <Pressable onPress={unlock} style={({ pressed }) => [styles.button, pressed && pressedStyle]}>
        <Ionicons name="lock-closed-outline" size={32} color={colors.accent} />
        <Text style={styles.label}>{t.profile.unlockButton}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    button: {
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.lg,
    },
    label: {
      color: colors.textPrimary,
      fontWeight: '700',
      fontSize: 16,
    },
  });
