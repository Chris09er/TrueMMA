import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { translations, type Locale, type Translations } from './translations';
import { supabase } from './supabase';

export type { Locale, Translations };

export const SUPPORTED_LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

const STORAGE_KEY = 'true-mma:locale';
const DEFAULT_LOCALE: Locale = 'de';

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
    // Keep auth.users.user_metadata.locale in sync for logged-in users, so a
    // server-side process (e.g. a future auth-email Edge Function, see
    // docs/ARCHITECTURE.md's Login/Profile section) can read the user's
    // language without access to this device's AsyncStorage. Called directly
    // on the supabase client rather than via useAuth()/AuthProvider, since
    // LocaleProvider sits above AuthProvider in App.tsx's provider tree and
    // has no access to its context.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        supabase.auth.updateUser({ data: { locale: next } }).catch(() => {});
      }
    });
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
