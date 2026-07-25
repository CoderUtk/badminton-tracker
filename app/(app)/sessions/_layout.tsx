import React from "react";
import { Stack } from "expo-router";
import { LogoMark } from "../../../src/components/Logo";
import { View } from "react-native";
import { C } from "../../../src/theme";

const headerLogo = () => (
  <View style={{ paddingRight: 16 }}><LogoMark size={26} /></View>
);

// Anchor the list beneath any detail screen, so back always returns to it —
// even when a detail is reached directly (e.g. after creating a session).
export const unstable_settings = { initialRouteName: "index" };

export default function SessionsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        contentStyle: { backgroundColor: C.bg },
        headerRight: headerLogo,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Sessions" }} />
      <Stack.Screen name="[id]" options={{ title: "Session" }} />
    </Stack>
  );
}
