import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HeaderLogoLeft from "../../../src/components/HeaderLogoLeft";
import { C } from "../../../src/theme";
import { headerInset } from "../../../src/lib/headerInset";

export const unstable_settings = { initialRouteName: "index" };

export default function TournamentsLayout() {
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
      <Stack.Screen name="index" options={{ title: "Tournaments" }} />
      {/* Modal, so it overrides the stack's card inset: a sheet is already
          inset from the top of the display and must not add the status bar
          height a second time. */}
      <Stack.Screen
        name="new"
        options={{
          title: "New tournament", presentation: "modal",
          contentStyle: { backgroundColor: "transparent", paddingTop: headerInset(0, "modal") },
        }}
      />
      <Stack.Screen name="[id]" options={{ title: "Tournament" }} />
      <Stack.Screen name="edit/[id]" options={{ title: "Edit tournament" }} />
      {/* Without this the header falls back to the route segment and renders
          the raw parameter name. The screen's own heading already reads "Live
          Ops Dashboard". Renaming the concept itself is audit M3, phase 4. */}
      <Stack.Screen name="ops/[tournamentId]" options={{ title: "Live ops" }} />
    </Stack>
  );
}
