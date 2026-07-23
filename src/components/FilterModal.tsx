import { useMemo, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { pressedStyle, radius, spacing, typography, useTheme, type ColorTokens } from '../lib/theme';

type Props = {
  visible: boolean;
  title: string;
  doneLabel: string;
  onClose: () => void;
  showReset?: boolean;
  resetLabel?: string;
  onReset?: () => void;
  children: ReactNode;
};

// Shared bottom-sheet shell for both EventListScreen's (organization-only)
// and FighterListScreen's (org/weight class/nationality) filter modals —
// previously each screen had its own bespoke modal styling.
export default function FilterModal({
  visible,
  title,
  doneLabel,
  onClose,
  showReset,
  resetLabel,
  onReset,
  children,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Tapping the dimmed backdrop closes the sheet; the sheet itself is a
          Pressable that swallows taps so they don't bubble up and close it. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} style={({ pressed }) => pressed && pressedStyle} hitSlop={8}>
              <Text style={styles.close}>{doneLabel}</Text>
            </Pressable>
          </View>

          {/* flexShrink: 1 — RN's default flexShrink is 0, so without this
              the ScrollView takes its full content height regardless of the
              sheet's maxHeight, and the overflow is clipped instead of
              scrollable (bottom content becomes unreachable/untappable). */}
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            {children}
          </ScrollView>

          {showReset && (
            <Pressable
              style={({ pressed }) => [styles.resetButton, pressed && pressedStyle]}
              onPress={onReset}
            >
              <Text style={styles.resetButtonText}>{resetLabel}</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.hero,
      borderTopRightRadius: radius.hero,
      padding: spacing.lg,
      maxHeight: '80%',
    },
    scrollArea: {
      flexShrink: 1,
    },
    scrollContent: {
      paddingBottom: spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    title: {
      ...typography.title,
      fontSize: 18,
      lineHeight: 22,
      color: colors.textPrimary,
    },
    close: {
      ...typography.body,
      fontFamily: typography.label.fontFamily,
      color: colors.accent,
    },
    section: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      ...typography.label,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    resetButton: {
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
    resetButtonText: {
      ...typography.body,
      fontFamily: typography.label.fontFamily,
      color: colors.danger,
    },
  });
