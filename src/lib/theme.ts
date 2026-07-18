export const colors = {
  background: '#0d0d0f',
  surface: '#1a1a1d',
  surfaceAlt: '#242427',
  border: '#2e2e32',
  textPrimary: '#f2f2f2',
  textSecondary: '#a3a3a8',
  accent: '#f2f2f2',
  accentGold: '#c9a24b',
  danger: '#ff6b6b',
  link: '#7fb8ff',
};

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

// Shared by every list/detail screen for their loading/error/empty states,
// so a visual tweak (e.g. spacing) only needs to change in one place.
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
