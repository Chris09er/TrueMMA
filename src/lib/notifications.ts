import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const STORAGE_PREFIX = 'true-mma:event-reminder:';

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// Checks the current permission status without ever prompting the user —
// use this anywhere permission is only being read, not acted on (e.g.
// deciding whether a "following" badge should show), so the OS's one-shot
// permission dialog is never triggered as a side effect of rendering.
export async function hasNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

export async function isEventReminderSet(eventId: string): Promise<boolean> {
  const id = await AsyncStorage.getItem(STORAGE_PREFIX + eventId);
  return id !== null;
}

// Non-interactive: resolves the device's Expo push token only if notification
// permission is already granted, otherwise null. Never prompts. Used to look
// up anonymous (token-anchored) follows for the profile without triggering the
// OS permission dialog as a side effect of rendering.
export async function getPushTokenIfPermitted(): Promise<string | null> {
  const granted = await hasNotificationPermission();
  if (!granted) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

// All event ids that currently have a local reminder scheduled — the
// anonymous equivalent of the event_follows table (which only exists for
// logged-in users). The local reminder is the source of truth for the bell,
// so this is what the logged-out profile lists as "followed events".
export async function getReminderEventIds(): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  return keys.filter((key) => key.startsWith(STORAGE_PREFIX)).map((key) => key.slice(STORAGE_PREFIX.length));
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
