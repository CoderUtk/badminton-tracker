import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HeaderLogoLeft from "../../../src/components/HeaderLogoLeft";
import { C } from "../../../src/theme";
import { headerInset } from "../../../src/lib/headerInset";


// Clubs are opened from Home; this isolated stack means back returns to Home
// rather than jumping between tabs.
export const unstable_settings = { initialRouteName: "[id]" };

export default function ClubsLayout() {
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
      <Stack.Screen name="[id]" options={{ title: "Club" }} />
      <Stack.Screen name="requests/[clubId]" options={{ title: "Pending requests" }} />
      <Stack.Screen name="players/[clubId]" options={{ title: "Players" }} />
      <Stack.Screen name="[id]/live" options={{ title: "Live matches" }} />
    </Stack>
  );
}
