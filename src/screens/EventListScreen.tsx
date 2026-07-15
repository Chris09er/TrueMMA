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
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { EventsStackParamList } from '../navigation';
import { getOrganizations, getPastEvents, getUpcomingEvents, isEventUpcoming } from '../lib/queries';
import { getEventFavoriteIds } from '../lib/favorites';
import type { EventListItem, Organization } from '../lib/types';
import { colors, commonStyles, radius, spacing } from '../lib/theme';
import { formatEventDate } from '../lib/dateFormat';
import { useLocale } from '../lib/i18n';
import EventReminderBell from '../components/EventReminderBell';
import EventFavoriteHeart from '../components/EventFavoriteHeart';
import FilterButton from '../components/FilterButton';

type Props = NativeStackScreenProps<EventsStackParamList, 'EventList'>;
type Timeframe = 'upcoming' | 'past';

export default function EventListScreen({ navigation }: Props) {
  const { t, locale } = useLocale();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  const [timeframe, setTimeframe] = useState<Timeframe>('upcoming');
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrganizations().then(setOrganizations).catch(() => {});
  }, []);

  const loadEvents = useCallback(async () => {
    setError(null);
    try {
      const fetcher = timeframe === 'upcoming' ? getUpcomingEvents : getPastEvents;
      setEvents(await fetcher(selectedOrgId));
    } catch {
      setError(t.common.error);
    }
  }, [selectedOrgId, timeframe, t]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadEvents(), getEventFavoriteIds().then(setFavoriteIds)]).finally(() => setLoading(false));
  }, [loadEvents]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      getOrganizations().then(setOrganizations).catch(() => {}),
      loadEvents(),
      getEventFavoriteIds().then(setFavoriteIds),
    ]);
    setRefreshing(false);
  }, [loadEvents]);

  const handleFavoriteToggle = useCallback((eventId: string, active: boolean) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (active) next.add(eventId);
      else next.delete(eventId);
      return next;
    });
  }, []);

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query ? events.filter((event) => event.name.toLowerCase().includes(query)) : events;
    // Stable sort — favorited events first, existing (date) order preserved within each group.
    return [...filtered].sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)));
  }, [events, search, favoriteIds]);

  return (
    <View style={styles.container}>
      <View style={styles.timeframeRow}>
        <FilterButton
          label={t.eventList.upcoming}
          active={timeframe === 'upcoming'}
          onPress={() => setTimeframe('upcoming')}
        />
        <FilterButton
          label={t.eventList.past}
          active={timeframe === 'past'}
          onPress={() => setTimeframe('past')}
        />
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t.eventList.searchPlaceholder}
        placeholderTextColor={colors.textSecondary}
        style={styles.searchInput}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <FilterButton
          label={t.eventList.filterAll}
          active={selectedOrgId === undefined}
          onPress={() => setSelectedOrgId(undefined)}
        />
        {organizations.map((org) => (
          <FilterButton
            key={org.id}
            label={org.short_name}
            active={selectedOrgId === org.id}
            onPress={() => setSelectedOrgId(org.id)}
          />
        ))}
      </ScrollView>

      {loading && <ActivityIndicator style={commonStyles.center} color={colors.textPrimary} />}
      {!loading && error && <Text style={commonStyles.error}>{error}</Text>}
      {!loading && !error && (
        <FlatList
          data={visibleEvents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.textPrimary}
              colors={[colors.accentGold]}
            />
          }
          ListEmptyComponent={
            <Text style={commonStyles.empty}>
              {timeframe === 'upcoming' ? t.eventList.empty : t.eventList.emptyPast}
            </Text>
          }
          renderItem={({ item }) => {
            const upcoming = isEventUpcoming(item.event_date);
            return (
              <Pressable
                style={styles.eventCard}
                onPress={() =>
                  navigation.navigate('EventDetail', { eventId: item.id, eventName: item.name })
                }
              >
                {upcoming && (
                  <EventReminderBell eventId={item.id} eventName={item.name} eventDateIso={item.event_date} />
                )}
                <EventFavoriteHeart
                  eventId={item.id}
                  onToggle={(active) => handleFavoriteToggle(item.id, active)}
                />
                <Text style={styles.eventOrg}>{item.organizations?.short_name ?? ''}</Text>
                <Text style={[styles.eventName, styles.eventNameWithIcons]}>{item.name}</Text>
                <Text style={styles.eventMeta}>{formatEventDate(item.event_date, locale)}</Text>
                <Text style={styles.eventMeta}>
                  {[item.venue, item.city, item.country].filter(Boolean).join(', ')}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  timeframeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  searchInput: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  list: {
    padding: spacing.md,
    gap: 10,
  },
  eventCard: {
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  eventOrg: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  eventName: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
    color: colors.textPrimary,
  },
  eventNameWithIcons: {
    paddingRight: 56,
  },
  eventMeta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
