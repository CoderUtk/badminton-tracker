import React from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { LogoMark } from "../../../src/components/Logo";
import { C } from "../../../src/theme";

export const unstable_settings = { initialRouteName: "index" };

const headerLogo = () => (
  <View style={{ paddingRight: 16 }}><LogoMark size={26} /></View>
);

export default function MatchesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        contentStyle: { backgroundColor: C.bg },
        headerRight: headerLogo,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Matches" }} />
      <Stack.Screen name="[id]" options={{ title: "Match" }} />
    </Stack>
  );
}
