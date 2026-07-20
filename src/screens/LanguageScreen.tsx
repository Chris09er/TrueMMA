import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SUPPORTED_LOCALES, useLocale } from '../lib/i18n';
import { pressedStyle, radius, spacing, useTheme, type ColorTokens } from '../lib/theme';

export default function LanguageScreen() {
  const { locale, setLocale, t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.list}
        data={SUPPORTED_LOCALES}
        keyExtractor={(item) => item.code}
        renderItem={({ item }) => {
          const active = item.code === locale;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && pressedStyle]}
              onPress={() => setLocale(item.code)}
            >
              <View style={styles.labelRow}>
                <Text style={styles.flag}>{item.flag}</Text>
                <Text style={styles.label}>{item.label}</Text>
              </View>
              {active && <Ionicons name="checkmark" size={20} color={colors.accent} />}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    list: {
      padding: spacing.md,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 14,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowActive: {
      borderColor: colors.accent,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    flag: {
      fontSize: 20,
    },
    label: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
  });
