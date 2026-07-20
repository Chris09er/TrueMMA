import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Locale = 'de' | 'en';

export const SUPPORTED_LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

const STORAGE_KEY = 'true-mma:locale';
const DEFAULT_LOCALE: Locale = 'de';

// Add a new language by adding its code to Locale, an entry in SUPPORTED_LOCALES,
// and a matching translations object below with the same keys as `de`.
const translations = {
  de: {
    tabs: { events: 'Veranstaltungen', fighters: 'Kämpfer', contact: 'Kontakt', profile: 'Profil' },
    common: { loading: 'Lädt...', error: 'Fehler beim Laden', live: 'LIVE' },
    eventList: {
      title: 'True MMA',
      filterAll: 'Alle',
      filter: 'Filter',
      filterDone: 'Fertig',
      filterReset: 'Filter zurücksetzen',
      filterOrganization: 'Organisation',
      empty: 'Keine kommenden Events gefunden.',
      emptyPast: 'Keine vergangenen Events gefunden.',
      emptyToday: 'Heute keine Veranstaltung.',
      today: 'Heute',
      upcoming: 'Kommende',
      past: 'Vergangene',
      searchPlaceholder: 'Events suchen...',
      viewList: 'Liste',
      viewCalendar: 'Kalender',
      calendarEmptyDay: 'Keine Veranstaltung an diesem Tag.',
      calendarSelectDay: 'Tippe auf einen Tag mit Veranstaltung.',
    },
    eventDetail: {
      mainEvent: 'MAIN EVENT',
      prelimMainEvent: 'PRELIMS MAIN EVENT',
      cancelled: 'ABGESAGT',
      eventCancelled: 'Veranstaltung abgesagt',
      titleFight: 'TITLE FIGHT',
      emptyFightCard: 'Fight Card noch nicht verfügbar.',
      resultVia: 'via',
      round: 'Runde',
      rounds: 'Runden',
      earlyPrelims: 'Early Prelims',
      prelims: 'Prelims',
      mainCard: 'Main Card',
      votePick: 'Tippe',
      followOrganization: 'Liga folgen',
      unfollowOrganization: 'Liga entfolgen',
    },
    fighterList: {
      title: 'Kämpfer',
      empty: 'Keine Kämpfer gefunden.',
      searchPlaceholder: 'Kämpfer suchen...',
      filterAll: 'Alle',
      filter: 'Filter',
      filterDone: 'Fertig',
      filterReset: 'Filter zurücksetzen',
      filterOrganization: 'Organisation',
      filterWeightClass: 'Gewichtsklasse',
      filterWeightClassMen: 'Männer',
      filterWeightClassWomen: 'Frauen',
      filterNationality: 'Nationalität',
    },
    fighterDetail: {
      tapologyButton: 'Tapology-Profil',
      sherdogButton: 'Sherdog-Profil',
      upcomingFight: 'Nächster Kampf',
      fightHistory: 'Kampfhistorie',
      noFightHistory: 'Keine vergangenen Kämpfe bekannt.',
      resultWin: 'Sieg',
      resultLoss: 'Niederlage',
      vs: 'gegen',
      taleOfTheTape: 'Kämpferdaten',
      weightClass: 'Gewichtsklasse',
      height: 'Größe',
      reach: 'Reichweite',
      stance: 'Kampfhaltung',
      dateOfBirth: 'Geburtsdatum',
      birthPlace: 'Geburtsort',
    },
    settings: {
      title: 'Einstellungen',
      languageTitle: 'Sprache',
      themeTitle: 'Darstellung',
      themeSystem: 'System',
      themeLight: 'Hell',
      themeDark: 'Dunkel',
    },
    contact: {
      title: 'Kontakt',
      body: 'Fragen, Feedback oder Fehler gefunden? Schreib uns.',
      emailButton: 'E-Mail schreiben',
      noMailClientTitle: 'Kein E-Mail-Programm gefunden',
      noMailClientBody: 'Bitte kopiere die Adresse oben manuell und schreib uns von einer anderen App aus.',
    },
    notifications: {
      permissionDeniedTitle: 'Benachrichtigungen deaktiviert',
      permissionDeniedBody: 'Bitte erlaube Benachrichtigungen in den Geräteeinstellungen, um Erinnerungen zu erhalten.',
      eventReminderTitle: 'Es geht los!',
      eventReminderBody: (eventName: string) => `${eventName} beginnt jetzt.`,
      genericErrorTitle: 'Das hat nicht geklappt',
      genericErrorBody: 'Bitte versuche es später erneut.',
      fighterFollowOnTitle: 'Erinnerung aktiviert',
      fighterFollowOnBody: 'Du bekommst eine Push-Benachrichtigung, sobald dieser Kämpfer für einen neuen Kampf angesetzt wird.',
      fighterFollowOffTitle: 'Erinnerung deaktiviert',
      fighterFollowOffBody: 'Du wirst nicht mehr benachrichtigt, wenn dieser Kämpfer für einen neuen Kampf angesetzt wird.',
      eventReminderOnTitle: 'Erinnerung aktiviert',
      eventReminderOnBody: 'Du bekommst eine Benachrichtigung auf diesem Gerät, sobald die Veranstaltung beginnt.',
      eventReminderOffTitle: 'Erinnerung deaktiviert',
      eventReminderOffBody: 'Du wirst nicht mehr benachrichtigt, wenn die Veranstaltung beginnt.',
      organizationFollowOnTitle: 'Liga-Erinnerung aktiviert',
      organizationFollowOnBody: 'Du wirst benachrichtigt, sobald eine Veranstaltung dieser Liga beginnt.',
      organizationFollowOffTitle: 'Liga-Erinnerung deaktiviert',
      organizationFollowOffBody: 'Du wirst nicht mehr benachrichtigt, wenn eine Veranstaltung dieser Liga beginnt.',
    },
    auth: {
      emailLabel: 'E-Mail',
      passwordLabel: 'Passwort',
      newPasswordLabel: 'Neues Passwort',
      loginTitle: 'Anmelden',
      loginButton: 'Anmelden',
      signupTitle: 'Konto erstellen',
      signupButton: 'Konto erstellen',
      switchToSignup: 'Noch kein Konto? Jetzt registrieren',
      switchToLogin: 'Schon ein Konto? Jetzt anmelden',
      forgotPassword: 'Passwort vergessen?',
      forgotPasswordTitle: 'Passwort zurücksetzen',
      forgotPasswordBody: 'Wir senden dir einen Code per E-Mail, mit dem du ein neues Passwort setzen kannst.',
      sendCodeButton: 'Code senden',
      codeLabel: 'Code',
      resetPasswordButton: 'Passwort setzen',
      backToLogin: 'Zurück zur Anmeldung',
      signupSuccess: 'Konto erstellt. Bitte bestätige deine E-Mail-Adresse, dann kannst du dich anmelden.',
      resetCodeSent: 'Code wurde per E-Mail gesendet.',
      resetSuccess: 'Passwort wurde geändert. Du bist jetzt angemeldet.',
      errorTitle: 'Das hat nicht geklappt',
      errorBody: 'Bitte überprüfe deine Eingaben und versuche es erneut.',
    },
    profile: {
      title: 'Profil',
      logoutButton: 'Abmelden',
      nicknameLabel: 'Nickname',
      nicknameSave: 'Speichern',
      nicknameTaken: 'Dieser Nickname ist schon vergeben.',
      nicknameSaved: 'Nickname gespeichert.',
      changeEmailTitle: 'E-Mail ändern',
      changeEmailButton: 'E-Mail ändern',
      changeEmailSaved: 'Bestätigungslink an die neue Adresse gesendet.',
      changePasswordTitle: 'Passwort ändern',
      changePasswordButton: 'Passwort ändern',
      changePasswordSaved: 'Passwort geändert.',
      timezoneTitle: 'Zeitzone',
      followedFightersTitle: 'Gefolgte Kämpfer',
      followedEventsTitle: 'Gefolgte Veranstaltungen',
      followedOrganizationsTitle: 'Gefolgte Ligen',
      noFollowedFighters: 'Du folgst noch keinem Kämpfer.',
      noFollowedEvents: 'Du folgst noch keiner Veranstaltung.',
      noFollowedOrganizations: 'Du folgst noch keiner Liga.',
      favoritedFightersTitle: 'Favorisierte Kämpfer',
      favoritedEventsTitle: 'Favorisierte Veranstaltungen',
      noFavoritedFighters: 'Du hast noch keine Kämpfer favorisiert.',
      noFavoritedEvents: 'Du hast noch keine Veranstaltungen favorisiert.',
    },
  },
  en: {
    tabs: { events: 'Events', fighters: 'Fighters', contact: 'Contact', profile: 'Profile' },
    common: { loading: 'Loading...', error: 'Failed to load', live: 'LIVE' },
    eventList: {
      title: 'True MMA',
      filterAll: 'All',
      filter: 'Filter',
      filterDone: 'Done',
      filterReset: 'Reset filters',
      filterOrganization: 'Organization',
      empty: 'No upcoming events found.',
      emptyPast: 'No past events found.',
      emptyToday: 'No event today.',
      today: 'Today',
      upcoming: 'Upcoming',
      past: 'Past',
      searchPlaceholder: 'Search events...',
      viewList: 'List',
      viewCalendar: 'Calendar',
      calendarEmptyDay: 'No event on this day.',
      calendarSelectDay: 'Tap a day with an event.',
    },
    eventDetail: {
      mainEvent: 'MAIN EVENT',
      prelimMainEvent: 'PRELIMS MAIN EVENT',
      cancelled: 'CANCELLED',
      eventCancelled: 'Event cancelled',
      titleFight: 'TITLE FIGHT',
      emptyFightCard: 'Fight card not available yet.',
      resultVia: 'via',
      round: 'Round',
      rounds: 'rounds',
      earlyPrelims: 'Early Prelims',
      prelims: 'Prelims',
      mainCard: 'Main Card',
      votePick: 'Pick',
      followOrganization: 'Follow league',
      unfollowOrganization: 'Unfollow league',
    },
    fighterList: {
      title: 'Fighters',
      empty: 'No fighters found.',
      searchPlaceholder: 'Search fighters...',
      filterAll: 'All',
      filter: 'Filter',
      filterDone: 'Done',
      filterReset: 'Reset filters',
      filterOrganization: 'Organization',
      filterWeightClass: 'Weight class',
      filterWeightClassMen: 'Men',
      filterWeightClassWomen: 'Women',
      filterNationality: 'Nationality',
    },
    fighterDetail: {
      tapologyButton: 'Tapology profile',
      sherdogButton: 'Sherdog profile',
      upcomingFight: 'Next fight',
      fightHistory: 'Fight history',
      noFightHistory: 'No past fights on record.',
      resultWin: 'Win',
      resultLoss: 'Loss',
      vs: 'vs',
      taleOfTheTape: 'Tale of the Tape',
      weightClass: 'Weight class',
      height: 'Height',
      reach: 'Reach',
      stance: 'Stance',
      dateOfBirth: 'Date of birth',
      birthPlace: 'Birth place',
    },
    settings: {
      title: 'Settings',
      languageTitle: 'Language',
      themeTitle: 'Appearance',
      themeSystem: 'System',
      themeLight: 'Light',
      themeDark: 'Dark',
    },
    contact: {
      title: 'Contact',
      body: 'Questions, feedback, or found a bug? Get in touch.',
      emailButton: 'Send email',
      noMailClientTitle: 'No email app found',
      noMailClientBody: 'Please copy the address above manually and reach out from another app.',
    },
    notifications: {
      permissionDeniedTitle: 'Notifications disabled',
      permissionDeniedBody: 'Please allow notifications in your device settings to receive reminders.',
      eventReminderTitle: "It's starting!",
      eventReminderBody: (eventName: string) => `${eventName} is starting now.`,
      genericErrorTitle: "That didn't work",
      genericErrorBody: 'Please try again later.',
      fighterFollowOnTitle: 'Reminder enabled',
      fighterFollowOnBody: "You'll get a push notification as soon as this fighter is booked for a new fight.",
      fighterFollowOffTitle: 'Reminder disabled',
      fighterFollowOffBody: "You won't be notified anymore when this fighter is booked for a new fight.",
      eventReminderOnTitle: 'Reminder enabled',
      eventReminderOnBody: "You'll get a notification on this device as soon as the event starts.",
      eventReminderOffTitle: 'Reminder disabled',
      eventReminderOffBody: "You won't be notified anymore when the event starts.",
      organizationFollowOnTitle: 'League reminder enabled',
      organizationFollowOnBody: "You'll be notified as soon as an event from this league starts.",
      organizationFollowOffTitle: 'League reminder disabled',
      organizationFollowOffBody: "You won't be notified anymore when an event from this league starts.",
    },
    auth: {
      emailLabel: 'Email',
      passwordLabel: 'Password',
      newPasswordLabel: 'New password',
      loginTitle: 'Log in',
      loginButton: 'Log in',
      signupTitle: 'Create account',
      signupButton: 'Create account',
      switchToSignup: "Don't have an account? Sign up",
      switchToLogin: 'Already have an account? Log in',
      forgotPassword: 'Forgot password?',
      forgotPasswordTitle: 'Reset password',
      forgotPasswordBody: "We'll send you a code by email that lets you set a new password.",
      sendCodeButton: 'Send code',
      codeLabel: 'Code',
      resetPasswordButton: 'Set password',
      backToLogin: 'Back to login',
      signupSuccess: 'Account created. Please confirm your email address, then you can log in.',
      resetCodeSent: 'Code sent by email.',
      resetSuccess: "Password changed. You're now logged in.",
      errorTitle: "That didn't work",
      errorBody: 'Please check your input and try again.',
    },
    profile: {
      title: 'Profile',
      logoutButton: 'Log out',
      nicknameLabel: 'Nickname',
      nicknameSave: 'Save',
      nicknameTaken: 'That nickname is already taken.',
      nicknameSaved: 'Nickname saved.',
      changeEmailTitle: 'Change email',
      changeEmailButton: 'Change email',
      changeEmailSaved: 'Confirmation link sent to the new address.',
      changePasswordTitle: 'Change password',
      changePasswordButton: 'Change password',
      changePasswordSaved: 'Password changed.',
      timezoneTitle: 'Timezone',
      followedFightersTitle: 'Followed fighters',
      followedEventsTitle: 'Followed events',
      followedOrganizationsTitle: 'Followed leagues',
      noFollowedFighters: "You're not following any fighters yet.",
      noFollowedEvents: "You're not following any events yet.",
      noFollowedOrganizations: "You're not following any leagues yet.",
      favoritedFightersTitle: 'Favorited fighters',
      favoritedEventsTitle: 'Favorited events',
      noFavoritedFighters: "You haven't favorited any fighters yet.",
      noFavoritedEvents: "You haven't favorited any events yet.",
    },
  },
} satisfies Record<Locale, unknown>;

export type Translations = typeof translations.de;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'de' || stored === 'en') {
        setLocaleState(stored);
      }
    });
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: translations[locale] }),
    [locale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider');
  return ctx;
}
