import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { getFighters } from '../lib/queries';
import type { Fighter } from '../lib/types';
import { colors, radius, spacing } from '../lib/theme';
import { useLocale } from '../lib/i18n';
import FighterFollowBell from '../components/FighterFollowBell';

export default function FighterListScreen() {
  const { t } = useLocale();
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFighters()
      .then(setFighters)
      .catch(() => setError(t.common.error))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) {
    return <ActivityIndicator style={styles.center} color={colors.textPrimary} />;
  }

  if (error) {
    return <Text style={styles.error}>{error}</Text>;
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={fighters}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Text style={styles.empty}>{t.fighterList.empty}</Text>}
      renderItem={({ item }) => {
        const url = item.tapology_url ?? item.sherdog_url;
        return (
          <Pressable
            style={styles.card}
            onPress={() => url && Linking.openURL(url)}
            disabled={!url}
          >
            <FighterFollowBell fighterId={item.id} />
            <Text style={styles.name}>{item.name}</Text>
            {(item.nickname || item.nationality) && (
              <Text style={styles.meta}>
                {[item.nickname && `"${item.nickname}"`, item.nationality].filter(Boolean).join(' · ')}
              </Text>
            )}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    marginTop: 40,
  },
  error: {
    padding: spacing.lg,
    color: colors.danger,
  },
  empty: {
    padding: spacing.lg,
    color: colors.textSecondary,
  },
  list: {
    padding: spacing.md,
  },
  card: {
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
    paddingRight: 28,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
