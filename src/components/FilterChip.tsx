import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { minTapTarget, pressedStyle, radius, typography, useTheme, type ColorTokens } from '../lib/theme';

type Props = {
  label: string;
  active: boolean;
  onPress: () => void;
};

// Multi-value filtering (org, weight class, nationality...) — as opposed to
// SegmentedControl, which is for switching an exclusive mode.
export default function FilterChip({ label, active, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, !active && styles.chipInactive, pressed && pressedStyle]}
    >
      {active && (
        <LinearGradient
          colors={colors.accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      )}
      {/* No numberOfLines cap — a long German label grows the chip instead
          of being silently cut off. */}
      <Text style={active ? styles.textActive : styles.text}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    chip: {
      paddingHorizontal: 14,
      minHeight: minTapTarget,
      borderRadius: radius.lg,
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.accent,
      overflow: 'hidden',
    },
    chipInactive: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
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
