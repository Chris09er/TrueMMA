import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, minTapTarget, pressedStyle, radius, spacing, typography } from '../lib/theme';

type Props = {
  label: string;
  active: boolean;
  onPress: () => void;
};

// Multi-value filtering (org, weight class, nationality...) — as opposed to
// SegmentedControl, which is for switching an exclusive mode.
export default function FilterChip({ label, active, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active ? styles.chipActive : styles.chipInactive, pressed && pressedStyle]}
    >
      {/* No numberOfLines cap — a long German label grows the chip instead
          of being silently cut off. */}
      <Text style={active ? styles.textActive : styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    minHeight: minTapTarget,
    borderRadius: radius.lg,
    justifyContent: 'center',
    borderWidth: 1,
  },
  chipInactive: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accentGold,
    borderColor: colors.accentGold,
  },
  text: {
    ...typography.body,
    fontFamily: typography.label.fontFamily,
    fontSize: 13,
    color: colors.textSecondary,
  },
  textActive: {
    ...typography.body,
    fontFamily: typography.label.fontFamily,
    fontSize: 13,
    color: colors.background,
  },
});
