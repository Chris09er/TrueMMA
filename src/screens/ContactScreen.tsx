import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocale } from '../lib/i18n';
import { colors, radius, spacing } from '../lib/theme';

const CONTACT_EMAIL = 'support@true-mma.com';

export default function ContactScreen() {
  const { t } = useLocale();

  return (
    <View style={styles.container}>
      <Text style={styles.body}>{t.contact.body}</Text>
      <Pressable
        style={styles.button}
        onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
      >
        <Text style={styles.buttonText}>{t.contact.emailButton}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  body: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
});
