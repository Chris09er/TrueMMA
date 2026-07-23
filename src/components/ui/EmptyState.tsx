import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Button from './Button';
import { spacing, typography, useTheme } from '../../lib/theme';

type Props = {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  message?: string;
  /** Optional useful action (handoff: empty states include a useful action). */
  actionLabel?: string;
  onAction?: () => void;
};

export default function EmptyState({ icon = 'inbox-outline', title, message, actionLabel, onAction }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <MaterialCommunityIcons name={icon} size={40} color={colors.textSecondary} />
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} style={{ marginTop: spacing.md }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, gap: spacing.sm },
  title: { ...typography.cardTitle, textAlign: 'center' },
  message: { ...typography.body, textAlign: 'center' },
});
