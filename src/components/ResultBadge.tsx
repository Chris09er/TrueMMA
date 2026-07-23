import { StyleSheet, Text, View } from 'react-native';
import { spacing, typography, useTheme } from '../lib/theme';

export type FightOutcome = 'win' | 'loss' | 'draw' | 'nc';

// Small colored pill for a fight result. Colors carry meaning (win green,
// loss red, draw orange, no-contest grey) — the one sanctioned use of
// green/orange outside the Blue Alloy palette, sourced from colors.outcome.
export default function ResultBadge({ outcome, label }: { outcome: FightOutcome; label: string }) {
  const { colors } = useTheme();
  const color = colors.outcome[outcome];
  return (
    <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  label: { ...typography.caption },
});
