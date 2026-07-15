import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SUPPORTED_LOCALES, useLocale } from '../lib/i18n';
import { colors, radius, spacing } from '../lib/theme';

export default function LanguageScreen() {
  const { locale, setLocale, t } = useLocale();

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
              style={[styles.row, active && styles.rowActive]}
              onPress={() => setLocale(item.code)}
            >
              <Text style={styles.label}>{item.label}</Text>
              {active && <Ionicons name="checkmark" size={20} color={colors.accentGold} />}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderColor: colors.accentGold,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
