import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { minTapTarget, pressedStyle, radius, typography, useTheme, type ColorTokens } from '../../lib/theme';

// Compact filter trigger — a funnel icon sized to the control tokens, sitting
// beside a search field. Shows a cobalt count badge when filters are active.
export default function FilterIconButton({
  count = 0,
  onPress,
  label,
}: {
  count?: number;
  onPress: () => void;
  label: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const active = count > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, active && styles.buttonActive, pressed && pressedStyle]}
    >
      <MaterialCommunityIcons name="filter-variant" size={22} color={active ? colors.accent : colors.textSecondary} />
      {active && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    button: {
      width: minTapTarget,
      minHeight: minTapTarget,
      borderRadius: radius.control,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonActive: { borderColor: colors.accent },
    badge: {
      position: 'absolute',
      top: 4,
      right: 4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { ...typography.caption, color: '#FFFFFF' },
  });
