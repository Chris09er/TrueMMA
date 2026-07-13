import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import type { RootStackParamList } from './src/navigation';
import EventDetailScreen from './src/screens/EventDetailScreen';
import EventListScreen from './src/screens/EventListScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator>
        <Stack.Screen
          name="EventList"
          component={EventListScreen}
          options={{ title: 'MMA Pocket' }}
        />
        <Stack.Screen
          name="EventDetail"
          component={EventDetailScreen}
          options={({ route }) => ({ title: route.params.eventName })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
