import { useCallback, useEffect, useRef, useState } from 'react';
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
//
// Three states rather than a bare boolean, deliberately: `checking` renders a
// blank cover (never the app content) while the async enabled-check runs, so a
// protected app can't briefly flash its content on cold start or on every
// foreground before the lock engages — the whole point of a privacy lock.
type GateState = 'checking' | 'locked' | 'open';

export default function BiometricGate({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [state, setState] = useState<GateState>('checking');
  const appState = useRef(AppState.currentState);

  const evaluate = useCallback(async () => {
    if (!user) {
      setState('open');
      return;
    }
    const enabled = await isBiometricLockEnabled();
    setState(enabled ? 'locked' : 'open');
  }, [user]);

  // Re-evaluate whenever auth resolves or the user changes. While auth is still
  // loading, stay in `checking` (blank cover) rather than assuming `open`.
  useEffect(() => {
    if (loading) return;
    setState('checking');
    evaluate();
  }, [loading, user, evaluate]);

  // On return-to-foreground, re-lock if enabled. Only flips to `locked` (never
  // back to `checking`), so a resume never blanks an already-open app for a
  // logged-in user who doesn't have the lock on.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active' && user) {
        isBiometricLockEnabled().then((enabled) => {
          if (enabled) setState('locked');
        });
      }
      appState.current = next;
    });
    return () => subscription.remove();
  }, [user]);

  const unlock = async () => {
    const success = await authenticateWithBiometrics(t.profile.biometricPrompt);
    if (success) setState('open');
  };

  if (state === 'open') return <>{children}</>;

  // `checking`: a neutral cover, no app content and no interactive elements —
  // just prevents the content-flash while we determine whether to lock.
  if (state === 'checking') return <View style={styles.container} />;

  // `locked`: unlock prompt, plus a logout escape hatch so a user who can't
  // authenticate (e.g. biometrics repeatedly failing) is never trapped with no
  // way out. Device-PIN fallback is also allowed (see biometrics.ts).
  return (
    <View style={styles.container}>
      <Pressable onPress={unlock} style={({ pressed }) => [styles.button, pressed && pressedStyle]}>
        <Ionicons name="lock-closed-outline" size={32} color={colors.accent} />
        <Text style={styles.label}>{t.profile.unlockButton}</Text>
      </Pressable>
      <Pressable onPress={signOut} style={({ pressed }) => pressed && pressedStyle}>
        <Text style={styles.logout}>{t.profile.logoutButton}</Text>
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
      gap: spacing.xl,
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
    logout: {
      color: colors.textSecondary,
      fontWeight: '600',
      fontSize: 14,
    },
  });
