import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { pressedStyle, radius, spacing, useTheme } from '../../lib/theme';

type Props = {
  children: ReactNode;
  /** Adds the 3pt Blue-Alloy top edge for promoted/active content. */
  promoted?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
};

/**
 * Quiet surface card: thin border, 14pt radius, 16pt inset. Standard cards are
 * calm; pass `promoted` for the 3pt accent top edge reserved for
 * promoted/active content (handoff System rules).
 */
export default function Card({ children, promoted = false, onPress, style }: Props) {
  const { colors } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    overflow: 'hidden',
  };
  const inner = (
    <>
      {promoted && <View style={[styles.topEdge, { backgroundColor: colors.accent }]} />}
      {children}
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && pressedStyle, style]}>
        {inner}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{inner}</View>;
}

const styles = StyleSheet.create({
  topEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
});
