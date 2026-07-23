import { StyleSheet, Text, View } from 'react-native';
import { spacing, typography, useTheme } from '../../lib/theme';

/** Uppercase section label followed by a hairline divider (e.g. TODAY ————). */
export default function SectionHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.line, { backgroundColor: colors.divider }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl, marginBottom: spacing.md },
  label: { ...typography.label },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
