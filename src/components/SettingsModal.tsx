import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SUPPORTED_LOCALES, useLocale } from '../lib/i18n';
import { TIMEZONE_OPTIONS } from '../lib/timezones';
import {
  pressedStyle,
  radius,
  spacing,
  typography,
  useTheme,
  type ColorTokens,
  type ThemeOverride,
} from '../lib/theme';
import FilterModal from './FilterModal';

type Props = {
  visible: boolean;
  onClose: () => void;
  // Timezone only applies to logged-in users (stored server-side on their
  // profile, see auth.tsx) — omit both props to hide the section entirely.
  timezoneOverride?: string | null;
  onTimezoneChange?: (timezone: string | null) => void;
};

export default function SettingsModal({ visible, onClose, timezoneOverride, onTimezoneChange }: Props) {
  const { locale, setLocale, t } = useLocale();
  const { colors, themeOverride, setThemeOverride } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const themeOptions: { value: ThemeOverride; label: string }[] = [
    { value: 'system', label: t.settings.themeSystem },
    { value: 'light', label: t.settings.themeLight },
    { value: 'dark', label: t.settings.themeDark },
  ];

  return (
    <FilterModal visible={visible} title={t.settings.title} doneLabel={t.eventList.filterDone} onClose={onClose}>
      <Text style={styles.sectionTitle}>{t.settings.languageTitle}</Text>
      {SUPPORTED_LOCALES.map((option) => {
        const active = option.code === locale;
        return (
          <Pressable
            key={option.code}
            style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && pressedStyle]}
            onPress={() => setLocale(option.code)}
          >
            <View style={styles.rowLabel}>
              <Text style={styles.flag}>{option.flag}</Text>
              <Text style={styles.rowText}>{option.label}</Text>
            </View>
            {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
          </Pressable>
        );
      })}

      <Text style={styles.sectionTitle}>{t.settings.themeTitle}</Text>
      {themeOptions.map((option) => {
        const active = option.value === themeOverride;
        return (
          <Pressable
            key={option.value}
            style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && pressedStyle]}
            onPress={() => setThemeOverride(option.value)}
          >
            <Text style={styles.rowText}>{option.label}</Text>
            {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
          </Pressable>
        );
      })}

      {timezoneOverride !== undefined && onTimezoneChange && (
        <>
          <Text style={styles.sectionTitle}>{t.profile.timezoneTitle}</Text>
          {TIMEZONE_OPTIONS.map((option) => {
            const active = (timezoneOverride ?? null) === option.value;
            return (
              <Pressable
                key={option.value ?? 'device'}
                style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && pressedStyle]}
                onPress={() => onTimezoneChange(option.value)}
              >
                <Text style={styles.rowText}>{option.label[locale]}</Text>
                {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
              </Pressable>
            );
          })}
        </>
      )}
    </FilterModal>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    sectionTitle: {
      ...typography.label,
      color: colors.textSecondary,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 14,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowActive: {
      borderColor: colors.accent,
    },
    rowLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    flag: {
      fontSize: 20,
    },
    rowText: {
      ...typography.body,
      color: colors.textPrimary,
    },
  });
