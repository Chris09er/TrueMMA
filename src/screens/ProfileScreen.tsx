import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import EventReminderBell from '../components/EventReminderBell';
import FighterFollowBell from '../components/FighterFollowBell';
import EventFavoriteHeart from '../components/EventFavoriteHeart';
import FighterFavoriteHeart from '../components/FighterFavoriteHeart';
import OrganizationFollowBell from '../components/OrganizationFollowBell';
import SettingsModal from '../components/SettingsModal';
import { useAuth, type AuthResult } from '../lib/auth';
import { authErrorMessage } from '../lib/authErrors';
import { formatEventDate } from '../lib/dateFormat';
import { useLocale } from '../lib/i18n';
import type { Translations } from '../lib/i18n';
import { getProfile, updateNickname } from '../lib/profile';
import { PASSWORD_REQUIREMENTS, isPasswordValid } from '../lib/passwordPolicy';
import {
  getFavoritedEvents,
  getFavoritedFighters,
  getFollowedEvents,
  getFollowedFighters,
  getFollowedOrganizations,
} from '../lib/queries';
import { pressedStyle, radius, spacing, useCommonStyles, useTheme, type ColorTokens } from '../lib/theme';
import type { EventListItem, Fighter, Organization } from '../lib/types';

type LoggedOutMode =
  | 'login'
  | 'signup'
  | 'signup-confirm'
  | 'forgot-request'
  | 'forgot-confirm'
  | 'magic-request'
  | 'magic-confirm';

// Must match the real resend cooldown configured in each Supabase project's
// dashboard (Authentication → Rate Limits) — not introspectable client-side,
// so this is a best-effort UI countdown, not the source of truth. If it
// drifts from the real value, the worst case is the button re-enables a
// little early and the user sees an over_email_send_rate_limit error once.
const RESEND_COOLDOWN_SECONDS = 60;

const LAST_EMAIL_STORAGE_KEY = 'true-mma:last-email';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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

// Shared eye-icon-toggle password field — used for both the login/signup
// password and the reset-flow's new-password field, so the toggle isn't
// built twice.
function PasswordField({
  inputRef,
  style,
  iconColor,
  ...inputProps
}: {
  inputRef?: React.Ref<TextInput>;
  style: object;
  iconColor: string;
} & Omit<React.ComponentProps<typeof TextInput>, 'secureTextEntry' | 'style'>) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  return (
    <View style={passwordFieldStyles.wrapper}>
      <TextInput ref={inputRef} style={[style, passwordFieldStyles.input]} secureTextEntry={!visible} {...inputProps} />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        style={passwordFieldStyles.toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={visible ? t.auth.hidePassword : t.auth.showPassword}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={iconColor} />
      </Pressable>
    </View>
  );
}

// Shared submit button — shows a spinner instead of its label while `busy`,
// so a slow request doesn't look like the tap did nothing.
function SubmitButton({
  label,
  busy,
  disabled,
  onPress,
  style,
  textStyle,
  spinnerColor,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
  style: object;
  textStyle: object;
  spinnerColor: string;
}) {
  return (
    <Pressable style={({ pressed }) => [style, pressed && pressedStyle]} onPress={onPress} disabled={busy || disabled}>
      {busy ? <ActivityIndicator color={spinnerColor} /> : <Text style={textStyle}>{label}</Text>}
    </Pressable>
  );
}

const passwordFieldStyles = StyleSheet.create({
  wrapper: { position: 'relative', justifyContent: 'center' },
  input: { paddingRight: 44 },
  toggle: { position: 'absolute', right: 14 },
});

// Live checklist shown under a *new*-password field (signup, reset, change
// password) — never under the login password field, since existing users
// may have a password that predates this policy and are still allowed to
// use it (Supabase's own documented behavior).
function PasswordRequirementsChecklist({ password, colors }: { password: string; colors: ColorTokens }) {
  const { t } = useLocale();
  return (
    <View style={checklistStyles.container}>
      {PASSWORD_REQUIREMENTS.map((req) => {
        const met = req.test(password);
        return (
          <View key={req.key} style={checklistStyles.row}>
            <Ionicons
              name={met ? 'checkmark-circle' : 'ellipse-outline'}
              size={16}
              color={met ? colors.accent : colors.textSecondary}
            />
            <Text style={[checklistStyles.label, { color: met ? colors.textPrimary : colors.textSecondary }]}>
              {t.auth[req.labelKey]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const checklistStyles = StyleSheet.create({
  container: { marginTop: -spacing.sm, marginBottom: spacing.md, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 13 },
});

function showAuthError(t: Translations, result: AuthResult) {
  if (result.status === 'error') {
    Alert.alert(t.auth.errorTitle, authErrorMessage(t, result.code));
  }
}

function LoggedOutView() {
  const { t, locale } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    signIn,
    signUp,
    confirmSignup,
    resendSignupConfirmation,
    requestMagicLink,
    confirmMagicLink,
    requestPasswordReset,
    confirmPasswordReset,
  } = useAuth();
  const [mode, setMode] = useState<LoggedOutMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const passwordRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const signupCodeRef = useRef<TextInput>(null);

  // Ticks the resend cooldown down once a second while it's active.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Prefill the email field with whatever was last used on this device, so a
  // returning user doesn't have to retype it after logging out.
  useEffect(() => {
    AsyncStorage.getItem(LAST_EMAIL_STORAGE_KEY).then((stored) => {
      if (stored) setEmail(stored);
    });
  }, []);

  const handleLogin = async () => {
    const normalizedEmail = normalizeEmail(email);
    setBusy(true);
    try {
      const result = await signIn(normalizedEmail, password);
      if (result.status === 'error') {
        showAuthError(t, result);
        return;
      }
      AsyncStorage.setItem(LAST_EMAIL_STORAGE_KEY, normalizedEmail).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async () => {
    const normalizedEmail = normalizeEmail(email);
    setBusy(true);
    try {
      const result = await signUp(normalizedEmail, password, locale);
      if (result.status === 'error') {
        showAuthError(t, result);
        return;
      }
      AsyncStorage.setItem(LAST_EMAIL_STORAGE_KEY, normalizedEmail).catch(() => {});
      setCode('');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setMode('signup-confirm');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmSignup = async () => {
    setBusy(true);
    try {
      const result = await confirmSignup(normalizeEmail(email), code);
      // On success this signs the user in directly (verifyOtp returns a
      // session) — AuthProvider's onAuthStateChange picks it up and
      // ProfileScreen swaps to LoggedInView on its own, nothing else to do.
      showAuthError(t, result);
    } finally {
      setBusy(false);
    }
  };

  const handleResendSignupCode = async () => {
    if (resendCooldown > 0) return;
    setBusy(true);
    try {
      const result = await resendSignupConfirmation(normalizeEmail(email));
      if (result.status === 'error') {
        showAuthError(t, result);
        return;
      }
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setBusy(false);
    }
  };

  const handleRequestMagicLink = async () => {
    const normalizedEmail = normalizeEmail(email);
    setBusy(true);
    try {
      const result = await requestMagicLink(normalizedEmail, locale);
      if (result.status === 'error') {
        showAuthError(t, result);
        return;
      }
      setCode('');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setMode('magic-confirm');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmMagicLink = async () => {
    setBusy(true);
    try {
      const result = await confirmMagicLink(normalizeEmail(email), code);
      // Success signs the user in directly, same as confirmSignup — see there.
      showAuthError(t, result);
    } finally {
      setBusy(false);
    }
  };

  const handleResendMagicLink = async () => {
    if (resendCooldown > 0) return;
    setBusy(true);
    try {
      const result = await requestMagicLink(normalizeEmail(email), locale);
      if (result.status === 'error') {
        showAuthError(t, result);
        return;
      }
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setBusy(false);
    }
  };

  const handleRequestCode = async () => {
    setBusy(true);
    try {
      const result = await requestPasswordReset(normalizeEmail(email));
      if (result.status === 'error') {
        showAuthError(t, result);
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
      const result = await confirmPasswordReset(normalizeEmail(email), code, newPassword);
      if (result.status === 'error') {
        showAuthError(t, result);
        return;
      }
      Alert.alert(t.auth.forgotPasswordTitle, t.auth.resetSuccess);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'signup-confirm') {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="always">
          <Text style={styles.title}>{t.auth.signupConfirmTitle}</Text>
          <Text style={styles.body}>{t.auth.signupConfirmBody}</Text>
          <TextInput
            ref={signupCodeRef}
            style={styles.input}
            placeholder={t.auth.codeLabel}
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={handleConfirmSignup}
            value={code}
            onChangeText={setCode}
          />
          <SubmitButton
            label={t.auth.confirmButton}
            busy={busy}
            onPress={handleConfirmSignup}
            style={styles.button}
            textStyle={styles.buttonText}
            spinnerColor={colors.accent}
          />
          <Pressable
            onPress={handleResendSignupCode}
            disabled={resendCooldown > 0 || busy}
            style={({ pressed }) => pressed && pressedStyle}
          >
            <Text style={styles.link}>
              {resendCooldown > 0 ? t.auth.resendCodeIn(resendCooldown) : t.auth.resendCode}
            </Text>
          </Pressable>
          <Pressable onPress={() => setMode('login')} style={({ pressed }) => pressed && pressedStyle}>
            <Text style={styles.link}>{t.auth.backToLogin}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (mode === 'magic-request' || mode === 'magic-confirm') {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="always">
          <Text style={styles.title}>
            {mode === 'magic-request' ? t.auth.magicLinkRequestTitle : t.auth.magicLinkConfirmTitle}
          </Text>
          <Text style={styles.body}>
            {mode === 'magic-request' ? t.auth.magicLinkRequestBody : t.auth.magicLinkConfirmBody}
          </Text>
          {mode === 'magic-request' ? (
            <>
              <TextInput
                style={styles.input}
                placeholder={t.auth.emailLabel}
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={handleRequestMagicLink}
                value={email}
                onChangeText={setEmail}
              />
              <SubmitButton
                label={t.auth.sendCodeButton}
                busy={busy}
                onPress={handleRequestMagicLink}
                style={styles.button}
                textStyle={styles.buttonText}
                spinnerColor={colors.accent}
              />
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder={t.auth.codeLabel}
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={handleConfirmMagicLink}
                value={code}
                onChangeText={setCode}
              />
              <SubmitButton
                label={t.auth.confirmButton}
                busy={busy}
                onPress={handleConfirmMagicLink}
                style={styles.button}
                textStyle={styles.buttonText}
                spinnerColor={colors.accent}
              />
              <Pressable
                onPress={handleResendMagicLink}
                disabled={resendCooldown > 0 || busy}
                style={({ pressed }) => pressed && pressedStyle}
              >
                <Text style={styles.link}>
                  {resendCooldown > 0 ? t.auth.resendCodeIn(resendCooldown) : t.auth.resendCode}
                </Text>
              </Pressable>
            </>
          )}
          <Pressable onPress={() => setMode('login')} style={({ pressed }) => pressed && pressedStyle}>
            <Text style={styles.link}>{t.auth.backToLogin}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (mode === 'forgot-request' || mode === 'forgot-confirm') {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="always">
          <Text style={styles.title}>{t.auth.forgotPasswordTitle}</Text>
          <Text style={styles.body}>{t.auth.forgotPasswordBody}</Text>
          <TextInput
            style={styles.input}
            placeholder={t.auth.emailLabel}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType={mode === 'forgot-request' ? 'send' : 'next'}
            onSubmitEditing={() => (mode === 'forgot-request' ? handleRequestCode() : codeRef.current?.focus())}
            value={email}
            onChangeText={setEmail}
            editable={mode === 'forgot-request'}
          />
          {mode === 'forgot-request' ? (
            <SubmitButton
              label={t.auth.sendCodeButton}
              busy={busy}
              onPress={handleRequestCode}
              style={styles.button}
              textStyle={styles.buttonText}
              spinnerColor={colors.accent}
            />
          ) : (
            <>
              <TextInput
                ref={codeRef}
                style={styles.input}
                placeholder={t.auth.codeLabel}
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                returnKeyType="next"
                onSubmitEditing={() => newPasswordRef.current?.focus()}
                value={code}
                onChangeText={setCode}
              />
              <PasswordField
                inputRef={newPasswordRef}
                style={styles.input}
                iconColor={colors.textSecondary}
                placeholder={t.auth.newPasswordLabel}
                placeholderTextColor={colors.textSecondary}
                textContentType="newPassword"
                autoComplete="new-password"
                returnKeyType="done"
                onSubmitEditing={handleConfirmReset}
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <PasswordRequirementsChecklist password={newPassword} colors={colors} />
              <SubmitButton
                label={t.auth.resetPasswordButton}
                busy={busy}
                disabled={!isPasswordValid(newPassword)}
                onPress={handleConfirmReset}
                style={styles.button}
                textStyle={styles.buttonText}
                spinnerColor={colors.accent}
              />
            </>
          )}
          <Pressable onPress={() => setMode('login')} style={({ pressed }) => pressed && pressedStyle}>
            <Text style={styles.link}>{t.auth.backToLogin}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const isSignup = mode === 'signup';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="always">
        <Text style={styles.title}>{isSignup ? t.auth.signupTitle : t.auth.loginTitle}</Text>
        <TextInput
          style={styles.input}
          placeholder={t.auth.emailLabel}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          value={email}
          onChangeText={setEmail}
        />
        <PasswordField
          inputRef={passwordRef}
          style={styles.input}
          iconColor={colors.textSecondary}
          placeholder={t.auth.passwordLabel}
          placeholderTextColor={colors.textSecondary}
          textContentType={isSignup ? 'newPassword' : 'password'}
          autoComplete={isSignup ? 'new-password' : 'password'}
          returnKeyType="done"
          onSubmitEditing={isSignup ? handleSignup : handleLogin}
          value={password}
          onChangeText={setPassword}
        />
        {isSignup && <PasswordRequirementsChecklist password={password} colors={colors} />}
        <SubmitButton
          label={isSignup ? t.auth.signupButton : t.auth.loginButton}
          busy={busy}
          disabled={isSignup && !isPasswordValid(password)}
          onPress={isSignup ? handleSignup : handleLogin}
          style={styles.button}
          textStyle={styles.buttonText}
          spinnerColor={colors.accent}
        />
        <Pressable
          onPress={() => setMode(isSignup ? 'login' : 'signup')}
          style={({ pressed }) => pressed && pressedStyle}
        >
          <Text style={styles.link}>{isSignup ? t.auth.switchToLogin : t.auth.switchToSignup}</Text>
        </Pressable>
        {!isSignup && (
          <>
            <Pressable onPress={() => setMode('forgot-request')} style={({ pressed }) => pressed && pressedStyle}>
              <Text style={styles.link}>{t.auth.forgotPassword}</Text>
            </Pressable>
            <Pressable onPress={() => setMode('magic-request')} style={({ pressed }) => pressed && pressedStyle}>
              <Text style={styles.link}>{t.auth.magicLinkButton}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
      const result = await updateEmail(normalizeEmail(newEmail));
      if (result.status === 'error') {
        showAuthError(t, result);
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
      if (result.status === 'error') {
        showAuthError(t, result);
        return;
      }
      setNewPassword('');
      Alert.alert(t.profile.changePasswordTitle, t.profile.changePasswordSaved);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="always">
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
          <SubmitButton
            label={t.profile.nicknameSave}
            busy={busy}
            onPress={handleSaveNickname}
            style={styles.button}
            textStyle={styles.buttonText}
            spinnerColor={colors.accent}
          />
        </>
      )}

      <Text style={styles.sectionTitle}>{t.profile.changeEmailTitle}</Text>
      <TextInput
        style={styles.input}
        placeholder={t.auth.emailLabel}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        value={newEmail}
        onChangeText={setNewEmail}
      />
      <SubmitButton
        label={t.profile.changeEmailButton}
        busy={busy}
        onPress={handleSaveEmail}
        style={styles.button}
        textStyle={styles.buttonText}
        spinnerColor={colors.accent}
      />

      <Text style={styles.sectionTitle}>{t.profile.changePasswordTitle}</Text>
      <PasswordField
        style={styles.input}
        iconColor={colors.textSecondary}
        placeholder={t.auth.newPasswordLabel}
        placeholderTextColor={colors.textSecondary}
        textContentType="newPassword"
        autoComplete="new-password"
        value={newPassword}
        onChangeText={setNewPassword}
      />
      <PasswordRequirementsChecklist password={newPassword} colors={colors} />
      <SubmitButton
        label={t.profile.changePasswordButton}
        busy={busy}
        disabled={!isPasswordValid(newPassword)}
        onPress={handleSavePassword}
        style={styles.button}
        textStyle={styles.buttonText}
        spinnerColor={colors.accent}
      />

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
