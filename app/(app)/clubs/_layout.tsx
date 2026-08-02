import React from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { LogoMark } from "../../../src/components/Logo";
import { C } from "../../../src/theme";

const headerLogo = () => (
  <View style={{ paddingRight: 16 }}><LogoMark size={26} /></View>
);

// Clubs are opened from Home; this isolated stack means back returns to Home
// rather than jumping between tabs.
export const unstable_settings = { initialRouteName: "[id]" };

export default function ClubsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        contentStyle: { backgroundColor: C.bg },
        headerRight: headerLogo,
      }}
    >
      <Stack.Screen name="[id]" options={{ title: "Club" }} />
      <Stack.Screen name="requests/[clubId]" options={{ title: "Pending requests" }} />
    </Stack>
  );
}
