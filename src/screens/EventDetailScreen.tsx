import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { EventsStackParamList } from '../navigation';
import { getEventDetail, getFightsForEvent } from '../lib/queries';
import type { EventDetail, Fight, Fighter } from '../lib/types';
import { colors, radius, spacing } from '../lib/theme';
import { useLocale } from '../lib/i18n';
import EventReminderBell from '../components/EventReminderBell';

type Props = NativeStackScreenProps<EventsStackParamList, 'EventDetail'>;

function formatDate(isoDate: string, locale: string): string {
  return new Date(isoDate).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function fighterProfileUrl(fighter: Fighter | null): string | null {
  return fighter?.tapology_url ?? fighter?.sherdog_url ?? null;
}

function FighterLink({ fighter, isWinner }: { fighter: Fighter | null; isWinner: boolean }) {
  const url = fighterProfileUrl(fighter);
  const name = fighter?.name ?? 'TBA';
  const style = [
    styles.fighterName,
    url && styles.fighterLink,
    isWinner && styles.fighterNameWinner,
  ];

  if (!url) {
    return <Text style={style}>{name}</Text>;
  }

  return (
    <Text style={style} onPress={() => Linking.openURL(url)}>
      {name}
    </Text>
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
    return <ActivityIndicator style={styles.center} color={colors.textPrimary} />;
  }

  if (error) {
    return <Text style={styles.error}>{error}</Text>;
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={fights}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.header}>
          {event && new Date(event.event_date).getTime() > Date.now() && (
            <EventReminderBell eventId={eventId} eventName={event.name} eventDateIso={event.event_date} />
          )}
          <Text style={styles.eventName}>{event?.name ?? eventName}</Text>
          {event && <Text style={styles.eventMeta}>{formatDate(event.event_date, locale)}</Text>}
          {event && (
            <Text style={styles.eventMeta}>
              {[event.venue, event.city, event.country].filter(Boolean).join(', ')}
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>{t.eventDetail.emptyFightCard}</Text>}
      renderItem={({ item }) => (
        <View style={styles.fightCard}>
          <View style={styles.fightTags}>
            {item.is_main_event && <Text style={styles.tagMain}>{t.eventDetail.mainEvent}</Text>}
            {item.is_title_fight && <Text style={styles.tagTitle}>{t.eventDetail.titleFight}</Text>}
          </View>
          <View style={styles.matchupRow}>
            <FighterLink fighter={item.fighter1} isWinner={item.fighter1?.id === item.result_winner_id} />
            <Text style={styles.vs}>vs</Text>
            <FighterLink fighter={item.fighter2} isWinner={item.fighter2?.id === item.result_winner_id} />
          </View>
          {item.weight_class && <Text style={styles.weightClass}>{item.weight_class}</Text>}
          {item.result_method && (
            <Text style={styles.result}>
              {t.eventDetail.resultVia} {item.result_method}
              {item.result_round ? ` · ${t.eventDetail.round} ${item.result_round}` : ''}
              {item.result_time ? ` (${item.result_time})` : ''}
            </Text>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    marginTop: 40,
  },
  error: {
    padding: spacing.lg,
    color: colors.danger,
  },
  empty: {
    padding: spacing.lg,
    color: colors.textSecondary,
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
    paddingRight: 32,
  },
  eventMeta: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  fightCard: {
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
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
