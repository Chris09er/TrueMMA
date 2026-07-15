import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import type { EventsStackParamList, RootTabParamList } from './src/navigation';
import { LocaleProvider, useLocale } from './src/lib/i18n';
import { colors } from './src/lib/theme';
import EventDetailScreen from './src/screens/EventDetailScreen';
import EventListScreen from './src/screens/EventListScreen';
import FighterListScreen from './src/screens/FighterListScreen';
import LanguageScreen from './src/screens/LanguageScreen';
import ContactScreen from './src/screens/ContactScreen';

const EventsStack = createNativeStackNavigator<EventsStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    text: colors.textPrimary,
    primary: colors.accentGold,
  },
};

const screenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTitleStyle: { color: colors.textPrimary },
  headerTintColor: colors.textPrimary,
};

function EventsStackNavigator() {
  const { t } = useLocale();
  return (
    <EventsStack.Navigator screenOptions={screenOptions}>
      <EventsStack.Screen
        name="EventList"
        component={EventListScreen}
        options={{ title: t.eventList.title }}
      />
      <EventsStack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={({ route }) => ({ title: route.params.eventName })}
      />
    </EventsStack.Navigator>
  );
}

function RootTabs() {
  const { t } = useLocale();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...screenOptions,
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accentGold,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
            EventsTab: 'calendar',
            FightersTab: 'people',
            LanguageTab: 'language',
            ContactTab: 'mail',
          };
          return <Ionicons name={icons[route.name as keyof RootTabParamList]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="EventsTab" component={EventsStackNavigator} options={{ title: t.tabs.events }} />
      <Tab.Screen
        name="FightersTab"
        component={FighterListScreen}
        options={{ title: t.tabs.fighters, headerShown: true, headerTitle: t.fighterList.title }}
      />
      <Tab.Screen
        name="LanguageTab"
        component={LanguageScreen}
        options={{ title: t.tabs.language, headerShown: true, headerTitle: t.language.title }}
      />
      <Tab.Screen
        name="ContactTab"
        component={ContactScreen}
        options={{ title: t.tabs.contact, headerShown: true, headerTitle: t.contact.title }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <LocaleProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" />
        <RootTabs />
      </NavigationContainer>
    </LocaleProvider>
  );
}
