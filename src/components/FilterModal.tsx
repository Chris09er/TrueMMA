import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, pressedStyle, radius, spacing, typography } from '../lib/theme';

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
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} style={({ pressed }) => pressed && pressedStyle} hitSlop={8}>
              <Text style={styles.close}>{doneLabel}</Text>
            </Pressable>
          </View>

          <ScrollView>{children}</ScrollView>

          {showReset && (
            <Pressable
              style={({ pressed }) => [styles.resetButton, pressed && pressedStyle]}
              onPress={onReset}
            >
              <Text style={styles.resetButtonText}>{resetLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

export function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '80%',
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
    color: colors.accentGold,
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
