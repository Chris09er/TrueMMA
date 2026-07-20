import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light';
export type ThemeOverride = ThemeMode | 'system';

const THEME_STORAGE_KEY = 'true-mma:themeOverride';

export type ColorTokens = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  /** Primary brand accent ("Chrome & Indigo") — active/interactive state. */
  accent: string;
  /** Secondary accent — links, lower-emphasis highlights. */
  accentSecondary: string;
  /** Deliberately a different hue from `accent` so an active filter never reads as an error state. */
  danger: string;
  /** "On air" red for the live badge — kept separate from `danger` since live is urgent, not negative. */
  live: string;
  link: string;
  /**
   * Two-stop diagonal gradient for filled-accent surfaces (active
   * SegmentedControl segment, active FilterChip, title-fight tag, vote-bar
   * fill) — a lighter sheen into a deeper steel-blue, for a brushed-metal
   * feel instead of a flat fill. Use sparingly (feedback: "ohne zu
   * aufregend zu werden") — not every accent-colored element needs it, the
   * flat `accent` value still exists for smaller/text-level uses.
   */
  accentGradient: [string, string];
};

const darkColors: ColorTokens = {
  background: '#0b0d14',
  surface: '#14171f',
  surfaceAlt: '#1c202b',
  border: '#2a2f3d',
  textPrimary: '#f3f4f7',
  textSecondary: '#99a0b3',
  accent: '#4f8cff',
  accentSecondary: '#9aa5b8',
  danger: '#ff4d6d',
  live: '#ff3b3b',
  link: '#9aa5b8',
  accentGradient: ['#8fb3ff', '#3a5bc7'],
};

const lightColors: ColorTokens = {
  background: '#f5f6fa',
  surface: '#ffffff',
  surfaceAlt: '#eceef4',
  border: '#dde1ea',
  textPrimary: '#12141c',
  textSecondary: '#5b6272',
  accent: '#3a5bff',
  accentSecondary: '#5c6b85',
  danger: '#e0335a',
  live: '#e02020',
  link: '#5c6b85',
  accentGradient: ['#6b8bff', '#28469e'],
};

export const palettes: Record<ThemeMode, ColorTokens> = { dark: darkColors, light: lightColors };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
};

// iOS HIG (44pt) / Material (48dp) minimum — tappables should size against
// this, not an arbitrary minHeight.
export const minTapTarget = 44;

// Shared press-feedback style — pass to Pressable's style function:
// style={({ pressed }) => [base, pressed && pressedStyle]}
export const pressedStyle = { opacity: 0.6 } as const;

export const fontFamily = {
  displayBold: 'BarlowCondensed_700Bold',
  displaySemiBold: 'BarlowCondensed_600SemiBold',
  bodyRegular: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
};

export const typography = {
  display: { fontFamily: fontFamily.displayBold, fontSize: 28, lineHeight: 32 },
  title: { fontFamily: fontFamily.displaySemiBold, fontSize: 22, lineHeight: 26 },
  cardTitle: { fontFamily: fontFamily.displaySemiBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fontFamily.bodyRegular, fontSize: 15, lineHeight: 20 },
  meta: { fontFamily: fontFamily.bodyRegular, fontSize: 13, lineHeight: 18 },
  label: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  caption: { fontFamily: fontFamily.bodySemiBold, fontSize: 11, lineHeight: 14, letterSpacing: 0.5 },
};

// Fixed to the dark palette — only for the brief window before `App.tsx`
// has loaded fonts and mounted `ThemeProvider` (no context/useColorScheme
// available yet). Every screen/component past that point uses useTheme().
export const colors = darkColors;

// --- Theme context (dark/light, system-driven by default, overridable) --
type ThemeContextValue = {
  mode: ThemeMode;
  colors: ColorTokens;
  themeOverride: ThemeOverride;
  setThemeOverride: (next: ThemeOverride) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: darkColors,
  themeOverride: 'system',
  setThemeOverride: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [themeOverride, setThemeOverrideState] = useState<ThemeOverride>('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored === 'dark' || stored === 'light' || stored === 'system') {
        setThemeOverrideState(stored);
      }
    });
  }, []);

  const setThemeOverride = (next: ThemeOverride) => {
    setThemeOverrideState(next);
    AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
  };

  const mode: ThemeMode = themeOverride === 'system' ? (scheme === 'light' ? 'light' : 'dark') : themeOverride;
  const value = useMemo(
    () => ({ mode, colors: palettes[mode], themeOverride, setThemeOverride }),
    [mode, themeOverride]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

// Theme-aware replacement for the legacy `commonStyles` export — same
// shape/usage (`commonStyles.center` / `.error` / `.empty`), so migrating a
// screen is just swapping the import for this hook call.
export function useCommonStyles() {
  const { colors: themeColors } = useTheme();
  return useMemo(
    () => ({
      center: { marginTop: 40 },
      error: { padding: spacing.lg, color: themeColors.danger },
      empty: { padding: spacing.lg, color: themeColors.textSecondary },
    }),
    [themeColors]
  );
}
