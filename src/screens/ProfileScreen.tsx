import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { RootTabParamList } from '../navigation';
import SaveHeart from '../components/SaveHeart';
import Flag from '../components/Flag';
import FilterModal from '../components/FilterModal';
import { LinearGradient } from 'expo-linear-gradient';
import { TIMEZONE_OPTIONS } from '../lib/timezones';
import { LogoMark, Screen, ScreenHeader } from '../components/ui';
import { useAuth, type AuthResult } from '../lib/auth';
import { authErrorMessage } from '../lib/authErrors';
import { formatEventDate } from '../lib/dateFormat';
import { SUPPORTED_LOCALES, useLocale } from '../lib/i18n';
import type { Translations } from '../lib/i18n';
import { getProfile, updateNickname } from '../lib/profile';
import { PASSWORD_REQUIREMENTS, isPasswordValid } from '../lib/passwordPolicy';
import * as AppleAuthentication from 'expo-apple-authentication';
import { isBiometricLockAvailable, isBiometricLockEnabled, setBiometricLockEnabled } from '../lib/biometrics';
import { getEventsByIds, getFightersByIds, getOrganizationsByIds } from '../lib/queries';
import {
  DEFAULT_NOTIFICATION_PREFS,
  getNotificationPrefs,
  getSavedEvents,
  getSavedFighters,
  getSavedOrganizations,
  hasNotificationPermission,
  setNotificationPrefs,
  type NotificationPrefs,
} from '../lib/saves';
import { minTapTarget, pressedStyle, radius, spacing, typography, useCommonStyles, useTheme, type ColorTokens, type ThemeOverride } from '../lib/theme';
import type { EventListItem, Fighter, Organization } from '../lib/types';

type ProfileSection = 'account' | 'favorites' | 'settings';

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

// Biometric app-lock is implemented (see lib/biometrics + the biometric prop
// on SettingsSection) but intentionally hidden from the UI for now. Flip to
// true to resurface it once the feature is ready to ship.
const SHOW_BIOMETRIC_LOCK = false;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export default function ProfileScreen() {
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const commonStyles = useCommonStyles();

  return (
    <Screen>
      <ScreenHeader left={<LogoMark size={26} />} title={t.tabs.profile.toUpperCase()} />
      {loading ? (
        <ActivityIndicator style={commonStyles.center} color={colors.accent} />
      ) : user ? (
        <LoggedInView userId={user.id} email={user.email ?? ''} />
      ) : (
        <LoggedOutView />
      )}
    </Screen>
  );
}

// Metallic "guest mode" card at the top of the logged-out profile — the
// brushed-navy look from the design references.
function GuestCard() {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <LinearGradient colors={['#3B4658', '#232D3C', '#151C28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.guestCard}>
      <View style={styles.guestBadge}>
        <Text style={styles.guestBadgeText}>{t.profile.guestMode.toUpperCase()}</Text>
      </View>
      <Ionicons name="person-circle-outline" size={44} color={colors.alloy} style={styles.guestAvatar} />
      <Text style={styles.guestTitle}>{t.profile.guestTitle.toUpperCase()}</Text>
      <Text style={styles.guestSubtitle}>{t.profile.guestSubtitle}</Text>
    </LinearGradient>
  );
}

// Theme / language / timezone / biometric settings, inline on the Profile
// screen. Theme is a card row; language and timezone are dropdowns that open a
// picker. Timezone/biometric only appear when their props are supplied.
function SettingsSection({
  timezoneOverride,
  onTimezoneChange,
  biometric,
}: {
  timezoneOverride?: string | null;
  onTimezoneChange?: (timezone: string | null) => void;
  biometric?: { enabled: boolean; onChange: (enabled: boolean) => void };
}) {
  const { locale, setLocale, t } = useLocale();
  const { colors, themeOverride, setThemeOverride } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [picker, setPicker] = useState<null | 'language' | 'timezone'>(null);
  // Country *names* (not ISO codes) so flagSvgForCountry resolves them — see
  // src/lib/countryFlags.ts, whose map is keyed by name.
  const localeCountry: Record<string, string> = { de: 'Germany', en: 'United Kingdom' };
  const themeOptions: { value: ThemeOverride; label: string; preview: string }[] = [
    { value: 'system', label: t.settings.themeSystem, preview: colors.surfaceAlt },
    { value: 'light', label: t.settings.themeLight, preview: '#F4F7FC' },
    { value: 'dark', label: t.settings.themeDark, preview: '#050C1C' },
  ];
  const currentLocale = SUPPORTED_LOCALES.find((l) => l.code === locale);
  const currentTz =
    timezoneOverride !== undefined ? TIMEZONE_OPTIONS.find((o) => (timezoneOverride ?? null) === o.value) : undefined;

  return (
    <>
      <Text style={styles.sectionTitle}>{t.settings.themeTitle}</Text>
      <View style={styles.themeCards}>
        {themeOptions.map((option) => {
          const active = option.value === themeOverride;
          return (
            <Pressable
              key={option.value}
              onPress={() => setThemeOverride(option.value)}
              style={({ pressed }) => [styles.themeCard, active && styles.themeCardActive, pressed && pressedStyle]}
            >
              <View style={[styles.themePreview, { backgroundColor: option.preview }]}>
                <View style={[styles.themePreviewDot, { backgroundColor: colors.accent }]} />
              </View>
              <Text style={styles.themeCardLabel}>{option.label}</Text>
              {active && (
                <View style={styles.themeCheck}>
                  <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>{t.settings.languageTitle}</Text>
      <Pressable onPress={() => setPicker('language')} style={({ pressed }) => [styles.dropdown, pressed && pressedStyle]}>
        <View style={styles.settingRowLabel}>
          <Flag country={localeCountry[locale]} height={14} />
          <Text style={styles.settingRowText}>{currentLocale?.label ?? ''}</Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>

      {timezoneOverride !== undefined && onTimezoneChange && (
        <>
          <Text style={styles.sectionTitle}>{t.profile.timezoneTitle}</Text>
          <Pressable onPress={() => setPicker('timezone')} style={({ pressed }) => [styles.dropdown, pressed && pressedStyle]}>
            <Text style={styles.settingRowText} numberOfLines={1}>
              {currentTz?.label[locale] ?? ''}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
          </Pressable>
        </>
      )}

      {biometric && (
        <>
          <Text style={styles.sectionTitle}>{t.profile.biometricLockTitle}</Text>
          <Pressable
            onPress={() => biometric.onChange(!biometric.enabled)}
            style={({ pressed }) => [styles.settingRow, biometric.enabled && styles.settingRowActive, pressed && pressedStyle]}
          >
            <Text style={styles.settingRowText}>{t.profile.biometricLockTitle}</Text>
            {biometric.enabled && <Ionicons name="checkmark" size={18} color={colors.accent} />}
          </Pressable>
        </>
      )}

      <FilterModal
        visible={picker === 'language'}
        title={t.settings.languageTitle}
        doneLabel={t.eventList.filterDone}
        onClose={() => setPicker(null)}
      >
        {SUPPORTED_LOCALES.map((option) => (
          <Pressable
            key={option.code}
            onPress={() => {
              setLocale(option.code);
              setPicker(null);
            }}
            style={({ pressed }) => [styles.settingRow, option.code === locale && styles.settingRowActive, pressed && pressedStyle]}
          >
            <View style={styles.settingRowLabel}>
              <Flag country={localeCountry[option.code]} height={14} />
              <Text style={styles.settingRowText}>{option.label}</Text>
            </View>
            {option.code === locale && <Ionicons name="checkmark" size={18} color={colors.accent} />}
          </Pressable>
        ))}
      </FilterModal>

      {timezoneOverride !== undefined && onTimezoneChange && (
        <FilterModal
          visible={picker === 'timezone'}
          title={t.profile.timezoneTitle}
          doneLabel={t.eventList.filterDone}
          onClose={() => setPicker(null)}
        >
          {TIMEZONE_OPTIONS.map((option) => (
            <Pressable
              key={option.value ?? 'device'}
              onPress={() => {
                onTimezoneChange(option.value);
                setPicker(null);
              }}
              style={({ pressed }) => [
                styles.settingRow,
                (timezoneOverride ?? null) === option.value && styles.settingRowActive,
                pressed && pressedStyle,
              ]}
            >
              <Text style={styles.settingRowText}>{option.label[locale]}</Text>
              {(timezoneOverride ?? null) === option.value && <Ionicons name="checkmark" size={18} color={colors.accent} />}
            </Pressable>
          ))}
        </FilterModal>
      )}
    </>
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

type SavedFighterItem = { fighter: Fighter };
type SavedEventItem = { event: EventListItem };
type SavedOrganizationItem = { organization: Organization };

type MerklisteData = {
  savedFighters: SavedFighterItem[];
  savedEvents: SavedEventItem[];
  savedOrganizations: SavedOrganizationItem[];
  loading: boolean;
  removeFighter: (id: string) => void;
  removeEvent: (id: string) => void;
  removeOrganization: (id: string) => void;
};

// Loads the unified saved_* list shown in the "Favoriten" tab. There is no
// longer a logged-in/logged-out branch: the list_saved_* RPCs return this
// device's rows UNION the logged-in user's rows, so the same three calls work
// in either state (the RPC reads auth.uid() and device_id itself). The `userId`
// arg only drives a reload when the auth state flips. The RPCs return bare ids;
// the objects are resolved via getFightersByIds etc.
function useMerkliste(userId: string | null): MerklisteData {
  const [savedFighters, setSavedFighters] = useState<SavedFighterItem[]>([]);
  const [savedEvents, setSavedEvents] = useState<SavedEventItem[]>([]);
  const [savedOrganizations, setSavedOrganizations] = useState<SavedOrganizationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    (async () => {
      const [fighterRows, eventRows, orgRows] = await Promise.all([
        getSavedFighters(),
        getSavedEvents(),
        getSavedOrganizations(),
      ]);
      const [fighters, events, organizations] = await Promise.all([
        getFightersByIds(fighterRows.map((r) => r.id)),
        getEventsByIds(eventRows.map((r) => r.id)),
        getOrganizationsByIds(orgRows.map((r) => r.id)),
      ]);
      const fighterById = new Map(fighters.map((f) => [f.id, f]));
      const eventById = new Map(events.map((e) => [e.id, e]));
      const orgById = new Map(organizations.map((o) => [o.id, o]));
      return {
        savedFighters: fighterRows.filter((r) => fighterById.has(r.id)).map((r) => ({ fighter: fighterById.get(r.id)! })),
        savedEvents: eventRows.filter((r) => eventById.has(r.id)).map((r) => ({ event: eventById.get(r.id)! })),
        savedOrganizations: orgRows
          .filter((r) => orgById.has(r.id))
          .map((r) => ({ organization: orgById.get(r.id)! })),
      };
    })()
      .then((res) => {
        setSavedFighters(res.savedFighters);
        setSavedEvents(res.savedEvents);
        setSavedOrganizations(res.savedOrganizations);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  // Reload every time the Profile tab regains focus, not just on mount — the
  // tab screen stays mounted, so saving on a detail or list screen would
  // otherwise not show here until an app restart.
  useFocusEffect(useCallback(() => load(), [load]));

  return {
    savedFighters,
    savedEvents,
    savedOrganizations,
    loading,
    removeFighter: (id) => setSavedFighters((prev) => prev.filter((x) => x.fighter.id !== id)),
    removeEvent: (id) => setSavedEvents((prev) => prev.filter((x) => x.event.id !== id)),
    removeOrganization: (id) => setSavedOrganizations((prev) => prev.filter((x) => x.organization.id !== id)),
  };
}

// The Konto / Merkliste / Einstellungen segmented control, shared by the
// logged-in and logged-out profile so both use identical tabs.
function SectionSwitcher({ section, onChange }: { section: ProfileSection; onChange: (section: ProfileSection) => void }) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const sections: { key: ProfileSection; label: string }[] = [
    { key: 'account', label: t.profile.sectionAccount },
    { key: 'favorites', label: t.profile.sectionFavorites },
    { key: 'settings', label: t.profile.sectionSettings },
  ];
  return (
    <View style={styles.switcher}>
      {sections.map((seg) => {
        const active = section === seg.key;
        return (
          <Pressable
            key={seg.key}
            onPress={() => onChange(seg.key)}
            style={({ pressed }) => [styles.switcherItem, active && styles.switcherItemActive, pressed && pressedStyle]}
          >
            <Text style={[styles.switcherText, active && styles.switcherTextActive]} numberOfLines={1}>
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// The full contents of the Favoriten tab: a plain list of everything saved with
// the heart, grouped by kind. Deliberately toggle-free — what gets notified is a
// per-category setting under Einstellungen (see NotificationPrefsSection), not a
// per-entry one. Presentational; the data comes from useMerkliste, so it renders
// identically for logged-in and logged-out users.
function FavoritesList({ data }: { data: MerklisteData }) {
  const { t, locale } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const { timezoneOverride } = useAuth();
  const { savedOrganizations, savedFighters, savedEvents, loading, removeFighter, removeEvent, removeOrganization } =
    data;

  const openFighter = (fighter: Fighter) =>
    navigation.navigate('FightersTab', {
      screen: 'FighterDetail',
      params: { fighterId: fighter.id, fighterName: fighter.name },
    });
  const openEvent = (event: EventListItem) =>
    navigation.navigate('EventsTab', {
      screen: 'EventDetail',
      params: { eventId: event.id, eventName: event.name },
    });

  return (
    <>
      <Text style={styles.sectionTitle}>{t.profile.savedOrganizationsTitle}</Text>
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : savedOrganizations.length === 0 ? (
        <Text style={styles.body}>{t.profile.noSavedOrganizations}</Text>
      ) : (
        savedOrganizations.map((item) => (
          <View key={item.organization.id} style={styles.listCard}>
            <View style={styles.listCardHeader}>
              <Text style={styles.listCardTitleInline}>{item.organization.short_name}</Text>
              <SaveHeart
                inline
                kind="organization"
                id={item.organization.id}
                active
                onToggle={(active) => !active && removeOrganization(item.organization.id)}
              />
            </View>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>{t.profile.savedFightersTitle}</Text>
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : savedFighters.length === 0 ? (
        <Text style={styles.body}>{t.profile.noSavedFighters}</Text>
      ) : (
        savedFighters.map((item) => (
          <View key={item.fighter.id} style={styles.listCard}>
            <View style={styles.listCardHeader}>
              <Pressable style={styles.listCardHeaderTitle} onPress={() => openFighter(item.fighter)}>
                <Text style={styles.listCardTitleInline}>{item.fighter.name}</Text>
              </Pressable>
              <SaveHeart
                inline
                kind="fighter"
                id={item.fighter.id}
                active
                onToggle={(active) => !active && removeFighter(item.fighter.id)}
              />
            </View>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>{t.profile.savedEventsTitle}</Text>
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : savedEvents.length === 0 ? (
        <Text style={styles.body}>{t.profile.noSavedEvents}</Text>
      ) : (
        savedEvents.map((item) => (
          <View key={item.event.id} style={styles.listCard}>
            <View style={styles.listCardHeader}>
              <Pressable style={styles.listCardHeaderTitle} onPress={() => openEvent(item.event)}>
                <Text style={styles.listCardTitleInline}>{item.event.name}</Text>
                <Text style={styles.listCardMeta}>
                  {formatEventDate(item.event.event_date, locale, undefined, timezoneOverride ?? undefined)}
                </Text>
              </Pressable>
              <SaveHeart
                inline
                kind="event"
                id={item.event.id}
                active
                onToggle={(active) => !active && removeEvent(item.event.id)}
              />
            </View>
          </View>
        ))
      )}
    </>
  );
}

// The five per-category notification switches, shown under Einstellungen. This
// is the ONLY place notifications are configured — grouped by category, not by
// saved entry (see 20260723165949_notification_prefs.sql for why).
//
// Prefs are device-anchored, so this renders logged in or out. When the OS
// permission was never granted the switches would be meaningless, so the whole
// block is replaced by a single hint — checked via hasNotificationPermission(),
// which reads the status without ever triggering the prompt.
function NotificationPrefsSection() {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [hasPush, setHasPush] = useState<boolean | null>(null);
  // Mirrors `prefs` so each toggle merges onto the latest value, not the render
  // that produced the handler — otherwise two quick toggles both read the same
  // stale `prefs` and the second write clobbers the first (locally and on the
  // server, since every write sends the whole object).
  const prefsRef = useRef<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);

  useEffect(() => {
    hasNotificationPermission().then(setHasPush);
    getNotificationPrefs().then((p) => {
      prefsRef.current = p;
      setPrefs(p);
    });
  }, []);

  // Optimistic: flip locally at once, persist in the background. A failed write
  // leaves the switch where the user put it and re-syncs on the next mount.
  const change = (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefs(next);
    setNotificationPrefs(next).catch(() => {});
  };

  return (
    <>
      <Text style={styles.sectionTitle}>{t.profile.notificationsTitle}</Text>
      <View style={styles.infoCard}>
        <Text style={[styles.body, styles.infoCardText]}>{t.profile.notificationsBody}</Text>
      </View>

      {hasPush === false ? (
        <Text style={styles.notifyNote}>{t.profile.notifyNeedsPermission}</Text>
      ) : (
        <>
          <Text style={styles.sectionTitle}>{t.profile.notifyCategoryFighters}</Text>
          <View style={styles.notifyGroup}>
            <NotifyToggle
              label={t.profile.notifyNewFight}
              value={prefs.notifyNewFight}
              onChange={(v) => change({ notifyNewFight: v })}
            />
            <NotifyToggle
              label={t.profile.notifyFightStart}
              value={prefs.notifyFightStart}
              onChange={(v) => change({ notifyFightStart: v })}
            />
            <NotifyToggle
              label={t.profile.notifyResult}
              value={prefs.notifyFightResult}
              onChange={(v) => change({ notifyFightResult: v })}
            />
          </View>

          <Text style={styles.sectionTitle}>{t.profile.notifyCategoryEvents}</Text>
          <View style={styles.notifyGroup}>
            <NotifyToggle
              label={t.profile.notifyEventStart}
              value={prefs.notifyEventStart}
              onChange={(v) => change({ notifyEventStart: v })}
            />
          </View>

          <Text style={styles.sectionTitle}>{t.profile.notifyCategoryLeagues}</Text>
          <View style={styles.notifyGroup}>
            <NotifyToggle
              label={t.profile.notifyLeagueStart}
              value={prefs.notifyLeagueStart}
              onChange={(v) => change({ notifyLeagueStart: v })}
            />
          </View>
        </>
      )}
    </>
  );
}

function NotifyToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.notifyRow}>
      <Text style={styles.notifyLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

// The logged-out profile: the same three-tab switcher as the logged-in view.
// Konto holds the auth form, Merkliste holds the anonymous saved_* list (same
// component as logged-in — the RPCs union device + account rows),
// Einstellungen holds theme/language.
function LoggedOutView() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [section, setSection] = useState<ProfileSection>('account');
  const merkliste = useMerkliste(null);

  return (
    <View style={styles.loggedIn}>
      <SectionSwitcher section={section} onChange={setSection} />
      {section === 'account' && <AuthPanel />}
      {section === 'favorites' && (
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="always">
          <FavoritesList data={merkliste} />
        </ScrollView>
      )}
      {section === 'settings' && (
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="always">
          <SettingsSection />
          <NotificationPrefsSection />
        </ScrollView>
      )}
    </View>
  );
}

// The auth form (login / signup / password reset / magic link / OAuth), shown
// under the Konto tab of the logged-out profile.
function AuthPanel() {
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
    signInWithGoogle,
    signInWithApple,
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
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

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

  const handleGoogleSignIn = async () => {
    setBusy(true);
    try {
      const result = await signInWithGoogle();
      if (result.status === 'error' && result.code !== 'oauth_cancelled') {
        showAuthError(t, result);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAppleSignIn = async () => {
    setBusy(true);
    try {
      const result = await signInWithApple();
      if (result.status === 'error' && result.code !== 'oauth_cancelled') {
        showAuthError(t, result);
      }
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
        <GuestCard />
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

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t.auth.orDivider}</Text>
          <View style={styles.dividerLine} />
        </View>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && pressedStyle]}
          onPress={handleGoogleSignIn}
          disabled={busy}
        >
          <View style={styles.oauthButtonContent}>
            <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
            <Text style={styles.buttonText}>{t.auth.googleButton}</Text>
          </View>
        </Pressable>
        {appleAvailable && (
          <Pressable
            style={({ pressed }) => [styles.button, pressed && pressedStyle]}
            onPress={handleAppleSignIn}
            disabled={busy}
          >
            <View style={styles.oauthButtonContent}>
              <Ionicons name="logo-apple" size={18} color={colors.textPrimary} />
              <Text style={styles.buttonText}>{t.auth.appleButton}</Text>
            </View>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LoggedInView({ userId, email }: { userId: string; email: string }) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [section, setSection] = useState<ProfileSection>('account');
  const { signOut, updateEmail, confirmEmailChange, updatePassword, timezoneOverride, setTimezoneOverride } = useAuth();
  const [nickname, setNickname] = useState('');
  const [nicknameLoading, setNicknameLoading] = useState(true);
  const [newEmail, setNewEmail] = useState(email);
  // Set once updateEmail() has sent a code — holds the address the code went
  // to, which is also the address verifyOtp must be called against.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [emailCode, setEmailCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const merkliste = useMerkliste(userId);

  useEffect(() => {
    isBiometricLockAvailable().then(setBiometricAvailable);
    isBiometricLockEnabled().then(setBiometricEnabled);
  }, []);

  const handleBiometricLockChange = async (enabled: boolean) => {
    await setBiometricLockEnabled(enabled);
    setBiometricEnabled(enabled);
  };

  useEffect(() => {
    getProfile(userId)
      .then((profile) => setNickname(profile?.nickname ?? ''))
      .finally(() => setNicknameLoading(false));
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
    const normalized = normalizeEmail(newEmail);
    setBusy(true);
    try {
      const result = await updateEmail(normalized);
      if (result.status === 'error') {
        showAuthError(t, result);
        return;
      }
      // The address isn't changed yet — a code went to the new address and
      // has to be confirmed before Auth applies it.
      setEmailCode('');
      setPendingEmail(normalized);
      Alert.alert(t.profile.changeEmailTitle, t.profile.changeEmailSaved);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmEmailChange = async () => {
    if (!pendingEmail) return;
    setBusy(true);
    try {
      const result = await confirmEmailChange(pendingEmail, emailCode);
      if (result.status === 'error') {
        showAuthError(t, result);
        return;
      }
      setPendingEmail(null);
      setEmailCode('');
      Alert.alert(t.profile.changeEmailTitle, t.profile.changeEmailConfirmed);
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

  const accountContent = (
    <>
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
        editable={pendingEmail === null}
      />
      {pendingEmail === null ? (
        <SubmitButton
          label={t.profile.changeEmailButton}
          busy={busy}
          onPress={handleSaveEmail}
          style={styles.button}
          textStyle={styles.buttonText}
          spinnerColor={colors.accent}
        />
      ) : (
        <>
          <Text style={styles.body}>{t.profile.changeEmailConfirmBody}</Text>
          <TextInput
            style={styles.input}
            placeholder={t.auth.codeLabel}
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={handleConfirmEmailChange}
            value={emailCode}
            onChangeText={setEmailCode}
          />
          <SubmitButton
            label={t.profile.changeEmailConfirmButton}
            busy={busy}
            onPress={handleConfirmEmailChange}
            style={styles.button}
            textStyle={styles.buttonText}
            spinnerColor={colors.accent}
          />
          <Pressable
            onPress={() => {
              setPendingEmail(null);
              setEmailCode('');
              setNewEmail(email);
            }}
            style={({ pressed }) => pressed && pressedStyle}
          >
            <Text style={styles.link}>{t.profile.changeEmailCancel}</Text>
          </Pressable>
        </>
      )}

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

      <Pressable style={({ pressed }) => [styles.logoutButton, pressed && pressedStyle]} onPress={signOut}>
        <Text style={styles.logoutButtonText}>{t.profile.logoutButton}</Text>
      </Pressable>
    </>
  );

  const settingsContent = (
    <>
      <SettingsSection
        timezoneOverride={timezoneOverride}
        onTimezoneChange={setTimezoneOverride}
        biometric={
          SHOW_BIOMETRIC_LOCK && biometricAvailable
            ? { enabled: biometricEnabled, onChange: handleBiometricLockChange }
            : undefined
        }
      />

      <NotificationPrefsSection />
    </>
  );

  return (
    <View style={styles.loggedIn}>
      <SectionSwitcher section={section} onChange={setSection} />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="always">
        {section === 'account' && accountContent}
        {section === 'favorites' && <FavoritesList data={merkliste} />}
        {section === 'settings' && settingsContent}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: { flex: 1 },
    loggedIn: { flex: 1 },
    form: { padding: spacing.lg },
    switcher: {
      flexDirection: 'row',
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.control,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 3,
      gap: 3,
    },
    switcherItem: { flex: 1, minHeight: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    switcherItemActive: { backgroundColor: colors.accent },
    switcherText: { ...typography.body, fontFamily: typography.label.fontFamily, color: colors.textSecondary },
    switcherTextActive: { color: '#FFFFFF' },
    infoCard: {
      padding: spacing.lg,
      borderRadius: radius.card,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    infoCardText: { marginBottom: 0 },
    title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md },
    sectionTitle: { ...typography.label, color: colors.textSecondary, marginTop: spacing.xl, marginBottom: spacing.sm },
    body: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
    input: {
      ...typography.body,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radius.control,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      color: colors.textPrimary,
      marginBottom: spacing.md,
      minHeight: minTapTarget,
    },
    button: {
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.accent,
      borderRadius: radius.control,
      minHeight: minTapTarget,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    buttonText: { ...typography.body, fontFamily: typography.label.fontFamily, color: colors.textPrimary },
    dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md, gap: spacing.sm },
    dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
    dividerText: { ...typography.meta, color: colors.textSecondary },
    oauthButtonContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    link: { ...typography.body, color: colors.link, textAlign: 'center', marginTop: spacing.sm },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      minHeight: minTapTarget,
      borderRadius: radius.control,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    settingRowActive: { borderColor: colors.accent },
    settingRowLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    settingRowText: { ...typography.body, color: colors.textPrimary },
    listCard: {
      padding: spacing.lg,
      borderRadius: radius.card,
      backgroundColor: colors.surface,
      marginBottom: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      position: 'relative',
    },
    listCardTitle: { ...typography.cardTitle, fontSize: 16, lineHeight: 20, color: colors.textPrimary, paddingRight: 56 },
    listCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    listCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
    listCardHeaderTitle: { flex: 1 },
    listCardTitleInline: { ...typography.cardTitle, fontSize: 16, lineHeight: 20, color: colors.textPrimary },
    listCardMeta: { ...typography.meta, color: colors.textSecondary, marginTop: 2 },
    notifyGroup: { marginTop: spacing.sm, gap: 2 },
    notifyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 },
    notifyLabel: { ...typography.body, color: colors.textSecondary },
    notifyNote: { ...typography.meta, color: colors.textSecondary, marginTop: spacing.sm },
    logoutButton: { marginTop: spacing.xl, minHeight: minTapTarget, alignItems: 'center', justifyContent: 'center' },
    logoutButtonText: { ...typography.body, fontFamily: typography.label.fontFamily, color: colors.danger },

    guestCard: {
      borderRadius: radius.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.alloyMuted,
      padding: spacing.md,
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    guestBadge: {
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderRadius: radius.control,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      marginBottom: spacing.sm,
    },
    guestBadgeText: { ...typography.caption, color: colors.alloy },
    guestAvatar: { marginBottom: spacing.xs },
    guestTitle: { ...typography.title, color: colors.alloy },
    guestSubtitle: { ...typography.meta, color: colors.alloyMuted, textAlign: 'center', marginTop: spacing.xs },

    themeCards: { flexDirection: 'row', gap: spacing.sm },
    themeCard: {
      flex: 1,
      borderRadius: radius.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      alignItems: 'center',
      gap: spacing.sm,
    },
    themeCardActive: { borderColor: colors.accent },
    themePreview: {
      width: '100%',
      height: 44,
      borderRadius: radius.control,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    themePreviewDot: { width: 14, height: 14, borderRadius: 7 },
    themeCardLabel: { ...typography.meta, color: colors.textPrimary },
    themeCheck: {
      position: 'absolute',
      top: spacing.xs,
      right: spacing.xs,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dropdown: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      minHeight: minTapTarget,
      borderRadius: radius.control,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
  });
