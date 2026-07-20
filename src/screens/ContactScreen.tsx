import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocale } from '../lib/i18n';
import { colors, pressedStyle, radius, spacing } from '../lib/theme';

const CONTACT_EMAIL = 'support@true-mma.com';

export default function ContactScreen() {
  const { t } = useLocale();

  const handleEmailPress = async () => {
    const url = `mailto:${CONTACT_EMAIL}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      Alert.alert(t.contact.noMailClientTitle, t.contact.noMailClientBody);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.body}>{t.contact.body}</Text>
      <Text style={styles.email} selectable>
        {CONTACT_EMAIL}
      </Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && pressedStyle]}
        onPress={handleEmailPress}
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
  email: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
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
