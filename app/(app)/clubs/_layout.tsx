import React from "react";
import { Stack } from "expo-router";
import { C } from "../../../src/theme";

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
      }}
    >
      <Stack.Screen name="[id]" options={{ title: "Club" }} />
    </Stack>
  );
}
