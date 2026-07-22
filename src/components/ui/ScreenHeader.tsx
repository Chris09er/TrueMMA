import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { minTapTarget, spacing, typography, useTheme } from '../../lib/theme';

type Props = {
  /** Left zone (back button, or brand). */
  left?: ReactNode;
  /** Right zone (actions). */
  right?: ReactNode;
  /** Centered uppercase title (e.g. "FIGHTER"). Ignored if `center` is given. */
  title?: string;
  /** Custom centered content (e.g. a brand mark). */
  center?: ReactNode;
};

/**
 * App header with three balanced zones (left / center / right). The left and
 * right zones share equal flex so the centered title/brand stays centered
 * regardless of how many actions each side holds.
 */
export default function ScreenHeader({ left, right, title, center }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.divider }]}>
      <View style={[styles.side, styles.left]}>{left}</View>
      <View style={styles.center}>
        {center ??
          (title ? (
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null)}
      </View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: minTapTarget },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  center: { flexShrink: 1, alignItems: 'center' },
  title: { ...typography.label, fontSize: 14, letterSpacing: 1 },
});
