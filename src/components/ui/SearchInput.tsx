import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { minTapTarget, radius, spacing, typography, useTheme } from '../../lib/theme';

/** Search field with a leading magnifier icon, styled to the control tokens. */
export default function SearchInput(props: TextInputProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <MaterialCommunityIcons name="magnify" size={20} color={colors.textSecondary} />
      <TextInput
        placeholderTextColor={colors.textSecondary}
        {...props}
        style={[styles.input, { color: colors.textPrimary }, props.style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: minTapTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, ...typography.body, paddingVertical: 0 },
});
