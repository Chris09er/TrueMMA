import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Locale = 'de' | 'en';

export const SUPPORTED_LOCALES: { code: Locale; label: string }[] = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
];

const STORAGE_KEY = 'mma-pocket:locale';
const DEFAULT_LOCALE: Locale = 'de';

// Add a new language by adding its code to Locale, an entry in SUPPORTED_LOCALES,
// and a matching translations object below with the same keys as `de`.
const translations = {
  de: {
    tabs: { events: 'Veranstaltungen', fighters: 'Kämpfer', language: 'Sprache', contact: 'Kontakt' },
    common: { loading: 'Lädt...', error: 'Fehler beim Laden' },
    eventList: {
      title: 'MMA Pocket',
      filterAll: 'Alle',
      empty: 'Keine kommenden Events gefunden.',
      emptyPast: 'Keine vergangenen Events gefunden.',
      upcoming: 'Kommende',
      past: 'Vergangene',
      searchPlaceholder: 'Events suchen...',
    },
    eventDetail: {
      mainEvent: 'MAIN EVENT',
      titleFight: 'TITLE FIGHT',
      emptyFightCard: 'Fight Card noch nicht verfügbar.',
      resultVia: 'via',
      round: 'Runde',
    },
    fighterList: {
      title: 'Kämpfer',
      empty: 'Keine Kämpfer gefunden.',
      searchPlaceholder: 'Kämpfer suchen...',
    },
    language: {
      title: 'Sprache',
    },
    contact: {
      title: 'Kontakt',
      body: 'Fragen, Feedback oder Fehler gefunden? Schreib uns.',
      emailButton: 'E-Mail schreiben',
    },
    notifications: {
      permissionDeniedTitle: 'Benachrichtigungen deaktiviert',
      permissionDeniedBody: 'Bitte erlaube Benachrichtigungen in den Geräteeinstellungen, um Erinnerungen zu erhalten.',
      eventReminderTitle: 'Es geht los!',
      eventReminderBody: (eventName: string) => `${eventName} beginnt jetzt.`,
      genericErrorTitle: 'Das hat nicht geklappt',
      genericErrorBody: 'Bitte versuche es später erneut.',
    },
  },
  en: {
    tabs: { events: 'Events', fighters: 'Fighters', language: 'Language', contact: 'Contact' },
    common: { loading: 'Loading...', error: 'Failed to load' },
    eventList: {
      title: 'MMA Pocket',
      filterAll: 'All',
      empty: 'No upcoming events found.',
      emptyPast: 'No past events found.',
      upcoming: 'Upcoming',
      past: 'Past',
      searchPlaceholder: 'Search events...',
    },
    eventDetail: {
      mainEvent: 'MAIN EVENT',
      titleFight: 'TITLE FIGHT',
      emptyFightCard: 'Fight card not available yet.',
      resultVia: 'via',
      round: 'Round',
    },
    fighterList: {
      title: 'Fighters',
      empty: 'No fighters found.',
      searchPlaceholder: 'Search fighters...',
    },
    language: {
      title: 'Language',
    },
    contact: {
      title: 'Contact',
      body: 'Questions, feedback, or found a bug? Get in touch.',
      emailButton: 'Send email',
    },
    notifications: {
      permissionDeniedTitle: 'Notifications disabled',
      permissionDeniedBody: 'Please allow notifications in your device settings to receive reminders.',
      eventReminderTitle: "It's starting!",
      eventReminderBody: (eventName: string) => `${eventName} is starting now.`,
      genericErrorTitle: "That didn't work",
      genericErrorBody: 'Please try again later.',
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
