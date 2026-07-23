import { useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocale } from '../lib/i18n';
import { radius, spacing, typography, useTheme, type ColorTokens } from '../lib/theme';
import FilterChip from '../components/FilterChip';
import { Button, LogoMark, Screen, ScreenHeader } from '../components/ui';

const CONTACT_EMAIL = 'support@true-mma.com';

export default function ContactScreen() {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const topics = [
    { key: 'general', label: t.contact.topicGeneral },
    { key: 'bug', label: t.contact.topicBug },
    { key: 'feedback', label: t.contact.topicFeedback },
  ];
  const [topic, setTopic] = useState('general');
  const [message, setMessage] = useState('');

  const handleSend = async () => {
    const topicLabel = topics.find((x) => x.key === topic)?.label ?? '';
    const subject = `[True MMA] ${topicLabel}`;
    const canOpen = await Linking.canOpenURL(`mailto:${CONTACT_EMAIL}`);
    if (!canOpen) {
      Alert.alert(t.contact.noMailClientTitle, t.contact.noMailClientBody);
      return;
    }
    Linking.openURL(
      `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
    );
  };

  return (
    <Screen>
      <ScreenHeader left={<LogoMark size={26} />} title={t.contact.title.toUpperCase()} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.body}>{t.contact.body}</Text>

        <Text style={styles.label}>{t.contact.topicTitle}</Text>
        <View style={styles.chipRow}>
          {topics.map((x) => (
            <FilterChip key={x.key} label={x.label} active={topic === x.key} onPress={() => setTopic(x.key)} />
          ))}
        </View>

        <TextInput
          style={styles.message}
          placeholder={t.contact.messagePlaceholder}
          placeholderTextColor={colors.textSecondary}
          value={message}
          onChangeText={setMessage}
          multiline
          textAlignVertical="top"
        />

        <Button
          label={t.contact.sendButton}
          onPress={handleSend}
          disabled={message.trim().length === 0}
          fullWidth
        />

        <Text style={styles.emailHint} selectable>
          {CONTACT_EMAIL}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    scroll: { padding: spacing.lg },
    body: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
    label: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.sm },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    message: {
      ...typography.body,
      minHeight: 120,
      padding: spacing.md,
      borderRadius: radius.control,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      color: colors.textPrimary,
      marginBottom: spacing.lg,
    },
    emailHint: { ...typography.meta, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
  });
