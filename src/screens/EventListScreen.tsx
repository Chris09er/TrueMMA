import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { EventsStackParamList } from '../navigation';
import { getEventsInRange, getPastEvents, getUpcomingEvents, isEventLive, isEventUpcoming } from '../lib/queries';
import { getEventFavoriteIds } from '../lib/favorites';
import type { EventListItem } from '../lib/types';
import { pressedStyle, radius, spacing, tabularNums, typography, useTheme, type ColorTokens } from '../lib/theme';
import { formatEventDate } from '../lib/dateFormat';
import { useLocale } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import Flag from '../components/Flag';
import EventReminderBell from '../components/EventReminderBell';
import EventFavoriteHeart from '../components/EventFavoriteHeart';
import FilterChip from '../components/FilterChip';
import LiveBadge from '../components/LiveBadge';
import {
  Card,
  EmptyState,
  ErrorState,
  LogoPlaceholder,
  Screen,
  ScreenHeader,
  SearchInput,
  SkeletonCard,
} from '../components/ui';

type Props = NativeStackScreenProps<EventsStackParamList, 'EventList'>;
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

  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  // Two states only (handoff): future (default, includes today) vs past.
  const [showPast, setShowPast] = useState(false);
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

  // future (>= local start of today, so today stays here until tomorrow) vs past.
  const loadEvents = useCallback(async () => {
    setError(null);
    try {
      const fetcher = showPast ? getPastEvents : getUpcomingEvents;
      setEvents(await fetcher());
    } catch {
      setError(t.common.error);
    }
  }, [showPast, t]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([loadEvents(), getEventFavoriteIds().then(setFavoriteIds)]).finally(() => setLoading(false));
  }, [loadEvents]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadEvents(), getEventFavoriteIds().then(setFavoriteIds)]);
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

  // League chips are derived from the loaded events so an empty option never
  // appears (a league with no events in the current future/past set is hidden).
  const listOrganizations = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events) {
      if (event.organizations?.short_name) map.set(event.organization_id, event.organizations.short_name);
    }
    return [...map].map(([id, short_name]) => ({ id, short_name }));
  }, [events]);

  // Drop a now-invisible league filter when switching future/past.
  useEffect(() => {
    if (selectedOrgId && !listOrganizations.some((org) => org.id === selectedOrgId)) {
      setSelectedOrgId(undefined);
    }
  }, [listOrganizations, selectedOrgId]);

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    let filtered = selectedOrgId ? events.filter((event) => event.organization_id === selectedOrgId) : events;
    if (query) filtered = filtered.filter((event) => event.name.toLowerCase().includes(query));
    // Favorited events first; existing (date) order preserved within each group.
    return [...filtered].sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)));
  }, [events, search, selectedOrgId, favoriteIds]);

  const renderEventCard = (item: EventListItem) => {
    const upcoming = isEventUpcoming(item.event_date);
    return (
      <Card
        style={styles.card}
        onPress={() => navigation.navigate('EventDetail', { eventId: item.id, eventName: item.name })}
      >
        {upcoming && <EventReminderBell eventId={item.id} eventName={item.name} eventDateIso={item.event_date} />}
        <EventFavoriteHeart eventId={item.id} onToggle={(active) => handleFavoriteToggle(item.id, active)} />
        <Text style={styles.eventOrg}>{item.organizations?.short_name ?? ''}</Text>
        {isEventLive(item) && (
          <View style={styles.liveBadgeSlot}>
            <LiveBadge />
          </View>
        )}
        <Text style={[styles.eventName, styles.eventNameWithIcons]}>{item.name}</Text>
        <Text style={styles.eventDate}>
          {formatEventDate(item.event_date, locale, 'short', timezoneOverride ?? undefined)}
        </Text>
        {(item.venue || item.city || item.country) && (
          <View style={styles.locationRow}>
            <Flag country={item.country} height={12} />
            <Text style={styles.eventMeta}>{[item.venue, item.city, item.country].filter(Boolean).join(', ')}</Text>
          </View>
        )}
      </Card>
    );
  };

  return (
    <Screen>
      <ScreenHeader
        left={
          <View style={styles.brand}>
            <LogoPlaceholder size={24} />
            <Text style={styles.wordmark} numberOfLines={1}>
              {t.eventList.title.toUpperCase()}
            </Text>
          </View>
        }
        right={
          <Pressable
            onPress={() => setViewMode((mode) => (mode === 'calendar' ? 'list' : 'calendar'))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t.eventList.viewCalendar}
            style={({ pressed }) => [styles.iconButton, pressed && pressedStyle]}
          >
            <MaterialCommunityIcons
              name={viewMode === 'calendar' ? 'format-list-bulleted' : 'calendar-month-outline'}
              size={24}
              color={colors.textPrimary}
            />
          </Pressable>
        }
      />

      {viewMode === 'list' && (
        <>
          <View style={styles.controls}>
            <SearchInput
              value={search}
              onChangeText={setSearch}
              placeholder={t.eventList.searchPlaceholder}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <FilterChip
              label={t.eventList.filterAll}
              active={selectedOrgId === undefined}
              onPress={() => setSelectedOrgId(undefined)}
            />
            {listOrganizations.map((org) => (
              <FilterChip
                key={org.id}
                label={org.short_name}
                active={selectedOrgId === org.id}
                onPress={() => setSelectedOrgId(org.id)}
              />
            ))}
          </ScrollView>
          <View style={styles.controls}>
            <Pressable
              onPress={() => setShowPast((prev) => !prev)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: showPast }}
              style={({ pressed }) => [styles.pastToggle, pressed && pressedStyle]}
            >
              <MaterialCommunityIcons
                name={showPast ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={22}
                color={showPast ? colors.accent : colors.textSecondary}
              />
              <Text style={styles.pastToggleLabel}>{t.eventList.pastEvents}</Text>
            </Pressable>
          </View>
        </>
      )}

      {viewMode === 'calendar' ? (
        <FlatList
          data={dayEvents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
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
                  backgroundColor: 'transparent',
                  calendarBackground: colors.surface,
                  textSectionTitleColor: colors.textSecondary,
                  dayTextColor: colors.textPrimary,
                  todayTextColor: colors.accent,
                  monthTextColor: colors.textPrimary,
                  arrowColor: colors.accent,
                  textDisabledColor: colors.border,
                  dotColor: colors.accent,
                  selectedDayBackgroundColor: colors.accent,
                  selectedDayTextColor: '#FFFFFF',
                }}
                style={styles.calendar}
              />
              {calendarLoading && <ActivityIndicator style={styles.centered} color={colors.textPrimary} />}
              {!calendarLoading && !selectedDate && (
                <Text style={styles.calendarHint}>{t.eventList.calendarSelectDay}</Text>
              )}
              {!calendarLoading && selectedDate && dayEvents.length === 0 && (
                <Text style={styles.calendarHint}>{t.eventList.calendarEmptyDay}</Text>
              )}
            </>
          }
          renderItem={({ item }) => renderEventCard(item)}
        />
      ) : loading ? (
        <View style={styles.skeletonWrap}>
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : error ? (
        <ErrorState message={error} retryLabel={t.common.retry} onRetry={load} />
      ) : (
        <FlatList
          data={visibleEvents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.textPrimary}
              colors={[colors.accent]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="calendar-blank-outline"
              title={showPast ? t.eventList.emptyPast : t.eventList.empty}
            />
          }
          renderItem={({ item }) => renderEventCard(item)}
        />
      )}
    </Screen>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    wordmark: {
      fontFamily: typography.display.fontFamily,
      fontSize: 22,
      letterSpacing: 1,
      color: colors.textPrimary,
    },
    iconButton: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    controls: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    chipRow: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: spacing.sm,
    },
    pastToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
    },
    pastToggleLabel: {
      ...typography.compact,
      fontFamily: typography.label.fontFamily,
      color: colors.textSecondary,
    },
    listContent: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    skeletonWrap: {
      padding: spacing.lg,
    },
    card: {
      position: 'relative',
    },
    eventOrg: {
      ...typography.label,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    liveBadgeSlot: {
      marginBottom: spacing.xs,
    },
    eventName: {
      ...typography.cardTitle,
      marginBottom: spacing.xs,
      color: colors.textPrimary,
    },
    eventNameWithIcons: {
      paddingRight: 56,
    },
    eventDate: {
      ...typography.meta,
      ...tabularNums,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    eventMeta: {
      ...typography.meta,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    calendar: {
      borderRadius: radius.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    centered: { marginTop: 40 },
    calendarHint: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      padding: spacing.lg,
    },
  });
