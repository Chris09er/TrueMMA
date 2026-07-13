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
import type { RootStackParamList } from '../navigation';
import { getEventDetail, getFightsForEvent } from '../lib/queries';
import type { EventDetail, Fight, Fighter } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EventDetail'>;

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function fighterProfileUrl(fighter: Fighter | null): string | null {
  return fighter?.tapology_url ?? fighter?.sherdog_url ?? null;
}

function FighterLink({ fighter }: { fighter: Fighter | null }) {
  const url = fighterProfileUrl(fighter);
  const name = fighter?.name ?? 'TBA';

  if (!url) {
    return <Text style={styles.fighterName}>{name}</Text>;
  }

  return (
    <Text style={[styles.fighterName, styles.fighterLink]} onPress={() => Linking.openURL(url)}>
      {name}
    </Text>
  );
}

export default function EventDetailScreen({ route }: Props) {
  const { eventId, eventName } = route.params;
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
      .catch((err) => setError(err.message ?? 'Fehler beim Laden der Fight Card'))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) {
    return <ActivityIndicator style={styles.center} />;
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
          <Text style={styles.eventName}>{event?.name ?? eventName}</Text>
          {event && <Text style={styles.eventMeta}>{formatDate(event.event_date)}</Text>}
          {event && (
            <Text style={styles.eventMeta}>
              {[event.venue, event.city, event.country].filter(Boolean).join(', ')}
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>Fight Card noch nicht verfügbar.</Text>}
      renderItem={({ item }) => (
        <View style={styles.fightCard}>
          <View style={styles.fightTags}>
            {item.is_main_event && <Text style={styles.tagMain}>MAIN EVENT</Text>}
            {item.is_title_fight && <Text style={styles.tagTitle}>TITLE FIGHT</Text>}
          </View>
          <View style={styles.matchupRow}>
            <FighterLink fighter={item.fighter1} />
            <Text style={styles.vs}>vs</Text>
            <FighterLink fighter={item.fighter2} />
          </View>
          {item.weight_class && <Text style={styles.weightClass}>{item.weight_class}</Text>}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    marginTop: 40,
  },
  error: {
    padding: 16,
    color: 'crimson',
  },
  empty: {
    padding: 16,
    color: '#666',
  },
  list: {
    padding: 12,
  },
  header: {
    marginBottom: 16,
  },
  eventName: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  eventMeta: {
    fontSize: 14,
    color: '#555',
  },
  fightCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    marginBottom: 10,
  },
  fightTags: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  tagMain: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#111',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#b8860b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  fighterName: {
    fontSize: 16,
    fontWeight: '600',
  },
  fighterLink: {
    color: '#0066cc',
    textDecorationLine: 'underline',
  },
  vs: {
    fontSize: 13,
    color: '#888',
  },
  weightClass: {
    marginTop: 6,
    fontSize: 13,
    color: '#555',
  },
});
