import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export type ThemeMode = 'dark' | 'light';

type ColorTokens = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  /** Primary brand accent ("Ember") — active/interactive state, replaces the old ad hoc gold/white split. */
  accent: string;
  /** Secondary accent ("Steel") — links, lower-emphasis highlights. */
  accentSecondary: string;
  /** Deliberately a different hue from `accent` so an active filter never reads as an error state. */
  danger: string;
  /** "On air" red for the live badge — kept separate from `danger` since live is urgent, not negative. */
  live: string;
  link: string;
};

const darkColors: ColorTokens = {
  background: '#0e1013',
  surface: '#171a1e',
  surfaceAlt: '#20242a',
  border: '#2c3138',
  textPrimary: '#f4f5f6',
  textSecondary: '#9aa3ad',
  accent: '#ff5a36',
  accentSecondary: '#5b8ba8',
  danger: '#ff4468',
  live: '#ff2d2d',
  link: '#5b8ba8',
};

const lightColors: ColorTokens = {
  background: '#f6f5f3',
  surface: '#ffffff',
  surfaceAlt: '#eceae7',
  border: '#ddd9d4',
  textPrimary: '#16181a',
  textSecondary: '#5c6169',
  accent: '#e64a26',
  accentSecondary: '#3f7691',
  danger: '#e0335a',
  live: '#e02020',
  link: '#3f7691',
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

// --- Legacy flat exports -----------------------------------------------
// Fixed to the dark palette. Every screen/component still imports these
// directly (see AGENTS.md redesign: Komponenten-System / Screen-für-Screen
// stages migrate them to useTheme() one at a time). Remove once nothing
// imports `colors` from here anymore.
export const colors = {
  ...darkColors,
  // Old name for `accent`, still referenced by ~30 call sites across
  // screens/components. Same value — keeps those call sites on the new
  // Ember accent without a rewrite; drop once they're migrated to useTheme().
  accentGold: darkColors.accent,
};
export const commonStyles = {
  center: {
    marginTop: 40,
  },
  error: {
    padding: spacing.lg,
    color: colors.danger,
  },
  empty: {
    padding: spacing.lg,
    color: colors.textSecondary,
  },
} as const;

// --- Theme context (dark/light, system-driven) --------------------------
type ThemeContextValue = {
  mode: ThemeMode;
  colors: ColorTokens;
};

const ThemeContext = createContext<ThemeContextValue>({ mode: 'dark', colors: darkColors });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const mode: ThemeMode = scheme === 'light' ? 'light' : 'dark';
  const value = useMemo(() => ({ mode, colors: palettes[mode] }), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
