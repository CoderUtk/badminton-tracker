import React from "react";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HeaderLogoLeft from "../../../src/components/HeaderLogoLeft";
import { C } from "../../../src/theme";
import { headerInset } from "../../../src/lib/headerInset";


// Anchor the list beneath any detail screen, so back always returns to it —
// even when a detail is reached directly (e.g. after creating a session).
export const unstable_settings = { initialRouteName: "index" };

export default function SessionsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Stack
      screenOptions={{
        // Transparent and floating so the app-wide ground reads continuously
        // through the header instead of being capped by a flat band.
        headerTransparent: true,
        headerShadowVisible: false,
        headerTintColor: C.text,
        contentStyle: { backgroundColor: "transparent", paddingTop: headerInset(insets.top) },
        headerLeft: (props) => <HeaderLogoLeft {...props} />,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Sessions" }} />
      <Stack.Screen name="[id]" options={{ title: "Session" }} />
    </Stack>
  );
}
