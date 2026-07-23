import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, type TextStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light';
export type ThemeOverride = ThemeMode | 'system';

const THEME_STORAGE_KEY = 'true-mma:themeOverride';

// --- Blue Alloy design tokens (see docs/DESIGN_HANDOFF.md) -----------------
// Single brand direction: Blue Alloy, shipping in a Dark and a fully
// equivalent Light theme. The dark hex values are taken verbatim from the
// handoff; the light palette is derived to be an equivalent Blue Alloy.
export type ColorTokens = {
  background: string;
  surface: string;
  surfaceAlt: string;
  /** Hairline separators. Same value as `divider`; both names kept so screens
   * reading `border` and new components reading `divider` share one token. */
  border: string;
  divider: string;
  textPrimary: string;
  textSecondary: string;
  /** Primary interactive cobalt — active/interactive state (handoff #2367C9). */
  accent: string;
  /** Lower-emphasis accent for secondary highlights. */
  accentSecondary: string;
  /** Focus ring / link (Carbon & Ice: bright ice `accent.ice`). */
  focus: string;
  link: string;
  /** Foreground for content sitting ON an `accent`/`accentGradient` fill.
   * The ice accent is light, so filled chips/segments/buttons need dark text —
   * this is that token (dark on light theme accent uses white instead). */
  onAccent: string;
  /**
   * Metallic "alloy" tones — RESERVED for the logo and rare premium accents
   * (handoff #D8DEE7 / #7D8A9B). Do not use as general text/surface colors.
   */
  alloy: string;
  alloyMuted: string;
  /** Error/validation red. Deliberately not brand-red trade dress. */
  danger: string;
  /** "On air" red for the live badge — urgent, not negative; kept separate. */
  live: string;
  /**
   * Fight-outcome semantics for result badges (Win/Loss/Draw/NC). Deliberately
   * outside the Blue Alloy palette — these carry meaning (win green, loss red,
   * draw orange, no-contest grey) and are the one sanctioned use of green/orange.
   */
  outcome: { win: string; loss: string; draw: string; nc: string };
  /**
   * Subtle, static deep-navy background gradient (two stops, top -> bottom)
   * used as the global screen background treatment. Restrained by design.
   */
  backgroundGradient: [string, string];
  /**
   * Two-stop diagonal gradient for filled-accent surfaces (active
   * SegmentedControl segment, active FilterChip, promoted tag) — a lighter
   * cobalt sheen into deeper steel-blue for a brushed-metal feel. Use
   * sparingly; the flat `accent` still exists for smaller/text-level uses.
   */
  accentGradient: [string, string];
};

// --- Carbon & Ice — Frost Haze (dark) --------------------------------------
// Token values from docs/DESIGN_HANDOFF.md. Carbon surfaces, a lighter/airier
// desaturated ice-blue accent, no bright cobalt wash. `outcome` (WIN/LOSS/
// DRAW/NC) is deliberately left on its own semantic palette, unchanged.
const darkColors: ColorTokens = {
  background: '#151B20',
  surface: '#1E2A33',
  surfaceAlt: '#263543',
  border: '#3A515D',
  divider: '#3A515D',
  textPrimary: '#F3F7FA',
  textSecondary: '#B8CBD7',
  accent: '#7FB6CF',
  accentSecondary: '#8299A7',
  focus: '#B9D8E8',
  link: '#B9D8E8',
  onAccent: '#151B20',
  alloy: '#D8DEE7',
  alloyMuted: '#8299A7',
  danger: '#E5484D',
  live: '#F04438',
  outcome: { win: '#3FB950', loss: '#E5484D', draw: '#E3873C', nc: '#7D8A9B' },
  backgroundGradient: ['#22323D', '#151B20'],
  accentGradient: ['#A9D2E4', '#7FB6CF'],
};

// Light equivalent of Carbon & Ice — DERIVED (the handoff specifies dark only).
// Airy cool-grey canvas, a deeper ice accent so white `onAccent` text reads.
const lightColors: ColorTokens = {
  background: '#EEF3F6',
  surface: '#FFFFFF',
  surfaceAlt: '#E1EAEF',
  border: '#C4D2DA',
  divider: '#C4D2DA',
  textPrimary: '#16222B',
  textSecondary: '#47606E',
  accent: '#3E7186',
  accentSecondary: '#6E8493',
  focus: '#2C6A82',
  link: '#2C6A82',
  onAccent: '#FFFFFF',
  alloy: '#8593A6',
  alloyMuted: '#5A6A82',
  danger: '#C4362F',
  live: '#D13A2E',
  outcome: { win: '#2DA44E', loss: '#C4362F', draw: '#C2711F', nc: '#5A6A82' },
  backgroundGradient: ['#FFFFFF', '#DDE8EE'],
  accentGradient: ['#4E7C90', '#335466'],
};

export const palettes: Record<ThemeMode, ColorTokens> = { dark: darkColors, light: lightColors };

// 8-point spacing grid (handoff): 8, 12, 16, 24, 32. `xs` (4) is retained for
// sub-grid micro-gaps (icon/text pairs), everything larger sits on the grid.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

// Semantic radii (handoff): controls 10, cards 14, hero 20.
export const radius = {
  control: 10,
  card: 14,
  hero: 20,
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

// Type scale from the handoff. Barlow Condensed for display/headings/fighter
// names; Inter for body, labels, dates, tables, records.
export const typography = {
  display: { fontFamily: fontFamily.displayBold, fontSize: 32, lineHeight: 36 },
  // "section" heading (handoff 24/28) — key kept as `title` for continuity.
  title: { fontFamily: fontFamily.displaySemiBold, fontSize: 24, lineHeight: 28 },
  cardTitle: { fontFamily: fontFamily.displaySemiBold, fontSize: 19, lineHeight: 23 },
  body: { fontFamily: fontFamily.bodyRegular, fontSize: 16, lineHeight: 24 },
  compact: { fontFamily: fontFamily.bodyRegular, fontSize: 14, lineHeight: 20 },
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

// Spread onto numeric Text (times, dates, records, rankings, data columns) so
// digits share a fixed width and columns line up (handoff: tabular numerals).
export const tabularNums: TextStyle = { fontVariant: ['tabular-nums'] };

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
// screen is just swapping the import for this hook call. Superseded
// incrementally by the EmptyState/ErrorState components in the redesign.
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
