import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const STORAGE_PREFIX = 'mma-pocket:event-reminder:';

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function isEventReminderSet(eventId: string): Promise<boolean> {
  const id = await AsyncStorage.getItem(STORAGE_PREFIX + eventId);
  return id !== null;
}

export async function scheduleEventReminder(
  eventId: string,
  eventDateIso: string,
  title: string,
  body: string
): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) return false;

  const triggerDate = new Date(eventDateIso);
  if (triggerDate.getTime() <= Date.now()) return false;

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
  });

  await AsyncStorage.setItem(STORAGE_PREFIX + eventId, notificationId);
  return true;
}

export async function cancelEventReminder(eventId: string): Promise<void> {
  const notificationId = await AsyncStorage.getItem(STORAGE_PREFIX + eventId);
  if (notificationId) {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    await AsyncStorage.removeItem(STORAGE_PREFIX + eventId);
  }
}
