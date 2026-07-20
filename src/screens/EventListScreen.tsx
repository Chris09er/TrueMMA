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
import { Calendar, type DateData } from 'react-native-calendars';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { EventsStackParamList } from '../navigation';
import {
  getEventsInRange,
  getOrganizations,
  getPastEvents,
  getTodayEvents,
  getUpcomingEvents,
  isEventLive,
  isEventUpcoming,
} from '../lib/queries';
import { getEventFavoriteIds } from '../lib/favorites';
import type { EventListItem, Organization } from '../lib/types';
import { pressedStyle, radius, spacing, typography, useCommonStyles, useTheme, type ColorTokens } from '../lib/theme';
import { formatEventDate } from '../lib/dateFormat';
import { useLocale } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import Flag from '../components/Flag';
import EventReminderBell from '../components/EventReminderBell';
import EventFavoriteHeart from '../components/EventFavoriteHeart';
import FilterChip from '../components/FilterChip';
import FilterModal, { FilterSection } from '../components/FilterModal';
import SegmentedControl from '../components/SegmentedControl';
import LiveBadge from '../components/LiveBadge';

type Props = NativeStackScreenProps<EventsStackParamList, 'EventList'>;
type Timeframe = 'today' | 'upcoming' | 'past';
type ViewMode = 'list' | 'calendar';

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function EventListScreen({ navigation }: Props) {
  const { t, locale } = useLocale();
  const { timezoneOverride } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const commonStyles = useCommonStyles();
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
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  useEffect(() => {
    getOrganizations().then(setOrganizations).catch(() => {});
  }, []);

  const loadEvents = useCallback(async () => {
    setError(null);
    try {
      const fetcher = timeframe === 'today' ? getTodayEvents : timeframe === 'upcoming' ? getUpcomingEvents : getPastEvents;
      // Unfiltered by org — the org filter is applied client-side (see
      // visibleEvents) so the filter chips can show/hide per timeframe
      // without a refetch, and so a league with no events in this
      // timeframe simply doesn't appear as an option.
      setEvents(await fetcher());
    } catch {
      setError(t.common.error);
    }
  }, [timeframe, t]);

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
      marks[day] = { ...marks[day], marked: true, dotColor: colors.accent };
    }
    if (selectedDate) {
      marks[selectedDate] = { ...marks[selectedDate], selected: true, selectedColor: colors.accent };
    }
    return marks;
  }, [monthEvents, selectedDate, colors]);

  const dayEvents = useMemo(() => {
    if (!selectedDate) return [];
    return monthEvents.filter((event) => event.event_date.slice(0, 10) === selectedDate);
  }, [monthEvents, selectedDate]);

  // Only orgs that actually have an event in the current timeframe — an
  // empty filter option is just a disappointment waiting to happen.
  const listOrganizations = useMemo(() => {
    const idsWithEvents = new Set(events.map((event) => event.organization_id));
    return organizations.filter((org) => idsWithEvents.has(org.id));
  }, [organizations, events]);

  // If the selected org has no events in the newly-active timeframe (e.g.
  // switching from "Kommende" to "Heute"), drop the now-invisible filter
  // instead of silently filtering everything out.
  useEffect(() => {
    if (viewMode !== 'list' || !selectedOrgId) return;
    if (!listOrganizations.some((org) => org.id === selectedOrgId)) {
      setSelectedOrgId(undefined);
    }
  }, [viewMode, listOrganizations, selectedOrgId]);

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    let filtered = selectedOrgId ? events.filter((event) => event.organization_id === selectedOrgId) : events;
    if (query) filtered = filtered.filter((event) => event.name.toLowerCase().includes(query));
    // Stable sort — favorited events first, existing (date) order preserved within each group.
    return [...filtered].sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)));
  }, [events, search, selectedOrgId, favoriteIds]);

  const activeFilterCount = selectedOrgId === undefined ? 0 : 1;
  const filterOrganizations = viewMode === 'calendar' ? organizations : listOrganizations;

  const renderEventCard = (item: EventListItem) => {
    const upcoming = isEventUpcoming(item.event_date);
    return (
      <Pressable
        style={({ pressed }) => [styles.eventCard, pressed && pressedStyle]}
        onPress={() => navigation.navigate('EventDetail', { eventId: item.id, eventName: item.name })}
      >
        {upcoming && (
          <EventReminderBell eventId={item.id} eventName={item.name} eventDateIso={item.event_date} />
        )}
        <EventFavoriteHeart eventId={item.id} onToggle={(active) => handleFavoriteToggle(item.id, active)} />
        <Text style={styles.eventOrg}>{item.organizations?.short_name ?? ''}</Text>
        {isEventLive(item) && (
          <View style={styles.liveBadgeSlot}>
            <LiveBadge />
          </View>
        )}
        <Text style={[styles.eventName, styles.eventNameWithIcons]}>{item.name}</Text>
        <Text style={styles.eventMeta}>{formatEventDate(item.event_date, locale, 'short', timezoneOverride ?? undefined)}</Text>
        {(item.venue || item.city || item.country) && (
          <View style={styles.locationRow}>
            <Flag country={item.country} height={12} />
            <Text style={styles.eventMeta}>{[item.venue, item.city, item.country].filter(Boolean).join(', ')}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.controlsRow}>
        <SegmentedControl
          segments={[
            { value: 'list', label: t.eventList.viewList },
            { value: 'calendar', label: t.eventList.viewCalendar },
          ]}
          value={viewMode}
          onChange={setViewMode}
        />
      </View>

      {viewMode === 'list' && (
        <>
          <View style={styles.controlsRow}>
            <SegmentedControl
              segments={[
                { value: 'past', label: t.eventList.past },
                { value: 'today', label: t.eventList.today },
                { value: 'upcoming', label: t.eventList.upcoming },
              ]}
              value={timeframe}
              onChange={setTimeframe}
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

      <View style={styles.controlsRow}>
        <Pressable
          style={({ pressed }) => [styles.filterOpenButton, pressed && pressedStyle]}
          onPress={() => setFilterModalVisible(true)}
        >
          <Text style={styles.filterOpenButtonText}>
            {activeFilterCount > 0 ? `${t.eventList.filter} (${activeFilterCount})` : t.eventList.filter}
          </Text>
        </Pressable>
      </View>

      <FilterModal
        visible={filterModalVisible}
        title={t.eventList.filter}
        doneLabel={t.eventList.filterDone}
        onClose={() => setFilterModalVisible(false)}
        showReset={activeFilterCount > 0}
        resetLabel={t.eventList.filterReset}
        onReset={() => setSelectedOrgId(undefined)}
      >
        <FilterSection title={t.eventList.filterOrganization}>
          <FilterChip
            label={t.eventList.filterAll}
            active={selectedOrgId === undefined}
            onPress={() => setSelectedOrgId(undefined)}
          />
          {filterOrganizations.map((org) => (
            <FilterChip
              key={org.id}
              label={org.short_name}
              active={selectedOrgId === org.id}
              onPress={() => setSelectedOrgId(org.id)}
            />
          ))}
        </FilterSection>
      </FilterModal>

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
                  todayTextColor: colors.accent,
                  monthTextColor: colors.textPrimary,
                  arrowColor: colors.accent,
                  textDisabledColor: colors.border,
                  dotColor: colors.accent,
                  selectedDayBackgroundColor: colors.accent,
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
                  colors={[colors.accent]}
                />
              }
              ListEmptyComponent={
                <Text style={commonStyles.empty}>
                  {timeframe === 'today'
                    ? t.eventList.emptyToday
                    : timeframe === 'upcoming'
                      ? t.eventList.empty
                      : t.eventList.emptyPast}
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

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    controlsRow: {
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
    filterOpenButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterOpenButtonText: {
      ...typography.body,
      fontFamily: typography.label.fontFamily,
      color: colors.textPrimary,
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
      ...typography.label,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    liveBadgeSlot: {
      marginBottom: 4,
    },
    eventName: {
      ...typography.cardTitle,
      marginBottom: 4,
      color: colors.textPrimary,
    },
    eventNameWithIcons: {
      paddingRight: 56,
    },
    eventMeta: {
      ...typography.meta,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
  });
