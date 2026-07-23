import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { FightersStackParamList } from '../navigation';
import { abbreviateWeightClass, getFighters, getOrganizations, sortWeightClasses, weightClassRank } from '../lib/queries';
import { getSavedIds } from '../lib/saves';
import type { Fighter, Organization } from '../lib/types';
import { pressedStyle, spacing, typography, useTheme, type ColorTokens } from '../lib/theme';
import { useLocale } from '../lib/i18n';
import Flag from '../components/Flag';
import SaveHeart from '../components/SaveHeart';
import FilterChip from '../components/FilterChip';
import FilterModal, { FilterSection } from '../components/FilterModal';
import { EmptyState, ErrorState, FilterIconButton, LogoMark, Screen, ScreenHeader, SearchInput, SkeletonBlock } from '../components/ui';

type FighterSort = 'name' | 'weight' | 'record' | 'nationality';

type Props = NativeStackScreenProps<FightersStackParamList, 'FighterList'>;

export default function FighterListScreen({ navigation }: Props) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([loadFighters(), getSavedIds('fighter').then(setFavoriteIds)]).finally(() => setLoading(false));
  }, [loadFighters]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadFighters(), getSavedIds('fighter').then(setFavoriteIds)]);
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
    // Favorited fighters always float to the top; the chosen sort key orders
    // within each group, with name as the deterministic tiebreaker.
    return [...filtered].sort((a, b) => {
      const fav = Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id));
      if (fav !== 0) return fav;
      switch (sortBy) {
        case 'weight': {
          const diff = weightClassRank(a.weight_class) - weightClassRank(b.weight_class);
          return diff !== 0 ? diff : a.name.localeCompare(b.name);
        }
        case 'record': {
          const diff = (b.record_wins ?? -1) - (a.record_wins ?? -1);
          return diff !== 0 ? diff : a.name.localeCompare(b.name);
        }
        case 'nationality': {
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

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.searchRow}>
        <View style={styles.searchFlex}>
          <SearchInput value={search} onChangeText={setSearch} placeholder={t.fighterList.searchPlaceholder} />
        </View>
        <FilterIconButton count={activeFilterCount} onPress={() => setFilterModalVisible(true)} label={t.fighterList.filter} />
      </View>

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
    </View>
  );

  const renderRow = (item: Fighter) => {
    const meta = [abbreviateWeightClass(item.weight_class), item.nickname ? `"${item.nickname}"` : null]
      .filter(Boolean)
      .join(' · ');
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && pressedStyle]}
        onPress={() => navigation.navigate('FighterDetail', { fighterId: item.id, fighterName: item.name })}
      >
        <View style={styles.flagSlot}>
          <Flag country={item.nationality} height={22} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          {meta.length > 0 && (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          )}
        </View>
        <View style={styles.rowActions}>
          <SaveHeart
            inline
            kind="fighter"
            id={item.id}
            active={favoriteIds.has(item.id)}
            onToggle={(active) => handleFavoriteToggle(item.id, active)}
          />
        </View>
      </Pressable>
    );
  };

  return (
    <Screen>
      <ScreenHeader left={<LogoMark size={26} />} title={t.tabs.fighters.toUpperCase()} />
      {loading ? (
        <View style={styles.skeletonWrap}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <SkeletonBlock width={28} height={20} />
              <View style={styles.skeletonBody}>
                <SkeletonBlock width="55%" height={16} />
                <SkeletonBlock width="35%" height={12} style={{ marginTop: spacing.xs }} />
              </View>
            </View>
          ))}
        </View>
      ) : error ? (
        <ErrorState message={error} retryLabel={t.common.retry} onRetry={load} />
      ) : (
        <FlatList
          data={visibleFighters}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.textPrimary}
              colors={[colors.accent]}
            />
          }
          ListEmptyComponent={<EmptyState icon="account-search-outline" title={t.fighterList.empty} />}
          renderItem={({ item }) => renderRow(item)}
        />
      )}
    </Screen>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    listHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md, marginBottom: spacing.sm },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    searchFlex: { flex: 1 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    flagSlot: { width: 32, alignItems: 'center' },
    rowBody: { flex: 1, gap: 2 },
    name: { ...typography.cardTitle, fontSize: 16, lineHeight: 20, color: colors.textPrimary },
    meta: { ...typography.meta, color: colors.textSecondary },
    rowActions: { flexDirection: 'row', alignItems: 'center' },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginHorizontal: spacing.lg },
    skeletonWrap: { padding: spacing.lg, gap: spacing.lg },
    skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    skeletonBody: { flex: 1 },
  });
