import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../lib/auth';
import { followEvent, unfollowEvent } from '../lib/eventFollows';
import { useLocale } from '../lib/i18n';
import {
  cancelEventReminder,
  isEventReminderSet,
  requestNotificationPermission,
  scheduleEventReminder,
} from '../lib/notifications';
import BellIconButton from './BellIconButton';

type Props = {
  eventId: string;
  eventName: string;
  eventDateIso: string;
};

export default function EventReminderBell({ eventId, eventName, eventDateIso }: Props) {
  const { t } = useLocale();
  const { user } = useAuth();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isEventReminderSet(eventId).then(setActive);
  }, [eventId]);

  const handlePress = async (event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
    if (busy) return;
    setBusy(true);
    try {
      if (active) {
        await cancelEventReminder(eventId);
        setActive(false);
        Alert.alert(t.notifications.eventReminderOffTitle, t.notifications.eventReminderOffBody);
        // Best-effort: the local reminder is the source of truth for this
        // bell, event_follows only mirrors it for the profile screen.
        if (user) unfollowEvent(user.id, eventId).catch(() => {});
      } else {
        const granted = await requestNotificationPermission();
        if (!granted) {
          Alert.alert(t.notifications.permissionDeniedTitle, t.notifications.permissionDeniedBody);
          return;
        }
        const scheduled = await scheduleEventReminder(
          eventId,
          eventDateIso,
          t.notifications.eventReminderTitle,
          t.notifications.eventReminderBody(eventName)
        );
        setActive(scheduled);
        if (scheduled) {
          Alert.alert(t.notifications.eventReminderOnTitle, t.notifications.eventReminderOnBody);
          if (user) followEvent(user.id, eventId).catch(() => {});
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return <BellIconButton active={active} busy={busy} onPress={handlePress} />;
}
