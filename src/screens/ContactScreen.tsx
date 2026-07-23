import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ContactStackParamList } from '../navigation';
import { useLocale } from '../lib/i18n';
import { pressedStyle, radius, spacing, typography, useTheme, type ColorTokens } from '../lib/theme';
import FilterChip from '../components/FilterChip';
import { Button, LogoMark, Screen, ScreenHeader } from '../components/ui';

const CONTACT_EMAIL = 'support@true-mma.com';

export default function ContactScreen() {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<ContactStackParamList>>();

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

        <Text
          style={styles.emailLink}
          selectable
          onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
        >
          {CONTACT_EMAIL}
        </Text>

        <View style={styles.legalRow}>
          <Pressable
            onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}
            hitSlop={8}
            style={({ pressed }) => pressed && pressedStyle}
          >
            <Text style={styles.legalLink}>{t.contact.privacyLink}</Text>
          </Pressable>
          <Text style={styles.legalSeparator}>·</Text>
          <Pressable
            onPress={() => navigation.navigate('Legal', { doc: 'imprint' })}
            hitSlop={8}
            style={({ pressed }) => pressed && pressedStyle}
          >
            <Text style={styles.legalLink}>{t.contact.imprintLink}</Text>
          </Pressable>
        </View>
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
    emailLink: { ...typography.meta, color: colors.link, textAlign: 'center', marginTop: spacing.lg },
    legalRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xl,
    },
    legalLink: { ...typography.meta, color: colors.link },
    legalSeparator: { ...typography.meta, color: colors.textSecondary },
  });
