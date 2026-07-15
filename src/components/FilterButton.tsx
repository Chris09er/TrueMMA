import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';

type Props = {
  label: string;
  active: boolean;
  onPress: () => void;
};

export default function FilterButton({ label, active, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={[styles.button, active && styles.buttonActive]}>
      <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  buttonActive: {
    backgroundColor: colors.textPrimary,
  },
  text: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  textActive: {
    color: colors.background,
  },
});
