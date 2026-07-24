import React from "react";
import { Tabs } from "expo-router";
import { Text } from "react-native";
import { C } from "../../src/theme";

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: string }) {
    return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
  };

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
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("🏸") }} />
      <Tabs.Screen name="sessions" options={{ title: "Sessions", tabBarIcon: icon("📅"), headerShown: false }} />
      <Tabs.Screen name="matches" options={{ title: "Matches", tabBarIcon: icon("📋"), headerShown: false }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("👤") }} />
      <Tabs.Screen name="clubs" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
