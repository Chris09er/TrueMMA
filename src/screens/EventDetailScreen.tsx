import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { EventsStackParamList, RootTabParamList } from '../navigation';
import { getEventDetail, getFightsForEvent, isEventUpcoming } from '../lib/queries';
import type { EventDetail, Fight, Fighter } from '../lib/types';
import { colors, commonStyles, radius, spacing } from '../lib/theme';
import { formatEventDate } from '../lib/dateFormat';
import { useLocale } from '../lib/i18n';
import EventReminderBell from '../components/EventReminderBell';
import EventFavoriteHeart from '../components/EventFavoriteHeart';

type Props = NativeStackScreenProps<EventsStackParamList, 'EventDetail'>;

function FighterLink({ fighter, isWinner }: { fighter: Fighter | null; isWinner: boolean }) {
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
}: {
  event: EventDetail;
  locale: string;
  t: ReturnType<typeof useLocale>['t'];
}) {
  const segments: { label: string; time: string }[] = [];
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale === 'de' ? 'de-DE' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
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

export default function EventDetailScreen({ route }: Props) {
  const { eventId, eventName } = route.params;
  const { t, locale } = useLocale();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [fights, setFights] = useState<Fight[]>([]);
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
          {event?.status === 'cancelled' && (
            <Text style={styles.eventCancelledBanner}>{t.eventDetail.eventCancelled}</Text>
          )}
          <Text style={styles.eventName}>{event?.name ?? eventName}</Text>
          {event && (
            <Text style={styles.eventMeta}>{formatEventDate(event.event_date, locale, 'long')}</Text>
          )}
          {event && (
            <Text style={styles.eventMeta}>
              {[event.venue, event.city, event.venue_state, event.country].filter(Boolean).join(', ')}
            </Text>
          )}
          {event && <BroadcastTimes event={event} locale={locale} t={t} />}
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
              <FighterLink fighter={item.fighter1} isWinner={item.fighter1?.id === item.result_winner_id} />
              <Text style={styles.vs}>vs</Text>
              <FighterLink fighter={item.fighter2} isWinner={item.fighter2?.id === item.result_winner_id} />
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
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.accentGold,
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
    color: colors.accentGold,
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
});
