import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { EventsStackParamList, RootTabParamList } from '../navigation';
import { getEventDetail, getFightsForEvent, isEventLive, isEventUpcoming } from '../lib/queries';
import { castVote, getEventVotes, type FightVoteSummary } from '../lib/voting';
import type { EventDetail, Fight, Fighter } from '../lib/types';
import { pressedStyle, radius, spacing, useCommonStyles, useTheme, type ColorTokens } from '../lib/theme';
import { formatEventDate } from '../lib/dateFormat';
import { useLocale } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import EventReminderBell from '../components/EventReminderBell';
import EventFavoriteHeart from '../components/EventFavoriteHeart';
import LiveBadge from '../components/LiveBadge';
import OrganizationFollowBell from '../components/OrganizationFollowBell';

type Props = NativeStackScreenProps<EventsStackParamList, 'EventDetail'>;
type Styles = ReturnType<typeof makeStyles>;

function FighterLink({
  fighter,
  isWinner,
  styles,
}: {
  fighter: Fighter | null;
  isWinner: boolean;
  styles: Styles;
}) {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const name = fighter?.name ?? 'TBA';
  const style = [styles.fighterName, fighter && styles.fighterLink, isWinner && styles.fighterNameWinner];

  if (!fighter) {
    return <Text style={style}>{name}</Text>;
  }

  return (
    <Text
      style={style}
      onPress={() =>
        navigation.navigate('FightersTab', {
          screen: 'FighterDetail',
          params: { fighterId: fighter.id, fighterName: fighter.name },
        })
      }
    >
      {name}
    </Text>
  );
}

function BroadcastTimes({
  event,
  locale,
  t,
  timeZone,
  styles,
}: {
  event: EventDetail;
  locale: string;
  t: ReturnType<typeof useLocale>['t'];
  timeZone?: string;
  styles: Styles;
}) {
  const segments: { label: string; time: string }[] = [];
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale === 'de' ? 'de-DE' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    });

  if (event.early_prelims_start_time) {
    segments.push({ label: t.eventDetail.earlyPrelims, time: formatTime(event.early_prelims_start_time) });
  }
  if (event.prelims_start_time) {
    segments.push({ label: t.eventDetail.prelims, time: formatTime(event.prelims_start_time) });
  }
  if (event.main_card_start_time) {
    segments.push({ label: t.eventDetail.mainCard, time: formatTime(event.main_card_start_time) });
  }

  if (segments.length === 0) return null;

  return (
    <View style={styles.broadcastTimes}>
      {segments.map((segment) => (
        <Text key={segment.label} style={styles.eventMeta}>
          {segment.label}: {segment.time}
        </Text>
      ))}
    </View>
  );
}

function FightVoteRow({
  fight,
  summary,
  onVote,
  t,
  styles,
}: {
  fight: Fight;
  summary: FightVoteSummary;
  onVote: (fightId: string, fighterId: string) => void;
  t: ReturnType<typeof useLocale>['t'];
  styles: Styles;
}) {
  if (!fight.fighter1 || !fight.fighter2) return null;
  const fighter1 = fight.fighter1;
  const fighter2 = fight.fighter2;

  if (!summary.myVote) {
    return (
      <View style={styles.voteRow}>
        <Pressable
          style={({ pressed }) => [styles.voteButton, pressed && pressedStyle]}
          onPress={() => onVote(fight.id, fighter1.id)}
        >
          <Text style={styles.voteButtonText} numberOfLines={1}>
            {t.eventDetail.votePick} {fighter1.name}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.voteButton, pressed && pressedStyle]}
          onPress={() => onVote(fight.id, fighter2.id)}
        >
          <Text style={styles.voteButtonText} numberOfLines={1}>
            {t.eventDetail.votePick} {fighter2.name}
          </Text>
        </Pressable>
      </View>
    );
  }

  const total = summary.fighter1Votes + summary.fighter2Votes;
  const pct1 = total > 0 ? Math.round((summary.fighter1Votes / total) * 100) : 50;
  const pct2 = 100 - pct1;

  return (
    <View style={styles.voteBarContainer}>
      <View style={styles.voteBarLabelsRow}>
        <Text style={[styles.voteBarLabel, summary.myVote === fighter1.id && styles.voteBarLabelActive]} numberOfLines={1}>
          {fighter1.name} · {pct1}%
        </Text>
        <Text style={[styles.voteBarLabel, summary.myVote === fighter2.id && styles.voteBarLabelActive]} numberOfLines={1}>
          {pct2}% · {fighter2.name}
        </Text>
      </View>
      <View style={styles.voteBarTrack}>
        <View style={[styles.voteBarFill1, { flex: Math.max(pct1, 1) }]} />
        <View style={[styles.voteBarFill2, { flex: Math.max(pct2, 1) }]} />
      </View>
    </View>
  );
}

export default function EventDetailScreen({ route }: Props) {
  const { eventId, eventName } = route.params;
  const { t, locale } = useLocale();
  const { timezoneOverride } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const commonStyles = useCommonStyles();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [fights, setFights] = useState<Fight[]>([]);
  const [votes, setVotes] = useState<Map<string, FightVoteSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([getEventDetail(eventId), getFightsForEvent(eventId)])
      .then(([eventData, fightsData]) => {
        setEvent(eventData);
        setFights(fightsData);
      })
      .catch(() => setError(t.common.error))
      .finally(() => setLoading(false));
  }, [eventId, t]);

  // Separate from the main load — a vote-fetch failure shouldn't block the
  // rest of the event/fight-card from rendering.
  useEffect(() => {
    const votable = fights.filter((f) => f.fighter1 && f.fighter2);
    if (votable.length === 0) return;
    getEventVotes(votable.map((f) => ({ id: f.id, fighter1_id: f.fighter1!.id, fighter2_id: f.fighter2!.id })))
      .then(setVotes)
      .catch(() => {});
  }, [fights]);

  const handleVote = (fightId: string, fighterId: string) => {
    const fight = fights.find((f) => f.id === fightId);
    if (!fight?.fighter1 || !fight.fighter2) return;

    setVotes((prev) => {
      const next = new Map(prev);
      const current = next.get(fightId) ?? { fighter1Votes: 0, fighter2Votes: 0, myVote: null };
      let { fighter1Votes, fighter2Votes } = current;
      if (current.myVote === fight.fighter1!.id) fighter1Votes -= 1;
      if (current.myVote === fight.fighter2!.id) fighter2Votes -= 1;
      if (fighterId === fight.fighter1!.id) fighter1Votes += 1;
      if (fighterId === fight.fighter2!.id) fighter2Votes += 1;
      next.set(fightId, { fighter1Votes, fighter2Votes, myVote: fighterId });
      return next;
    });

    castVote(fightId, fighterId).catch(() => {});
  };

  if (loading) {
    return <ActivityIndicator style={commonStyles.center} color={colors.textPrimary} />;
  }

  if (error) {
    return <Text style={commonStyles.error}>{error}</Text>;
  }

  // The prelims segment has its own headliner (lowest card_position within
  // card_segment === 'prelims') — worth calling out visually, separate
  // from sorting (see getFightsForEvent / CARD_SEGMENT_ORDER).
  const prelimFights = fights.filter((fight) => fight.card_segment === 'prelims');
  const prelimMainEventId =
    prelimFights.length > 0
      ? prelimFights.reduce((min, fight) =>
          (fight.card_position ?? Infinity) < (min.card_position ?? Infinity) ? fight : min
        ).id
      : undefined;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={fights}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.header}>
          {event && isEventUpcoming(event.event_date) && (
            <EventReminderBell eventId={eventId} eventName={event.name} eventDateIso={event.event_date} />
          )}
          <EventFavoriteHeart eventId={eventId} />
          {event && isEventLive(event) && (
            <View style={styles.liveBadgeSlot}>
              <LiveBadge />
            </View>
          )}
          {event?.status === 'cancelled' && (
            <Text style={styles.eventCancelledBanner}>{t.eventDetail.eventCancelled}</Text>
          )}
          {event?.organizations?.short_name && (
            <View style={styles.orgRow}>
              <Text style={styles.orgName}>{event.organizations.short_name}</Text>
              <OrganizationFollowBell organizationId={event.organization_id} />
            </View>
          )}
          <Text style={styles.eventName}>{event?.name ?? eventName}</Text>
          {event && (
            <Text style={styles.eventMeta}>
              {formatEventDate(event.event_date, locale, 'long', timezoneOverride ?? undefined)}
            </Text>
          )}
          {event && (
            <Text style={styles.eventMeta}>
              {[event.venue, event.city, event.venue_state, event.country].filter(Boolean).join(', ')}
            </Text>
          )}
          {event && (
            <BroadcastTimes event={event} locale={locale} t={t} timeZone={timezoneOverride ?? undefined} styles={styles} />
          )}
        </View>
      }
      ListEmptyComponent={<Text style={commonStyles.empty}>{t.eventDetail.emptyFightCard}</Text>}
      renderItem={({ item }) => {
        const cancelled = item.status === 'cancelled';
        return (
          <View style={[styles.fightCard, cancelled && styles.fightCardCancelled]}>
            <View style={styles.fightTags}>
              {cancelled && <Text style={styles.tagCancelled}>{t.eventDetail.cancelled}</Text>}
              {item.is_main_event && <Text style={styles.tagMain}>{t.eventDetail.mainEvent}</Text>}
              {item.id === prelimMainEventId && (
                <Text style={styles.tagPrelimMain}>{t.eventDetail.prelimMainEvent}</Text>
              )}
              {item.is_title_fight && <Text style={styles.tagTitle}>{t.eventDetail.titleFight}</Text>}
            </View>
            <View style={styles.matchupRow}>
              <FighterLink fighter={item.fighter1} isWinner={item.fighter1?.id === item.result_winner_id} styles={styles} />
              <Text style={styles.vs}>vs</Text>
              <FighterLink fighter={item.fighter2} isWinner={item.fighter2?.id === item.result_winner_id} styles={styles} />
            </View>
            {(item.weight_class || item.scheduled_rounds) && (
              <Text style={styles.weightClass}>
                {[item.weight_class, item.scheduled_rounds ? `${item.scheduled_rounds} ${t.eventDetail.rounds}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            )}
            {(item.result_method_detail || item.result_method) && (
              <Text style={styles.result}>
                {t.eventDetail.resultVia} {item.result_method_detail ?? item.result_method}
                {item.result_round ? ` · ${t.eventDetail.round} ${item.result_round}` : ''}
                {item.result_time ? ` (${item.result_time})` : ''}
              </Text>
            )}
            {!cancelled && !item.result_winner_id && (
              <FightVoteRow
                fight={item}
                summary={votes.get(item.id) ?? { fighter1Votes: 0, fighter2Votes: 0, myVote: null }}
                onVote={handleVote}
                t={t}
                styles={styles}
              />
            )}
          </View>
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
    header: {
      marginBottom: spacing.lg,
      position: 'relative',
    },
    eventName: {
      fontSize: 22,
      fontWeight: '700',
      marginBottom: 6,
      color: colors.textPrimary,
      paddingRight: 60,
    },
    eventMeta: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    liveBadgeSlot: {
      marginBottom: spacing.sm,
    },
    orgRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: 4,
    },
    orgName: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    eventCancelledBanner: {
      alignSelf: 'flex-start',
      fontSize: 12,
      fontWeight: '700',
      color: colors.background,
      backgroundColor: colors.danger,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: 6,
      marginBottom: spacing.sm,
    },
    broadcastTimes: {
      marginTop: spacing.sm,
      gap: 2,
    },
    fightCard: {
      padding: 14,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fightCardCancelled: {
      opacity: 0.5,
    },
    tagCancelled: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.background,
      backgroundColor: colors.danger,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: 6,
    },
    fightTags: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: 6,
    },
    tagMain: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.background,
      backgroundColor: colors.textPrimary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: 6,
    },
    tagPrelimMain: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textPrimary,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.textPrimary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: 6,
    },
    tagTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.background,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: 6,
    },
    matchupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    fighterName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    fighterNameWinner: {
      color: colors.accent,
    },
    fighterLink: {
      color: colors.link,
      textDecorationLine: 'underline',
    },
    vs: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    weightClass: {
      marginTop: 6,
      fontSize: 13,
      color: colors.textSecondary,
    },
    result: {
      marginTop: 4,
      fontSize: 12,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
    voteRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    voteButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    voteButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    voteBarContainer: {
      marginTop: spacing.sm,
    },
    voteBarLabelsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    voteBarLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    voteBarLabelActive: {
      color: colors.accent,
      fontWeight: '700',
    },
    voteBarTrack: {
      flexDirection: 'row',
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: colors.border,
    },
    voteBarFill1: {
      backgroundColor: colors.accent,
    },
    voteBarFill2: {
      backgroundColor: colors.surfaceAlt,
    },
  });
