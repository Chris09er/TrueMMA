import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { EventsStackParamList, RootTabParamList } from '../navigation';
import {
  getEventsInRange,
  getOrganizations,
  getPastEvents,
  getUpcomingEvents,
  isEventLive,
  isEventUpcoming,
} from '../lib/queries';
import { getEventFavoriteIds } from '../lib/favorites';
import type { EventListItem, Organization } from '../lib/types';
import { pressedStyle, radius, spacing, tabularNums, typography, useTheme, type ColorTokens } from '../lib/theme';
import { formatEventDateTime } from '../lib/dateFormat';
import { useLocale } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import Flag from '../components/Flag';
import EventReminderBell from '../components/EventReminderBell';
import EventFavoriteHeart from '../components/EventFavoriteHeart';
import LiveBadge from '../components/LiveBadge';
import FilterChip from '../components/FilterChip';
import FilterModal, { FilterSection } from '../components/FilterModal';
import {
  Card,
  EmptyState,
  ErrorState,
  FilterIconButton,
  LogoMark,
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

  const [showPast, setShowPast] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [calendarMonth, setCalendarMonth] = useState(currentYearMonth);
  const [monthEvents, setMonthEvents] = useState<EventListItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Reset to the default "Veranstaltungen" home view: upcoming list, no
  // calendar, no day/org filter, empty search. Wired to both a tap on the
  // brand logo and a press on the already-focused Events tab.
  const resetToHome = useCallback(() => {
    setViewMode('list');
    setSelectedDate(null);
    setShowPast(false);
    setSearch('');
    setSelectedOrgId(undefined);
    setFilterModalVisible(false);
  }, []);

  useEffect(() => {
    const parent = navigation.getParent<BottomTabNavigationProp<RootTabParamList>>();
    const unsubscribe = parent?.addListener('tabPress', () => {
      // Only reset when the list is already the focused screen (tab tapped
      // while here) — e.g. switching back from the calendar to the default
      // list. When coming from EventDetail, the navigator's own pop-to-top
      // already returns here.
      if (navigation.isFocused()) resetToHome();
    });
    return unsubscribe;
  }, [navigation, resetToHome]);

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

  useEffect(() => {
    getOrganizations().then(setOrganizations).catch(() => {});
  }, []);

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

  const loadMonthEvents = useCallback(async (yearMonth: string) => {
    setCalendarLoading(true);
    try {
      const [year, month] = yearMonth.split('-').map(Number);
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 1).toISOString();
      setMonthEvents(await getEventsInRange(start, end));
    } catch {
      setMonthEvents([]);
    } finally {
      setCalendarLoading(false);
    }
  }, []);

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

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      if (selectedOrgId && event.organization_id !== selectedOrgId) return false;
      if (query && !event.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [events, search, selectedOrgId]);

  const activeFilterCount = selectedOrgId ? 1 : 0;

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

  const renderEventCard = (item: EventListItem) => {
    const upcoming = isEventUpcoming(item.event_date);
    return (
      <Card
        style={styles.card}
        onPress={() => navigation.navigate('EventDetail', { eventId: item.id, eventName: item.name })}
      >
        {upcoming && (
          <EventReminderBell
            eventId={item.id}
            eventName={item.name}
            eventDateIso={item.event_date}
            offsetRight={38}
          />
        )}
        <EventFavoriteHeart
          eventId={item.id}
          onToggle={(active) => handleFavoriteToggle(item.id, active)}
          offsetRight={10}
        />
        <Text style={styles.eventOrg}>{item.organizations?.short_name ?? ''}</Text>
        {isEventLive(item) && (
          <View style={styles.liveBadgeSlot}>
            <LiveBadge />
          </View>
        )}
        <Text style={[styles.eventName, styles.eventNameWithIcons]}>{item.name}</Text>
        <Text style={styles.eventDate}>
          {formatEventDateTime(item.event_date, locale, 'short', timezoneOverride ?? undefined)}
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

  const timeframeToggle = (
    <View style={styles.segment}>
      {[
        { past: false, label: t.eventList.upcoming },
        { past: true, label: t.eventList.past },
      ].map((seg) => {
        const active = showPast === seg.past;
        return (
          <Pressable
            key={seg.label}
            onPress={() => setShowPast(seg.past)}
            style={({ pressed }) => [styles.segmentItem, active && styles.segmentItemActive, pressed && pressedStyle]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{seg.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const listHeader = (
    <View style={styles.controls}>
      <View style={styles.searchRow}>
        <View style={styles.searchFlex}>
          <SearchInput value={search} onChangeText={setSearch} placeholder={t.eventList.searchPlaceholder} />
        </View>
        <FilterIconButton count={activeFilterCount} onPress={() => setFilterModalVisible(true)} label={t.eventList.filter} />
      </View>
      {timeframeToggle}

      <FilterModal
        visible={filterModalVisible}
        title={t.eventList.filter}
        doneLabel={t.eventList.filterDone}
        onClose={() => setFilterModalVisible(false)}
        showReset={activeFilterCount > 0}
        resetLabel={t.eventList.filterReset}
        onReset={() => setSelectedOrgId(undefined)}
      >
        {organizations.length > 0 && (
          <FilterSection title={t.eventList.filterOrganization}>
            <FilterChip
              label={t.eventList.filterAll}
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
      </FilterModal>
    </View>
  );

  const brandHeader = (
    <ScreenHeader
      left={
        <Pressable
          onPress={resetToHome}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t.tabs.events}
          style={({ pressed }) => pressed && pressedStyle}
        >
          <LogoMark size={26} />
        </Pressable>
      }
      title={t.tabs.events.toUpperCase()}
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

  return (
    <Screen>
      {brandHeader}

      {viewMode === 'calendar' ? (
        <FlatList
          data={dayEvents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              <Calendar
                current={`${calendarMonth}-01`}
                enableSwipeMonths
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
            <EmptyState icon="calendar-blank-outline" title={showPast ? t.eventList.emptyPast : t.eventList.empty} />
          }
          renderItem={({ item }) => renderEventCard(item)}
        />
      )}
    </Screen>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    iconButton: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },

    controls: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    searchFlex: { flex: 1 },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: radius.control,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 3,
      gap: 3,
    },
    segmentItem: { flex: 1, minHeight: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    segmentItemActive: { backgroundColor: colors.accent },
    segmentText: { ...typography.body, fontFamily: typography.label.fontFamily, color: colors.textSecondary },
    segmentTextActive: { color: '#FFFFFF' },

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
