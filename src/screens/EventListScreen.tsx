import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
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
import FilterModal, { FilterSection } from '../components/FilterModal';
import LiveBadge from '../components/LiveBadge';
import {
  Card,
  EmptyState,
  ErrorState,
  LogoPlaceholder,
  Screen,
  ScreenHeader,
  SearchInput,
  SectionHeader,
  SkeletonCard,
} from '../components/ui';

type Props = NativeStackScreenProps<EventsStackParamList, 'EventList'>;
type ViewMode = 'list' | 'calendar';
type Section = { title: string; data: EventListItem[] };

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

export default function EventListScreen({ navigation }: Props) {
  const { t, locale } = useLocale();
  const { timezoneOverride } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  const [showPast, setShowPast] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const [calendarMonth, setCalendarMonth] = useState(currentYearMonth);
  const [monthEvents, setMonthEvents] = useState<EventListItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

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

  const listOrganizations = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events) {
      if (event.organizations?.short_name) map.set(event.organization_id, event.organizations.short_name);
    }
    return [...map].map(([id, short_name]) => ({ id, short_name }));
  }, [events]);

  useEffect(() => {
    if (selectedOrgId && !listOrganizations.some((org) => org.id === selectedOrgId)) {
      setSelectedOrgId(undefined);
    }
  }, [listOrganizations, selectedOrgId]);

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    let filtered = selectedOrgId ? events.filter((event) => event.organization_id === selectedOrgId) : events;
    if (query) filtered = filtered.filter((event) => event.name.toLowerCase().includes(query));
    return filtered;
  }, [events, search, selectedOrgId]);

  // Group into date sections: upcoming -> Today / This week / month groups;
  // past -> month groups, newest first.
  const sections = useMemo<Section[]>(() => {
    const monthLabel = (d: Date) =>
      d.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', { month: 'long', year: 'numeric' });

    if (showPast) {
      const byMonth = new Map<string, { title: string; data: EventListItem[]; sort: number }>();
      for (const e of visibleEvents) {
        const d = new Date(e.event_date);
        const k = monthKey(d);
        if (!byMonth.has(k)) byMonth.set(k, { title: monthLabel(d), data: [], sort: d.getTime() });
        byMonth.get(k)!.data.push(e);
      }
      return [...byMonth.values()].sort((a, b) => b.sort - a.sort).map(({ title, data }) => ({ title, data }));
    }

    const startToday = startOfLocalDay(new Date()).getTime();
    const endToday = startToday + 86_400_000;
    const endWeek = startToday + 7 * 86_400_000;
    const today: EventListItem[] = [];
    const week: EventListItem[] = [];
    const later = new Map<string, { title: string; data: EventListItem[]; sort: number }>();
    for (const e of visibleEvents) {
      const ts = new Date(e.event_date).getTime();
      if (ts < endToday) today.push(e);
      else if (ts < endWeek) week.push(e);
      else {
        const d = new Date(e.event_date);
        const k = monthKey(d);
        if (!later.has(k)) later.set(k, { title: monthLabel(d), data: [], sort: d.getTime() });
        later.get(k)!.data.push(e);
      }
    }
    const out: Section[] = [];
    if (today.length) out.push({ title: t.eventList.today, data: today });
    if (week.length) out.push({ title: t.eventList.thisWeek, data: week });
    for (const { title, data } of [...later.values()].sort((a, b) => a.sort - b.sort)) out.push({ title, data });
    return out;
  }, [visibleEvents, showPast, locale, t]);

  const activeFilterCount = selectedOrgId === undefined ? 0 : 1;

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

  const listHeader = (
    <View>
      <View style={styles.searchRow}>
        <View style={styles.searchFlex}>
          <SearchInput value={search} onChangeText={setSearch} placeholder={t.eventList.searchPlaceholder} />
        </View>
        <Pressable
          onPress={() => setFilterModalVisible(true)}
          style={({ pressed }) => [styles.filterButton, pressed && pressedStyle]}
        >
          <MaterialCommunityIcons name="filter-variant" size={18} color="#FFFFFF" />
          <Text style={styles.filterButtonText}>{t.eventList.filter}</Text>
          {activeFilterCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
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
        <View style={[styles.pastDivider, { backgroundColor: colors.divider }]} />
        <Pressable
          onPress={() => setShowPast((prev) => !prev)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: showPast }}
          style={({ pressed }) => [styles.pastToggle, pressed && pressedStyle]}
        >
          <MaterialCommunityIcons
            name={showPast ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={20}
            color={showPast ? colors.accent : colors.textSecondary}
          />
          <Text style={styles.pastToggleLabel}>{t.eventList.pastEvents}</Text>
        </Pressable>
      </View>
    </View>
  );

  const brandHeader = (
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
  );

  const filterModal = (
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
        {listOrganizations.map((org) => (
          <FilterChip
            key={org.id}
            label={org.short_name}
            active={selectedOrgId === org.id}
            onPress={() => setSelectedOrgId(org.id)}
          />
        ))}
      </FilterSection>
    </FilterModal>
  );

  return (
    <Screen>
      {brandHeader}
      {filterModal}

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
          {listHeader}
          <View style={styles.skeletonList}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </View>
        </View>
      ) : error ? (
        <>
          {listHeader}
          <ErrorState message={error} retryLabel={t.common.retry} onRetry={load} />
        </>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={listHeader}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.textPrimary}
              colors={[colors.accent]}
            />
          }
          renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
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
    iconButton: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },

    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    searchFlex: { flex: 1 },
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: 44,
      paddingHorizontal: spacing.md,
      borderRadius: radius.control,
      backgroundColor: colors.accent,
    },
    filterButtonText: { ...typography.body, fontFamily: typography.label.fontFamily, color: '#FFFFFF' },
    badge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      backgroundColor: colors.focus,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { ...typography.caption, color: '#FFFFFF' },

    chipRow: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.md, paddingLeft: spacing.lg },
    chipScroll: { gap: spacing.sm, paddingRight: spacing.sm, alignItems: 'center' },
    pastDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: spacing.sm, marginHorizontal: spacing.sm },
    pastToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: 44,
      paddingRight: spacing.lg,
    },
    pastToggleLabel: { ...typography.meta, fontFamily: typography.label.fontFamily, color: colors.textSecondary },

    listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
    skeletonWrap: { paddingBottom: spacing.lg },
    skeletonList: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
    card: { marginTop: spacing.md, position: 'relative' },
    eventOrg: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
    liveBadgeSlot: { marginBottom: spacing.xs },
    eventName: { ...typography.cardTitle, marginBottom: spacing.xs, color: colors.textPrimary },
    eventNameWithIcons: { paddingRight: 56 },
    eventDate: { ...typography.meta, ...tabularNums, color: colors.textSecondary, marginBottom: spacing.sm },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    eventMeta: { ...typography.meta, color: colors.textSecondary, flexShrink: 1 },

    calendar: {
      borderRadius: radius.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginTop: spacing.md,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    centered: { marginTop: 40 },
    calendarHint: { ...typography.body, color: colors.textSecondary, textAlign: 'center', padding: spacing.lg },
  });
