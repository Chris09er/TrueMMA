import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import EventReminderBell from '../components/EventReminderBell';
import FighterFollowBell from '../components/FighterFollowBell';
import { useAuth } from '../lib/auth';
import { formatEventDate } from '../lib/dateFormat';
import { useLocale } from '../lib/i18n';
import { getProfile, updateNickname } from '../lib/profile';
import { getFollowedEvents, getFollowedFighters } from '../lib/queries';
import { colors, commonStyles, radius, spacing } from '../lib/theme';
import type { EventListItem, Fighter } from '../lib/types';

type LoggedOutMode = 'login' | 'signup' | 'forgot-request' | 'forgot-confirm';

export default function ProfileScreen() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={commonStyles.center} color={colors.accentGold} />
      </View>
    );
  }

  return <View style={styles.container}>{user ? <LoggedInView userId={user.id} email={user.email ?? ''} /> : <LoggedOutView />}</View>;
}

function LoggedOutView() {
  const { t } = useLocale();
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
          <Pressable style={styles.button} onPress={handleRequestCode} disabled={busy}>
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
            <Pressable style={styles.button} onPress={handleConfirmReset} disabled={busy}>
              <Text style={styles.buttonText}>{t.auth.resetPasswordButton}</Text>
            </Pressable>
          </>
        )}
        <Pressable onPress={() => setMode('login')}>
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
      <Pressable style={styles.button} onPress={isSignup ? handleSignup : handleLogin} disabled={busy}>
        <Text style={styles.buttonText}>{isSignup ? t.auth.signupButton : t.auth.loginButton}</Text>
      </Pressable>
      <Pressable onPress={() => setMode(isSignup ? 'login' : 'signup')}>
        <Text style={styles.link}>{isSignup ? t.auth.switchToLogin : t.auth.switchToSignup}</Text>
      </Pressable>
      {!isSignup && (
        <Pressable onPress={() => setMode('forgot-request')}>
          <Text style={styles.link}>{t.auth.forgotPassword}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function LoggedInView({ userId, email }: { userId: string; email: string }) {
  const { t, locale } = useLocale();
  const { signOut, updateEmail, updatePassword } = useAuth();
  const [nickname, setNickname] = useState('');
  const [nicknameLoading, setNicknameLoading] = useState(true);
  const [newEmail, setNewEmail] = useState(email);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [followedFighters, setFollowedFighters] = useState<Fighter[]>([]);
  const [followedEvents, setFollowedEvents] = useState<EventListItem[]>([]);
  const [followsLoading, setFollowsLoading] = useState(true);

  useEffect(() => {
    getProfile(userId)
      .then((profile) => setNickname(profile?.nickname ?? ''))
      .finally(() => setNicknameLoading(false));
  }, [userId]);

  useEffect(() => {
    setFollowsLoading(true);
    Promise.all([getFollowedFighters(userId), getFollowedEvents(userId)])
      .then(([fighters, events]) => {
        setFollowedFighters(fighters);
        setFollowedEvents(events);
      })
      .finally(() => setFollowsLoading(false));
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
        <ActivityIndicator color={colors.accentGold} />
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
          <Pressable style={styles.button} onPress={handleSaveNickname} disabled={busy}>
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
      <Pressable style={styles.button} onPress={handleSaveEmail} disabled={busy}>
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
      <Pressable style={styles.button} onPress={handleSavePassword} disabled={busy}>
        <Text style={styles.buttonText}>{t.profile.changePasswordButton}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>{t.profile.followedFightersTitle}</Text>
      {followsLoading ? (
        <ActivityIndicator color={colors.accentGold} />
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
        <ActivityIndicator color={colors.accentGold} />
      ) : followedEvents.length === 0 ? (
        <Text style={styles.body}>{t.profile.noFollowedEvents}</Text>
      ) : (
        followedEvents.map((event) => (
          <View key={event.id} style={styles.listCard}>
            <EventReminderBell eventId={event.id} eventName={event.name} eventDateIso={event.event_date} />
            <Text style={styles.listCardTitle}>{event.name}</Text>
            <Text style={styles.listCardMeta}>{formatEventDate(event.event_date, locale)}</Text>
          </View>
        ))
      )}

      <Pressable style={styles.logoutButton} onPress={signOut}>
        <Text style={styles.logoutButtonText}>{t.profile.logoutButton}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
    borderColor: colors.accentGold,
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
    paddingRight: 28,
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
