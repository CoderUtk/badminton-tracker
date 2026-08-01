import React from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import Icon, { type IconName } from "../../src/components/Icon";
import { LogoMark } from "../../src/components/Logo";
import { C } from "../../src/theme";

const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: string; size: number }) {
    return <Icon name={name} color={color} size={size} />;
  };

export const headerLogo = () => (
  <View style={{ paddingRight: 16 }}>
    <LogoMark size={26} />
  </View>
);

export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.line },
        tabBarActiveTintColor: C.red,
        tabBarInactiveTintColor: C.text2,
        sceneStyle: { backgroundColor: C.bg },
        headerRight: headerLogo,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home") }} />
      <Tabs.Screen name="sessions" options={{ title: "Sessions", tabBarIcon: icon("calendar"), headerShown: false }} />
      <Tabs.Screen name="matches" options={{ title: "Matches", tabBarIcon: icon("badminton"), headerShown: false }} />
      <Tabs.Screen name="tournaments" options={{ title: "Cups", tabBarIcon: icon("trophy"), headerShown: false }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person") }} />
      <Tabs.Screen name="clubs" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="watch" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
