import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import { radius, spacing, useTheme } from '../../lib/theme';

// Calm, static skeletons — deliberately no perpetual shimmer (handoff).

export function SkeletonBlock({
  width = '100%',
  height = 14,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  return (
    <View style={[{ width, height, borderRadius: radius.control, backgroundColor: colors.surfaceAlt }, style]} />
  );
}

/** Placeholder matching an event/fighter card while data loads. */
export function SkeletonCard() {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <SkeletonBlock width={80} height={10} />
      <SkeletonBlock width="60%" height={18} style={{ marginTop: spacing.sm }} />
      <SkeletonBlock width="45%" height={12} style={{ marginTop: spacing.sm }} />
      <SkeletonBlock width="70%" height={12} style={{ marginTop: spacing.md }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    marginBottom: 10,
  },
});
