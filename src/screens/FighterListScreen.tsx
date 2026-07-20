import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { FightersStackParamList } from '../navigation';
import { abbreviateWeightClass, getFighters, getOrganizations, sortWeightClasses, weightClassRank } from '../lib/queries';
import { getFighterFavoriteIds } from '../lib/favorites';
import type { Fighter, Organization } from '../lib/types';
import { pressedStyle, radius, spacing, typography, useCommonStyles, useTheme, type ColorTokens } from '../lib/theme';
import { useLocale } from '../lib/i18n';
import Flag from '../components/Flag';
import FighterFollowBell from '../components/FighterFollowBell';
import FighterFavoriteHeart from '../components/FighterFavoriteHeart';
import FilterChip from '../components/FilterChip';
import FilterModal, { FilterSection } from '../components/FilterModal';

type FighterSort = 'name' | 'weight' | 'record' | 'nationality';

type Props = NativeStackScreenProps<FightersStackParamList, 'FighterList'>;

export default function FighterListScreen({ navigation }: Props) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const commonStyles = useCommonStyles();
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [search, setSearch] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  const [selectedWeightClass, setSelectedWeightClass] = useState<string | undefined>(undefined);
  const [selectedNationality, setSelectedNationality] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<FighterSort>('name');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
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
    getOrganizations().then(setOrganizations).catch(() => {});
  }, []);

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

  const weightClassesMen = useMemo(() => {
    const set = new Set<string>();
    for (const fighter of fighters) {
      if (fighter.weight_class && !fighter.weight_class.startsWith("Women's")) set.add(fighter.weight_class);
    }
    return sortWeightClasses([...set]);
  }, [fighters]);

  const weightClassesWomen = useMemo(() => {
    const set = new Set<string>();
    for (const fighter of fighters) {
      if (fighter.weight_class?.startsWith("Women's")) set.add(fighter.weight_class);
    }
    return sortWeightClasses([...set]);
  }, [fighters]);

  const activeFilterCount = [selectedOrgId, selectedWeightClass, selectedNationality].filter(Boolean).length;

  const resetFilters = () => {
    setSelectedOrgId(undefined);
    setSelectedWeightClass(undefined);
    setSelectedNationality(undefined);
  };

  const visibleFighters = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = fighters.filter((fighter) => {
      const matchesQuery =
        !query ||
        fighter.name.toLowerCase().includes(query) ||
        fighter.nickname?.toLowerCase().includes(query);
      const matchesOrg = !selectedOrgId || fighter.primary_organization_id === selectedOrgId;
      const matchesWeightClass = !selectedWeightClass || fighter.weight_class === selectedWeightClass;
      const matchesNationality = !selectedNationality || fighter.nationality === selectedNationality;
      return matchesQuery && matchesOrg && matchesWeightClass && matchesNationality;
    });
    // Favorited fighters always float to the top (a deliberate feature); the
    // chosen sort key orders within each group. Name is the tiebreaker for
    // every non-name key so the order is fully deterministic.
    return [...filtered].sort((a, b) => {
      const fav = Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id));
      if (fav !== 0) return fav;
      switch (sortBy) {
        case 'weight': {
          const diff = weightClassRank(a.weight_class) - weightClassRank(b.weight_class);
          return diff !== 0 ? diff : a.name.localeCompare(b.name);
        }
        case 'record': {
          // Most wins first; unknown records (null) rank last.
          const diff = (b.record_wins ?? -1) - (a.record_wins ?? -1);
          return diff !== 0 ? diff : a.name.localeCompare(b.name);
        }
        case 'nationality': {
          // '￿' sorts fighters with no nationality to the end.
          const diff = (a.nationality ?? '￿').localeCompare(b.nationality ?? '￿');
          return diff !== 0 ? diff : a.name.localeCompare(b.name);
        }
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [fighters, search, selectedOrgId, selectedWeightClass, selectedNationality, sortBy, favoriteIds]);

  const sortOptions: { value: FighterSort; label: string }[] = [
    { value: 'name', label: t.fighterList.sortName },
    { value: 'weight', label: t.fighterList.sortWeight },
    { value: 'record', label: t.fighterList.sortRecord },
    { value: 'nationality', label: t.fighterList.sortNationality },
  ];

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
          <Pressable
            style={({ pressed }) => [styles.filterOpenButton, pressed && pressedStyle]}
            onPress={() => setFilterModalVisible(true)}
          >
            <Text style={styles.filterOpenButtonText}>
              {activeFilterCount > 0 ? `${t.fighterList.filter} (${activeFilterCount})` : t.fighterList.filter}
            </Text>
          </Pressable>

          <FilterModal
            visible={filterModalVisible}
            title={t.fighterList.filter}
            doneLabel={t.fighterList.filterDone}
            onClose={() => setFilterModalVisible(false)}
            showReset={activeFilterCount > 0}
            resetLabel={t.fighterList.filterReset}
            onReset={resetFilters}
          >
            <FilterSection title={t.fighterList.sortBy}>
              {sortOptions.map((option) => (
                <FilterChip
                  key={option.value}
                  label={option.label}
                  active={sortBy === option.value}
                  onPress={() => setSortBy(option.value)}
                />
              ))}
            </FilterSection>

            {organizations.length > 0 && (
              <FilterSection title={t.fighterList.filterOrganization}>
                <FilterChip
                  label={t.fighterList.filterAll}
                  active={selectedOrgId === undefined}
                  onPress={() => setSelectedOrgId(undefined)}
                />
                {organizations.map((org) => (
                  <FilterChip
                    key={org.id}
                    label={org.short_name}
                    active={selectedOrgId === org.id}
                    onPress={() => setSelectedOrgId(org.id)}
                  />
                ))}
              </FilterSection>
            )}

            {(weightClassesMen.length > 0 || weightClassesWomen.length > 0) && (
              <FilterSection title={t.fighterList.filterWeightClass}>
                <FilterChip
                  label={t.fighterList.filterAll}
                  active={selectedWeightClass === undefined}
                  onPress={() => setSelectedWeightClass(undefined)}
                />
              </FilterSection>
            )}

            {weightClassesMen.length > 0 && (
              <FilterSection title={t.fighterList.filterWeightClassMen}>
                {weightClassesMen.map((weightClass) => (
                  <FilterChip
                    key={weightClass}
                    label={weightClass}
                    active={selectedWeightClass === weightClass}
                    onPress={() => setSelectedWeightClass(weightClass)}
                  />
                ))}
              </FilterSection>
            )}

            {weightClassesWomen.length > 0 && (
              <FilterSection title={t.fighterList.filterWeightClassWomen}>
                {weightClassesWomen.map((weightClass) => (
                  <FilterChip
                    key={weightClass}
                    label={weightClass.replace(/^Women's /, '')}
                    active={selectedWeightClass === weightClass}
                    onPress={() => setSelectedWeightClass(weightClass)}
                  />
                ))}
              </FilterSection>
            )}

            {nationalities.length > 0 && (
              <FilterSection title={t.fighterList.filterNationality}>
                <FilterChip
                  label={t.fighterList.filterAll}
                  active={selectedNationality === undefined}
                  onPress={() => setSelectedNationality(undefined)}
                />
                {nationalities.map((nationality) => (
                  <FilterChip
                    key={nationality}
                    label={nationality}
                    leading={<Flag country={nationality} height={12} />}
                    active={selectedNationality === nationality}
                    onPress={() => setSelectedNationality(nationality)}
                  />
                ))}
              </FilterSection>
            )}
          </FilterModal>
        </>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.textPrimary}
          colors={[colors.accent]}
        />
      }
      ListEmptyComponent={<Text style={commonStyles.empty}>{t.fighterList.empty}</Text>}
      renderItem={({ item }) => {
        const weightAbbr = abbreviateWeightClass(item.weight_class);
        const metaText = [item.nickname && `"${item.nickname}"`, item.nationality].filter(Boolean).join(' · ');
        return (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && pressedStyle]}
            onPress={() => navigation.navigate('FighterDetail', { fighterId: item.id, fighterName: item.name })}
          >
            <FighterFollowBell fighterId={item.id} />
            <FighterFavoriteHeart
              fighterId={item.id}
              onToggle={(active) => handleFavoriteToggle(item.id, active)}
            />
            <Text style={styles.name}>{item.name}</Text>
            {(metaText.length > 0 || weightAbbr) && (
              <View style={styles.metaRow}>
                <Flag country={item.nationality} height={13} />
                {weightAbbr && (
                  <View style={styles.weightBadge}>
                    <Text style={styles.weightBadgeText}>{weightAbbr}</Text>
                  </View>
                )}
                {metaText.length > 0 && (
                  <Text style={styles.meta} numberOfLines={1}>
                    {metaText}
                  </Text>
                )}
              </View>
            )}
          </Pressable>
        );
      }}
    />
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
    searchInput: {
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.textPrimary,
    },
    filterOpenButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
    },
    filterOpenButtonText: {
      ...typography.body,
      fontFamily: typography.label.fontFamily,
      color: colors.textPrimary,
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
      ...typography.cardTitle,
      fontSize: 16,
      lineHeight: 20,
      color: colors.textPrimary,
      marginBottom: 2,
      paddingRight: 56,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    meta: {
      ...typography.meta,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    weightBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    weightBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textSecondary,
    },
  });
