import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { minTapTarget, pressedStyle, radius, spacing, typography, useTheme, type ColorTokens } from '../lib/theme';

type Segment<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
};

// For a small, exclusive, always-visible set of modes (list/calendar,
// today/upcoming/past) — visually distinct from FilterChip on purpose, so
// "this switches a mode" reads differently from "this filters a list".
export default function SegmentedControl<T extends string>({ segments, value, onChange }: Props<T>) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.track}>
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            onPress={() => onChange(segment.value)}
            style={({ pressed }) => [styles.segment, pressed && pressedStyle]}
          >
            {active && (
              <LinearGradient
                colors={colors.accentGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
            )}
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      gap: 3,
    },
    segment: {
      flex: 1,
      minHeight: minTapTarget - 8,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
      overflow: 'hidden',
    },
    label: {
      ...typography.meta,
      fontFamily: typography.label.fontFamily,
      color: colors.textSecondary,
    },
    labelActive: {
      color: colors.background,
    },
  });
