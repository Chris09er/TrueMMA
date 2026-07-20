import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import EventReminderBell from '../components/EventReminderBell';
import FighterFollowBell from '../components/FighterFollowBell';
import EventFavoriteHeart from '../components/EventFavoriteHeart';
import FighterFavoriteHeart from '../components/FighterFavoriteHeart';
import OrganizationFollowBell from '../components/OrganizationFollowBell';
import SettingsModal from '../components/SettingsModal';
import { useAuth } from '../lib/auth';
import { formatEventDate } from '../lib/dateFormat';
import { useLocale } from '../lib/i18n';
import { getProfile, updateNickname } from '../lib/profile';
import {
  getFavoritedEvents,
  getFavoritedFighters,
  getFollowedEvents,
  getFollowedFighters,
  getFollowedOrganizations,
} from '../lib/queries';
import { pressedStyle, radius, spacing, useCommonStyles, useTheme, type ColorTokens } from '../lib/theme';
import type { EventListItem, Fighter, Organization } from '../lib/types';

type LoggedOutMode = 'login' | 'signup' | 'forgot-request' | 'forgot-confirm';

export default function ProfileScreen() {
  const { user, loading, timezoneOverride, setTimezoneOverride } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const commonStyles = useCommonStyles();
  const navigation = useNavigation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Rendered in the native header (top-right, level with the "Profil"
  // title) via headerRight, not absolutely positioned inside the screen
  // body — the latter put it level with the screen's own content instead
  // (e.g. the "Anmelden" heading), not the header bar.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          style={({ pressed }) => [styles.settingsButton, pressed && pressedStyle]}
          onPress={() => setSettingsOpen(true)}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
        </Pressable>
      ),
    });
  }, [navigation, styles, colors]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={commonStyles.center} color={colors.accent} />
        <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {user ? <LoggedInView userId={user.id} email={user.email ?? ''} /> : <LoggedOutView />}
      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        timezoneOverride={user ? timezoneOverride : undefined}
        onTimezoneChange={user ? (tz) => setTimezoneOverride(tz) : undefined}
      />
    </View>
  );
}

function LoggedOutView() {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { signIn, signUp, requestPasswordReset, confirmPasswordReset } = useAuth();
  const [mode, setMode] = useState<LoggedOutMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const showError = () => Alert.alert(t.auth.errorTitle, t.auth.errorBody);

  const handleLogin = async () => {
    setBusy(true);
    try {
      const result = await signIn(email, password);
      if (result === 'error') showError();
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async () => {
    setBusy(true);
    try {
      const result = await signUp(email, password);
      if (result === 'error') {
        showError();
        return;
      }
      Alert.alert(t.auth.signupTitle, t.auth.signupSuccess);
      setMode('login');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestCode = async () => {
    setBusy(true);
    try {
      const result = await requestPasswordReset(email);
      if (result === 'error') {
        showError();
        return;
      }
      Alert.alert(t.auth.forgotPasswordTitle, t.auth.resetCodeSent);
      setMode('forgot-confirm');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReset = async () => {
    setBusy(true);
    try {
      const result = await confirmPasswordReset(email, code, newPassword);
      if (result === 'error') {
        showError();
        return;
      }
      Alert.alert(t.auth.forgotPasswordTitle, t.auth.resetSuccess);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'forgot-request' || mode === 'forgot-confirm') {
    return (
      <ScrollView contentContainerStyle={styles.form}>
        <Text style={styles.title}>{t.auth.forgotPasswordTitle}</Text>
        <Text style={styles.body}>{t.auth.forgotPasswordBody}</Text>
        <TextInput
          style={styles.input}
          placeholder={t.auth.emailLabel}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={mode === 'forgot-request'}
        />
        {mode === 'forgot-request' ? (
          <Pressable
            style={({ pressed }) => [styles.button, pressed && pressedStyle]}
            onPress={handleRequestCode}
            disabled={busy}
          >
            <Text style={styles.buttonText}>{t.auth.sendCodeButton}</Text>
          </Pressable>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder={t.auth.codeLabel}
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
            />
            <TextInput
              style={styles.input}
              placeholder={t.auth.newPasswordLabel}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <Pressable
              style={({ pressed }) => [styles.button, pressed && pressedStyle]}
              onPress={handleConfirmReset}
              disabled={busy}
            >
              <Text style={styles.buttonText}>{t.auth.resetPasswordButton}</Text>
            </Pressable>
          </>
        )}
        <Pressable onPress={() => setMode('login')} style={({ pressed }) => pressed && pressedStyle}>
          <Text style={styles.link}>{t.auth.backToLogin}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const isSignup = mode === 'signup';

  return (
    <ScrollView contentContainerStyle={styles.form}>
      <Text style={styles.title}>{isSignup ? t.auth.signupTitle : t.auth.loginTitle}</Text>
      <TextInput
        style={styles.input}
        placeholder={t.auth.emailLabel}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder={t.auth.passwordLabel}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Pressable
        style={({ pressed }) => [styles.button, pressed && pressedStyle]}
        onPress={isSignup ? handleSignup : handleLogin}
        disabled={busy}
      >
        <Text style={styles.buttonText}>{isSignup ? t.auth.signupButton : t.auth.loginButton}</Text>
      </Pressable>
      <Pressable
        onPress={() => setMode(isSignup ? 'login' : 'signup')}
        style={({ pressed }) => pressed && pressedStyle}
      >
        <Text style={styles.link}>{isSignup ? t.auth.switchToLogin : t.auth.switchToSignup}</Text>
      </Pressable>
      {!isSignup && (
        <Pressable onPress={() => setMode('forgot-request')} style={({ pressed }) => pressed && pressedStyle}>
          <Text style={styles.link}>{t.auth.forgotPassword}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function LoggedInView({ userId, email }: { userId: string; email: string }) {
  const { t, locale } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { signOut, updateEmail, updatePassword, timezoneOverride } = useAuth();
  const [nickname, setNickname] = useState('');
  const [nicknameLoading, setNicknameLoading] = useState(true);
  const [newEmail, setNewEmail] = useState(email);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [followedFighters, setFollowedFighters] = useState<Fighter[]>([]);
  const [followedEvents, setFollowedEvents] = useState<EventListItem[]>([]);
  const [followedOrganizations, setFollowedOrganizations] = useState<Organization[]>([]);
  const [followsLoading, setFollowsLoading] = useState(true);
  const [favoritedFighters, setFavoritedFighters] = useState<Fighter[]>([]);
  const [favoritedEvents, setFavoritedEvents] = useState<EventListItem[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(true);

  useEffect(() => {
    getProfile(userId)
      .then((profile) => setNickname(profile?.nickname ?? ''))
      .finally(() => setNicknameLoading(false));
  }, [userId]);

  useEffect(() => {
    setFollowsLoading(true);
    Promise.all([getFollowedFighters(userId), getFollowedEvents(userId), getFollowedOrganizations(userId)])
      .then(([fighters, events, organizations]) => {
        setFollowedFighters(fighters);
        setFollowedEvents(events);
        setFollowedOrganizations(organizations);
      })
      .finally(() => setFollowsLoading(false));
  }, [userId]);

  useEffect(() => {
    setFavoritesLoading(true);
    Promise.all([getFavoritedFighters(userId), getFavoritedEvents(userId)])
      .then(([fighters, events]) => {
        setFavoritedFighters(fighters);
        setFavoritedEvents(events);
      })
      .finally(() => setFavoritesLoading(false));
  }, [userId]);

  const handleSaveNickname = async () => {
    setBusy(true);
    try {
      const result = await updateNickname(userId, nickname);
      if (result === 'taken') {
        Alert.alert(t.auth.errorTitle, t.profile.nicknameTaken);
        return;
      }
      if (result === 'error') {
        Alert.alert(t.auth.errorTitle, t.auth.errorBody);
        return;
      }
      Alert.alert(t.profile.title, t.profile.nicknameSaved);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEmail = async () => {
    setBusy(true);
    try {
      const result = await updateEmail(newEmail);
      if (result === 'error') {
        Alert.alert(t.auth.errorTitle, t.auth.errorBody);
        return;
      }
      Alert.alert(t.profile.changeEmailTitle, t.profile.changeEmailSaved);
    } finally {
      setBusy(false);
    }
  };

  const handleSavePassword = async () => {
    setBusy(true);
    try {
      const result = await updatePassword(newPassword);
      if (result === 'error') {
        Alert.alert(t.auth.errorTitle, t.auth.errorBody);
        return;
      }
      setNewPassword('');
      Alert.alert(t.profile.changePasswordTitle, t.profile.changePasswordSaved);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.form}>
      <Text style={styles.sectionTitle}>{t.profile.nicknameLabel}</Text>
      {nicknameLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder={t.profile.nicknameLabel}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            value={nickname}
            onChangeText={setNickname}
          />
          <Pressable
            style={({ pressed }) => [styles.button, pressed && pressedStyle]}
            onPress={handleSaveNickname}
            disabled={busy}
          >
            <Text style={styles.buttonText}>{t.profile.nicknameSave}</Text>
          </Pressable>
        </>
      )}

      <Text style={styles.sectionTitle}>{t.profile.changeEmailTitle}</Text>
      <TextInput
        style={styles.input}
        placeholder={t.auth.emailLabel}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        keyboardType="email-address"
        value={newEmail}
        onChangeText={setNewEmail}
      />
      <Pressable
        style={({ pressed }) => [styles.button, pressed && pressedStyle]}
        onPress={handleSaveEmail}
        disabled={busy}
      >
        <Text style={styles.buttonText}>{t.profile.changeEmailButton}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>{t.profile.changePasswordTitle}</Text>
      <TextInput
        style={styles.input}
        placeholder={t.auth.newPasswordLabel}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
      />
      <Pressable
        style={({ pressed }) => [styles.button, pressed && pressedStyle]}
        onPress={handleSavePassword}
        disabled={busy}
      >
        <Text style={styles.buttonText}>{t.profile.changePasswordButton}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>{t.profile.followedFightersTitle}</Text>
      {followsLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : followedFighters.length === 0 ? (
        <Text style={styles.body}>{t.profile.noFollowedFighters}</Text>
      ) : (
        followedFighters.map((fighter) => (
          <View key={fighter.id} style={styles.listCard}>
            <FighterFollowBell fighterId={fighter.id} />
            <Text style={styles.listCardTitle}>{fighter.name}</Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>{t.profile.followedEventsTitle}</Text>
      {followsLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : followedEvents.length === 0 ? (
        <Text style={styles.body}>{t.profile.noFollowedEvents}</Text>
      ) : (
        followedEvents.map((event) => (
          <View key={event.id} style={styles.listCard}>
            <EventReminderBell eventId={event.id} eventName={event.name} eventDateIso={event.event_date} />
            <Text style={styles.listCardTitle}>{event.name}</Text>
            <Text style={styles.listCardMeta}>{formatEventDate(event.event_date, locale, undefined, timezoneOverride ?? undefined)}</Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>{t.profile.followedOrganizationsTitle}</Text>
      {followsLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : followedOrganizations.length === 0 ? (
        <Text style={styles.body}>{t.profile.noFollowedOrganizations}</Text>
      ) : (
        followedOrganizations.map((org) => (
          <View key={org.id} style={[styles.listCard, styles.listCardRow]}>
            <Text style={styles.listCardTitleInline}>{org.short_name}</Text>
            <OrganizationFollowBell organizationId={org.id} />
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>{t.profile.favoritedFightersTitle}</Text>
      {favoritesLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : favoritedFighters.length === 0 ? (
        <Text style={styles.body}>{t.profile.noFavoritedFighters}</Text>
      ) : (
        favoritedFighters.map((fighter) => (
          <View key={fighter.id} style={styles.listCard}>
            <FighterFavoriteHeart fighterId={fighter.id} />
            <Text style={styles.listCardTitle}>{fighter.name}</Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>{t.profile.favoritedEventsTitle}</Text>
      {favoritesLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : favoritedEvents.length === 0 ? (
        <Text style={styles.body}>{t.profile.noFavoritedEvents}</Text>
      ) : (
        favoritedEvents.map((event) => (
          <View key={event.id} style={styles.listCard}>
            <EventFavoriteHeart eventId={event.id} />
            <Text style={styles.listCardTitle}>{event.name}</Text>
            <Text style={styles.listCardMeta}>{formatEventDate(event.event_date, locale, undefined, timezoneOverride ?? undefined)}</Text>
          </View>
        ))
      )}

      <Pressable style={({ pressed }) => [styles.logoutButton, pressed && pressedStyle]} onPress={signOut}>
        <Text style={styles.logoutButtonText}>{t.profile.logoutButton}</Text>
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    form: {
      padding: spacing.lg,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
    },
    body: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: 14,
      color: colors.textPrimary,
      marginBottom: spacing.md,
    },
    button: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    buttonText: {
      color: colors.textPrimary,
      fontWeight: '700',
      fontSize: 15,
    },
    link: {
      color: colors.link,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    settingsButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 4,
    },
    listCard: {
      padding: 14,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      position: 'relative',
    },
    listCardTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
      paddingRight: 56,
    },
    listCardRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    listCardTitleInline: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    listCardMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    logoutButton: {
      marginTop: spacing.xl,
      paddingVertical: 14,
      alignItems: 'center',
    },
    logoutButtonText: {
      color: colors.danger,
      fontWeight: '700',
      fontSize: 15,
    },
  });
