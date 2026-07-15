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
import type { EventsStackParamList } from '../navigation';
import { getOrganizations, getUpcomingEvents } from '../lib/queries';
import type { EventListItem, Organization } from '../lib/types';
import { colors, radius, spacing } from '../lib/theme';
import { useLocale } from '../lib/i18n';
import EventReminderBell from '../components/EventReminderBell';

type Props = NativeStackScreenProps<EventsStackParamList, 'EventList'>;

function formatDate(isoDate: string, locale: string): string {
  return new Date(isoDate).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function EventListScreen({ navigation }: Props) {
  const { t, locale } = useLocale();
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
      .catch(() => setError(t.common.error))
      .finally(() => setLoading(false));
  }, [selectedOrgId, t]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <FilterButton
          label={t.eventList.filterAll}
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

      {loading && <ActivityIndicator style={styles.center} color={colors.textPrimary} />}
      {!loading && error && <Text style={styles.error}>{error}</Text>}
      {!loading && !error && (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t.eventList.empty}</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.eventCard}
              onPress={() =>
                navigation.navigate('EventDetail', { eventId: item.id, eventName: item.name })
              }
            >
              <EventReminderBell eventId={item.id} eventName={item.name} eventDateIso={item.event_date} />
              <Text style={styles.eventOrg}>{item.organizations?.short_name ?? ''}</Text>
              <Text style={styles.eventName}>{item.name}</Text>
              <Text style={styles.eventMeta}>{formatDate(item.event_date, locale)}</Text>
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
    backgroundColor: colors.background,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  filterButtonActive: {
    backgroundColor: colors.textPrimary,
  },
  filterButtonText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: colors.background,
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
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  eventName: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
    color: colors.textPrimary,
    paddingRight: 28,
  },
  eventMeta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
