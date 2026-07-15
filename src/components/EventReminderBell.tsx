import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
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
      }
    } finally {
      setBusy(false);
    }
  };

  return <BellIconButton active={active} busy={busy} onPress={handlePress} />;
}
