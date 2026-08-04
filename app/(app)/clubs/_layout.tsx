import { Stack } from "expo-router";
import HeaderLogoLeft from "../../../src/components/HeaderLogoLeft";
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
        headerLeft: (props) => <HeaderLogoLeft {...props} />,
      }}
    >
      <Stack.Screen name="[id]" options={{ title: "Club" }} />
      <Stack.Screen name="requests/[clubId]" options={{ title: "Pending requests" }} />
      <Stack.Screen name="[id]/live" options={{ title: "Live matches" }} />
    </Stack>
  );
}
