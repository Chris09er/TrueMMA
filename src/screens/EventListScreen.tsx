import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { getOrganizations, getUpcomingEvents } from '../lib/queries';
import type { EventListItem, Organization } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EventList'>;

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function EventListScreen({ navigation }: Props) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrganizations().then(setOrganizations).catch(() => {});
  }, []);

  const loadEvents = useCallback(() => {
    setLoading(true);
    setError(null);
    getUpcomingEvents(selectedOrgId)
      .then(setEvents)
      .catch((err) => setError(err.message ?? 'Fehler beim Laden der Events'))
      .finally(() => setLoading(false));
  }, [selectedOrgId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <FilterButton
          label="Alle"
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
      </View>

      {loading && <ActivityIndicator style={styles.center} />}
      {!loading && error && <Text style={styles.error}>{error}</Text>}
      {!loading && !error && (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Keine kommenden Events gefunden.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.eventCard}
              onPress={() =>
                navigation.navigate('EventDetail', { eventId: item.id, eventName: item.name })
              }
            >
              <Text style={styles.eventOrg}>{item.organizations?.short_name ?? ''}</Text>
              <Text style={styles.eventName}>{item.name}</Text>
              <Text style={styles.eventMeta}>{formatDate(item.event_date)}</Text>
              <Text style={styles.eventMeta}>
                {[item.venue, item.city, item.country].filter(Boolean).join(', ')}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function FilterButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterButton, active && styles.filterButtonActive]}
    >
      <Text style={[styles.filterButtonText, active && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#eee',
  },
  filterButtonActive: {
    backgroundColor: '#111',
  },
  filterButtonText: {
    color: '#111',
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#fff',
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
    gap: 10,
  },
  eventCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    marginBottom: 10,
  },
  eventOrg: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    marginBottom: 4,
  },
  eventName: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  eventMeta: {
    fontSize: 13,
    color: '#555',
  },
});
