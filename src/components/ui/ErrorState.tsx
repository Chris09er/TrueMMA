import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Button from './Button';
import { spacing, typography, useTheme } from '../../lib/theme';

type Props = {
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
};

/** Error with an icon, explanatory text, and a retry — never colour alone. */
export default function ErrorState({ message, retryLabel, onRetry }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.danger} />
      <Text style={[styles.message, { color: colors.textPrimary }]}>{message}</Text>
      {retryLabel && onRetry ? (
        <Button
          label={retryLabel}
          variant="secondary"
          icon="refresh"
          onPress={onRetry}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, gap: spacing.sm },
  message: { ...typography.body, textAlign: 'center' },
});
