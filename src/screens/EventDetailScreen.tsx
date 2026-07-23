import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { EventsStackParamList, RootTabParamList } from '../navigation';
import { abbreviateWeightClass, getEventDetail, getFightsForEvent, isEventLive, isEventUpcoming } from '../lib/queries';
import type { CardSegment, EventDetail, Fight, Fighter } from '../lib/types';
import { pressedStyle, spacing, tabularNums, typography, useTheme, type ColorTokens } from '../lib/theme';
import { formatEventDateTime } from '../lib/dateFormat';
import { useLocale } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import Flag from '../components/Flag';
import EventReminderBell from '../components/EventReminderBell';
import EventFavoriteHeart from '../components/EventFavoriteHeart';
import LiveBadge from '../components/LiveBadge';
import OrganizationFollowBell from '../components/OrganizationFollowBell';
import { Card, EmptyState, ErrorState, Screen, ScreenHeader } from '../components/ui';

type Props = NativeStackScreenProps<EventsStackParamList, 'EventDetail'>;
type Styles = ReturnType<typeof makeStyles>;
type Loc = ReturnType<typeof useLocale>['t'];

const SEGMENT_ORDER: CardSegment[] = ['main_card', 'prelims', 'early_prelims'];

function formatRecord(fighter: Fighter | null): string | null {
  if (!fighter) return null;
  const { record_wins: w, record_losses: l, record_draws: d, record_no_contests: nc } = fighter;
  if (w == null && l == null && d == null) return null;
  const base = `${w ?? 0}-${l ?? 0}-${d ?? 0}`;
  return nc ? `${base} (${nc} NC)` : base;
}

function FighterCell({
  fighter,
  align,
  isWinner,
  styles,
}: {
  fighter: Fighter | null;
  align: 'left' | 'right';
  isWinner: boolean;
  styles: Styles;
}) {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const right = align === 'right';
  const record = formatRecord(fighter);
  const name = fighter?.name ?? 'TBA';
  return (
    <View style={[styles.fighterCell, right ? styles.alignEnd : styles.alignStart]}>
      <View style={[styles.fighterHead, right && styles.rowReverse]}>
        <Flag country={fighter?.nationality} height={12} />
        <View style={styles.fighterNameWrap}>
          <Text
            style={[styles.fighterName, right && styles.textRight, isWinner && styles.fighterNameWinner]}
            numberOfLines={2}
            onPress={
              fighter
                ? () =>
                    navigation.navigate('FightersTab', {
                      screen: 'FighterDetail',
                      params: { fighterId: fighter.id, fighterName: fighter.name },
                    })
                : undefined
            }
          >
            {name}
          </Text>
        </View>
      </View>
      {record && <Text style={[styles.record, right && styles.textRight]}>{record}</Text>}
    </View>
  );
}

function FightRow({ fight, t, styles }: { fight: Fight; t: Loc; styles: Styles }) {
  const cancelled = fight.status === 'cancelled';
  const winnerId = fight.result_winner_id;
  const hasBanner = fight.is_main_event || fight.is_title_fight || cancelled;
  const rounds = fight.scheduled_rounds ? `${fight.scheduled_rounds} ${t.eventDetail.rounds}` : null;
  const weight = abbreviateWeightClass(fight.weight_class);
  return (
    <View style={[styles.fightRow, cancelled && styles.cancelled]}>
      {hasBanner && (
        <View style={styles.bannerRow}>
          {cancelled && (
            <View style={[styles.tag, styles.tagCancelled]}>
              <Text style={styles.tagCancelledText}>{t.eventDetail.cancelled}</Text>
            </View>
          )}
          {fight.is_main_event && (
            <View style={[styles.tag, styles.tagMain]}>
              <Text style={styles.tagMainText}>{t.eventDetail.mainEvent}</Text>
            </View>
          )}
          {fight.is_title_fight && (
            <View style={[styles.tag, styles.tagTitle]}>
              <Text style={styles.tagTitleText}>{t.eventDetail.titleFight}</Text>
            </View>
          )}
        </View>
      )}
      <View style={styles.matchup}>
        <FighterCell fighter={fight.fighter1} align="left" isWinner={fight.fighter1?.id === winnerId} styles={styles} />
        <View style={styles.centerMeta}>
          {weight && <Text style={styles.weightClass}>{weight}</Text>}
          {rounds && <Text style={styles.roundsText}>{rounds}</Text>}
        </View>
        <FighterCell fighter={fight.fighter2} align="right" isWinner={fight.fighter2?.id === winnerId} styles={styles} />
      </View>
      {(fight.result_method_detail || fight.result_method) && (
        <Text style={styles.result}>
          {t.eventDetail.resultVia} {fight.result_method_detail ?? fight.result_method}
          {fight.result_round ? ` · ${t.eventDetail.round} ${fight.result_round}` : ''}
          {fight.result_time ? ` (${fight.result_time})` : ''}
        </Text>
      )}
    </View>
  );
}

export default function EventDetailScreen({ route, navigation }: Props) {
  const { eventId, eventName } = route.params;
  const { t, locale } = useLocale();
  const { timezoneOverride } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [fights, setFights] = useState<Fight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([getEventDetail(eventId), getFightsForEvent(eventId)])
      .then(([eventData, fightsData]) => {
        setEvent(eventData);
        setFights(fightsData);
      })
      .catch(() => setError(t.common.error))
      .finally(() => setLoading(false));
  };

  useEffect(load, [eventId, t]);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale === 'de' ? 'de-DE' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      ...(timezoneOverride ? { timeZone: timezoneOverride } : {}),
      ...(timezoneOverride ? { timeZone: timezoneOverride } : {}),
    });

  const segmentStart: Record<CardSegment, string | null> = {
    main_card: event?.main_card_start_time ?? null,
    prelims: event?.prelims_start_time ?? null,
    early_prelims: event?.early_prelims_start_time ?? null,
  };
  const segmentLabel: Record<CardSegment, string> = {
    main_card: t.eventDetail.mainCard,
    prelims: t.eventDetail.prelims,
    early_prelims: t.eventDetail.earlyPrelims,
  };

  const groups = useMemo(() => {
    const out: { key: string; title: string | null; startTime: string | null; fights: Fight[] }[] = [];
    for (const seg of SEGMENT_ORDER) {
      const segFights = fights.filter((f) => f.card_segment === seg);
      if (segFights.length) out.push({ key: seg, title: segmentLabel[seg], startTime: segmentStart[seg], fights: segFights });
    }
    const rest = fights.filter((f) => !f.card_segment || !SEGMENT_ORDER.some((s) => s === f.card_segment));
    if (rest.length) out.push({ key: 'other', title: null, startTime: null, fights: rest });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fights, event]);

  const header = (
    <ScreenHeader
      left={
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          style={({ pressed }) => [styles.iconButton, pressed && pressedStyle]}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
      }
      title={t.eventDetail.screenTitle.toUpperCase()}
      right={
        <>
          {event && isEventUpcoming(event.event_date) && (
            <EventReminderBell inline eventId={eventId} eventName={event.name} eventDateIso={event.event_date} />
          )}
          <EventFavoriteHeart inline eventId={eventId} />
        </>
      }
    />
  );

  if (loading) {
    return (
      <Screen>
        {header}
        <ActivityIndicator style={styles.centered} color={colors.textPrimary} />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        {header}
        <ErrorState message={error} retryLabel={t.common.retry} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.eventInfo}>
          {event && isEventLive(event) && (
            <View style={styles.liveBadgeSlot}>
              <LiveBadge />
            </View>
          )}
          {event?.status === 'cancelled' && (
            <View style={[styles.tag, styles.tagCancelled, styles.cancelledBanner]}>
              <Text style={styles.tagCancelledText}>{t.eventDetail.eventCancelled}</Text>
            </View>
          )}
          {event?.organizations?.short_name && (
            <View style={styles.orgRow}>
              <Text style={styles.orgName}>{event.organizations.short_name}</Text>
              <OrganizationFollowBell organizationId={event.organization_id} />
            </View>
          )}
          <Text style={styles.eventName}>{event?.name ?? eventName}</Text>
          {event && (
            <Text style={styles.eventDate}>
              {formatEventDateTime(event.event_date, locale, 'long', timezoneOverride ?? undefined).toUpperCase()}
            </Text>
          )}
          {event && (event.venue || event.city || event.venue_state || event.country) && (
            <View style={styles.locationRow}>
              <Flag country={event.country} height={12} />
              <Text style={styles.eventMeta}>
                {[event.venue, event.city, event.venue_state, event.country].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}
        </View>

        {groups.length === 0 ? (
          <EmptyState title={t.eventDetail.emptyFightCard} />
        ) : (
          groups.map((group) => (
            <Card key={group.key} style={styles.groupCard}>
              {group.title && (
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTitle}>{group.title}</Text>
                  {group.startTime && (
                    <Text style={styles.groupStarts}>
                      {t.eventDetail.starts} {formatTime(group.startTime)}
                    </Text>
                  )}
                </View>
              )}
              {group.fights.map((fight) => (
                <FightRow key={fight.id} fight={fight} t={t} styles={styles} />
              ))}
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    centered: { marginTop: 40 },
    scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

    eventInfo: { marginBottom: spacing.lg },
    liveBadgeSlot: { marginBottom: spacing.sm, alignSelf: 'flex-start' },
    cancelledBanner: { alignSelf: 'flex-start', marginBottom: spacing.sm },
    orgRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
    orgName: { ...typography.label, color: colors.focus },
    eventName: { ...typography.display, color: colors.textPrimary, marginBottom: spacing.sm },
    eventDate: {
      ...typography.compact,
      ...tabularNums,
      fontFamily: typography.label.fontFamily,
      letterSpacing: 0.5,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    eventMeta: { ...typography.meta, color: colors.textSecondary, flexShrink: 1 },

    groupCard: { padding: 0, marginBottom: spacing.lg },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    groupTitle: { ...typography.label, color: colors.textSecondary },
    groupStarts: { ...typography.meta, ...tabularNums, color: colors.textSecondary },

    fightRow: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.divider,
    },
    cancelled: { opacity: 0.5 },
    bannerRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    tag: { borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 3, overflow: 'hidden' },
    tagMain: { backgroundColor: colors.accent },
    tagMainText: { ...typography.caption, color: '#FFFFFF' },
    tagTitle: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.alloy },
    tagTitleText: { ...typography.caption, color: colors.alloy },
    tagCancelled: { backgroundColor: colors.danger },
    tagCancelledText: { ...typography.caption, color: '#FFFFFF' },

    matchup: { flexDirection: 'row', alignItems: 'center' },
    fighterCell: { flex: 1, gap: spacing.xs },
    alignStart: { alignItems: 'flex-start' },
    alignEnd: { alignItems: 'flex-end' },
    fighterHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    rowReverse: { flexDirection: 'row-reverse' },
    fighterNameWrap: { flexShrink: 1 },
    fighterName: { ...typography.cardTitle, fontSize: 16, lineHeight: 20, color: colors.textPrimary },
    fighterNameWinner: { color: colors.accent },
    textRight: { textAlign: 'right' },
    record: { ...typography.meta, ...tabularNums, color: colors.textSecondary },

    centerMeta: { alignItems: 'center', paddingHorizontal: spacing.sm },
    weightClass: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
    roundsText: { ...typography.caption, ...tabularNums, color: colors.textSecondary, textAlign: 'center' },
    result: {
      ...typography.meta,
      color: colors.textSecondary,
      fontStyle: 'italic',
      textAlign: 'center',
      marginTop: spacing.sm,
    },
  });
