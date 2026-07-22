import { useMemo } from 'react';
import { View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import type { EventsStackParamList, FightersStackParamList, RootTabParamList } from './src/navigation';
import { LocaleProvider, useLocale } from './src/lib/i18n';
import { AuthProvider } from './src/lib/auth';
import BiometricGate from './src/components/BiometricGate';
import { colors, ThemeProvider, useTheme } from './src/lib/theme';
import EventDetailScreen from './src/screens/EventDetailScreen';
import EventListScreen from './src/screens/EventListScreen';
import FighterListScreen from './src/screens/FighterListScreen';
import FighterDetailScreen from './src/screens/FighterDetailScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ContactScreen from './src/screens/ContactScreen';

const EventsStack = createNativeStackNavigator<EventsStackParamList>();
const FightersStack = createNativeStackNavigator<FightersStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

function useHeaderScreenOptions() {
  const { colors: themeColors } = useTheme();
  return {
    headerStyle: { backgroundColor: themeColors.surface },
    headerTitleStyle: { color: themeColors.textPrimary },
    headerTintColor: themeColors.textPrimary,
  };
}

function EventsStackNavigator() {
  const { t } = useLocale();
  const screenOptions = useHeaderScreenOptions();
  return (
    <EventsStack.Navigator screenOptions={screenOptions}>
      <EventsStack.Screen
        name="EventList"
        component={EventListScreen}
        options={{ title: t.eventList.title, headerShown: false }}
      />
      <EventsStack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ headerShown: false }}
      />
    </EventsStack.Navigator>
  );
}

function FightersStackNavigator() {
  const { t } = useLocale();
  const screenOptions = useHeaderScreenOptions();
  return (
    <FightersStack.Navigator screenOptions={screenOptions}>
      <FightersStack.Screen
        name="FighterList"
        component={FighterListScreen}
        options={{ title: t.fighterList.title, headerShown: false }}
      />
      <FightersStack.Screen
        name="FighterDetail"
        component={FighterDetailScreen}
        options={{ headerShown: false }}
      />
    </FightersStack.Navigator>
  );
}

function RootTabs() {
  const { t } = useLocale();
  const { colors: themeColors } = useTheme();
  const screenOptions = useHeaderScreenOptions();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...screenOptions,
        headerShown: false,
        tabBarStyle: { backgroundColor: themeColors.surface, borderTopColor: themeColors.border },
        tabBarActiveTintColor: themeColors.accent,
        tabBarInactiveTintColor: themeColors.textSecondary,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<keyof RootTabParamList, keyof typeof MaterialCommunityIcons.glyphMap> = {
            EventsTab: 'calendar-star',
            FightersTab: 'boxing-glove',
            ProfileTab: 'account-circle-outline',
            ContactTab: 'email-outline',
          };
          return (
            <MaterialCommunityIcons
              name={icons[route.name as keyof RootTabParamList]}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="EventsTab" component={EventsStackNavigator} options={{ title: t.tabs.events }} />
      <Tab.Screen name="FightersTab" component={FightersStackNavigator} options={{ title: t.tabs.fighters }} />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: t.tabs.profile, headerShown: false }}
      />
      <Tab.Screen
        name="ContactTab"
        component={ContactScreen}
        options={{ title: t.tabs.contact, headerShown: false }}
      />
    </Tab.Navigator>
  );
}

function Navigation() {
  const { mode, colors: themeColors } = useTheme();
  const navTheme = useMemo(() => {
    const base = mode === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: themeColors.background,
        card: themeColors.surface,
        border: themeColors.border,
        text: themeColors.textPrimary,
        primary: themeColors.accent,
      },
    };
  }, [mode, themeColors]);

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <RootTabs />
    </NavigationContainer>
  );
}

export default function App() {
  // Explicit per-file requires, not the package-level named exports — those
  // pull every weight (~34 ttf files) into the bundle since Metro can't
  // tree-shake requires evaluated inside @expo-google-fonts's index module.
  const [fontsLoaded] = useFonts({
    BarlowCondensed_600SemiBold: require('@expo-google-fonts/barlow-condensed/600SemiBold/BarlowCondensed_600SemiBold.ttf'),
    BarlowCondensed_700Bold: require('@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf'),
    Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  });

  if (!fontsLoaded) {
    // Plain placeholder instead of a native splash screen dependency —
    // fonts load in well under a second, and this keeps the change JS-only.
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <ThemeProvider>
      <LocaleProvider>
        <AuthProvider>
          <BiometricGate>
            <Navigation />
          </BiometricGate>
        </AuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
