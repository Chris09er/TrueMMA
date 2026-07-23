import type { NavigatorScreenParams } from '@react-navigation/native';

export type EventsStackParamList = {
  EventList: undefined;
  EventDetail: { eventId: string; eventName: string };
};

export type FightersStackParamList = {
  FighterList: undefined;
  FighterDetail: { fighterId: string; fighterName: string };
};

export type ContactStackParamList = {
  Contact: undefined;
  Legal: { doc: 'privacy' | 'imprint' };
};

export type RootTabParamList = {
  EventsTab: NavigatorScreenParams<EventsStackParamList> | undefined;
  FightersTab: NavigatorScreenParams<FightersStackParamList> | undefined;
  ProfileTab: undefined;
  ContactTab: NavigatorScreenParams<ContactStackParamList> | undefined;
};
