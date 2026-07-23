import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, tabularNums, typography, useTheme } from '../../lib/theme';

export type StatRow = {
  label: string;
  value: string;
  /** Optional right-aligned secondary value (e.g. a percentage). */
  trailing?: string;
};

/**
 * Bordered stat table (fighter detail). Label in Inter uppercase, value in
 * body with tabular numerals so columns align; optional trailing metric.
 */
export default function StatTable({ rows }: { rows: StatRow[] }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.table, { borderColor: colors.border }]}>
      {rows.map((row, i) => (
        <View
          key={row.label}
          style={[
            styles.row,
            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
          ]}
        >
          <Text style={[styles.label, { color: colors.textSecondary }]}>{row.label}</Text>
          <Text style={[styles.value, { color: colors.textPrimary }]}>{row.value}</Text>
          {row.trailing != null ? (
            <Text style={[styles.trailing, { color: colors.textSecondary }]}>{row.trailing}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 46,
    gap: spacing.md,
  },
  // Fixed label width so every value starts at the same x (aligned column);
  // long German labels wrap within it rather than shoving the value around.
  label: { ...typography.label, width: 128 },
  value: { ...typography.compact, ...tabularNums, flex: 1 },
  trailing: { ...typography.meta, ...tabularNums },
});
