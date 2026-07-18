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
import { Calendar, type DateData } from 'react-native-calendars';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { EventsStackParamList } from '../navigation';
import { getEventsInRange, getOrganizations, getPastEvents, getUpcomingEvents, isEventUpcoming } from '../lib/queries';
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
type ViewMode = 'list' | 'calendar';

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function EventListScreen({ navigation }: Props) {
  const { t, locale } = useLocale();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  const [timeframe, setTimeframe] = useState<Timeframe>('upcoming');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [calendarMonth, setCalendarMonth] = useState(currentYearMonth);
  const [monthEvents, setMonthEvents] = useState<EventListItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

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

  const loadMonthEvents = useCallback(
    async (yearMonth: string) => {
      setCalendarLoading(true);
      try {
        const [year, month] = yearMonth.split('-').map(Number);
        const start = new Date(year, month - 1, 1).toISOString();
        const end = new Date(year, month, 1).toISOString();
        setMonthEvents(await getEventsInRange(start, end, selectedOrgId));
      } catch {
        setMonthEvents([]);
      } finally {
        setCalendarLoading(false);
      }
    },
    [selectedOrgId]
  );

  useEffect(() => {
    if (viewMode === 'calendar') loadMonthEvents(calendarMonth);
  }, [viewMode, calendarMonth, loadMonthEvents]);

  const markedDates = useMemo(() => {
    const marks: Record<string, { marked?: boolean; dotColor?: string; selected?: boolean; selectedColor?: string }> = {};
    for (const event of monthEvents) {
      const day = event.event_date.slice(0, 10);
      marks[day] = { ...marks[day], marked: true, dotColor: colors.accentGold };
    }
    if (selectedDate) {
      marks[selectedDate] = { ...marks[selectedDate], selected: true, selectedColor: colors.accentGold };
    }
    return marks;
  }, [monthEvents, selectedDate]);

  const dayEvents = useMemo(() => {
    if (!selectedDate) return [];
    return monthEvents.filter((event) => event.event_date.slice(0, 10) === selectedDate);
  }, [monthEvents, selectedDate]);

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query ? events.filter((event) => event.name.toLowerCase().includes(query)) : events;
    // Stable sort — favorited events first, existing (date) order preserved within each group.
    return [...filtered].sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)));
  }, [events, search, favoriteIds]);

  const renderEventCard = (item: EventListItem) => {
    const upcoming = isEventUpcoming(item.event_date);
    return (
      <Pressable
        style={styles.eventCard}
        onPress={() => navigation.navigate('EventDetail', { eventId: item.id, eventName: item.name })}
      >
        {upcoming && (
          <EventReminderBell eventId={item.id} eventName={item.name} eventDateIso={item.event_date} />
        )}
        <EventFavoriteHeart eventId={item.id} onToggle={(active) => handleFavoriteToggle(item.id, active)} />
        <Text style={styles.eventOrg}>{item.organizations?.short_name ?? ''}</Text>
        <Text style={[styles.eventName, styles.eventNameWithIcons]}>{item.name}</Text>
        <Text style={styles.eventMeta}>{formatEventDate(item.event_date, locale)}</Text>
        <Text style={styles.eventMeta}>{[item.venue, item.city, item.country].filter(Boolean).join(', ')}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.timeframeRow}>
        <FilterButton
          label={t.eventList.viewList}
          active={viewMode === 'list'}
          onPress={() => setViewMode('list')}
        />
        <FilterButton
          label={t.eventList.viewCalendar}
          active={viewMode === 'calendar'}
          onPress={() => setViewMode('calendar')}
        />
      </View>

      {viewMode === 'list' && (
        <>
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
        </>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRowContainer}
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

      {viewMode === 'calendar' ? (
        <FlatList
          data={dayEvents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              <Calendar
                current={`${calendarMonth}-01`}
                markedDates={markedDates}
                onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
                onMonthChange={(month: DateData) =>
                  setCalendarMonth(`${month.year}-${String(month.month).padStart(2, '0')}`)
                }
                theme={{
                  backgroundColor: colors.background,
                  calendarBackground: colors.background,
                  textSectionTitleColor: colors.textSecondary,
                  dayTextColor: colors.textPrimary,
                  todayTextColor: colors.accentGold,
                  monthTextColor: colors.textPrimary,
                  arrowColor: colors.accentGold,
                  textDisabledColor: colors.border,
                  dotColor: colors.accentGold,
                  selectedDayBackgroundColor: colors.accentGold,
                  selectedDayTextColor: colors.background,
                }}
                style={styles.calendar}
              />
              {calendarLoading && <ActivityIndicator style={commonStyles.center} color={colors.textPrimary} />}
              {!calendarLoading && !selectedDate && (
                <Text style={commonStyles.empty}>{t.eventList.calendarSelectDay}</Text>
              )}
              {!calendarLoading && selectedDate && dayEvents.length === 0 && (
                <Text style={commonStyles.empty}>{t.eventList.calendarEmptyDay}</Text>
              )}
            </>
          }
          renderItem={({ item }) => renderEventCard(item)}
        />
      ) : (
        <>
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
              renderItem={({ item }) => renderEventCard(item)}
            />
          )}
        </>
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
  filterRowContainer: {
    flexGrow: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  calendar: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
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
