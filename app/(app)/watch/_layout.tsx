import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "../../../src/theme";
import { headerInset } from "../../../src/lib/headerInset";

export const unstable_settings = { initialRouteName: "[matchId]" };

export default function WatchLayout() {
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
      }}
    >
      <Stack.Screen name="[matchId]" options={{ title: "Live" }} />
    </Stack>
  );
}
