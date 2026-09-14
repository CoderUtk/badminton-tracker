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
      {/* Modal, so it overrides the stack's card inset with the taller sheet
          bar. Pass the real inset, as every other modal here does: dropping
          the status bar height is only correct for an iOS sheet, which is
          already inset from the top of the display, and headerInset applies
          that rule itself. Hardcoding 0 lost the bar height on Android, so
          the Config/Entrants tabs rendered under the header — the Entrants
          tab could not be tapped and no tournament could be created. */}
      <Stack.Screen
        name="new"
        options={{
          title: "New tournament", presentation: "modal",
          contentStyle: { backgroundColor: "transparent", paddingTop: headerInset(insets.top, "modal") },
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
