import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { FightersStackParamList } from '../navigation';
import { getFighters } from '../lib/queries';
import { getFighterFavoriteIds } from '../lib/favorites';
import type { Fighter } from '../lib/types';
import { colors, commonStyles, radius, spacing } from '../lib/theme';
import { useLocale } from '../lib/i18n';
import FighterFollowBell from '../components/FighterFollowBell';
import FighterFavoriteHeart from '../components/FighterFavoriteHeart';
import FilterButton from '../components/FilterButton';

type Props = NativeStackScreenProps<FightersStackParamList, 'FighterList'>;

export default function FighterListScreen({ navigation }: Props) {
  const { t } = useLocale();
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [search, setSearch] = useState('');
  const [selectedNationality, setSelectedNationality] = useState<string | undefined>(undefined);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFighters = useCallback(async () => {
    setError(null);
    try {
      setFighters(await getFighters());
    } catch {
      setError(t.common.error);
    }
  }, [t]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadFighters(), getFighterFavoriteIds().then(setFavoriteIds)]).finally(() => setLoading(false));
  }, [loadFighters]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadFighters(), getFighterFavoriteIds().then(setFavoriteIds)]);
    setRefreshing(false);
  }, [loadFighters]);

  const handleFavoriteToggle = useCallback((fighterId: string, active: boolean) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (active) next.add(fighterId);
      else next.delete(fighterId);
      return next;
    });
  }, []);

  const nationalities = useMemo(() => {
    const set = new Set<string>();
    for (const fighter of fighters) {
      if (fighter.nationality) set.add(fighter.nationality);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [fighters]);

  const visibleFighters = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = fighters.filter((fighter) => {
      const matchesQuery =
        !query ||
        fighter.name.toLowerCase().includes(query) ||
        fighter.nickname?.toLowerCase().includes(query);
      const matchesNationality = !selectedNationality || fighter.nationality === selectedNationality;
      return matchesQuery && matchesNationality;
    });
    // Stable sort — favorited fighters first, existing (alphabetical) order
    // preserved within each group.
    return [...filtered].sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)));
  }, [fighters, search, selectedNationality, favoriteIds]);

  if (loading) {
    return <ActivityIndicator style={commonStyles.center} color={colors.textPrimary} />;
  }

  if (error) {
    return <Text style={commonStyles.error}>{error}</Text>;
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={visibleFighters}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t.fighterList.searchPlaceholder}
            placeholderTextColor={colors.textSecondary}
            style={styles.searchInput}
          />
          {nationalities.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <FilterButton
                label={t.fighterList.filterAll}
                active={selectedNationality === undefined}
                onPress={() => setSelectedNationality(undefined)}
              />
              {nationalities.map((nationality) => (
                <FilterButton
                  key={nationality}
                  label={nationality}
                  active={selectedNationality === nationality}
                  onPress={() => setSelectedNationality(nationality)}
                />
              ))}
            </ScrollView>
          )}
        </>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.textPrimary}
          colors={[colors.accentGold]}
        />
      }
      ListEmptyComponent={<Text style={commonStyles.empty}>{t.fighterList.empty}</Text>}
      renderItem={({ item }) => (
        <Pressable
          style={styles.card}
          onPress={() => navigation.navigate('FighterDetail', { fighterId: item.id, fighterName: item.name })}
        >
          <FighterFollowBell fighterId={item.id} />
          <FighterFavoriteHeart
            fighterId={item.id}
            onToggle={(active) => handleFavoriteToggle(item.id, active)}
          />
          <Text style={styles.name}>{item.name}</Text>
          {(item.nickname || item.nationality) && (
            <Text style={styles.meta}>
              {[item.nickname && `"${item.nickname}"`, item.nationality].filter(Boolean).join(' · ')}
            </Text>
          )}
        </Pressable>
      )}
    />
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
  searchInput: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
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
    paddingRight: 56,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
