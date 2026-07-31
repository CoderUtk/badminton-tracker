import { Stack } from "expo-router";
import { C } from "../../../src/theme";

export const unstable_settings = { initialRouteName: "index" };

export default function WatchLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        contentStyle: { backgroundColor: C.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Live matches" }} />
      <Stack.Screen name="[matchId]" options={{ title: "Live" }} />
    </Stack>
  );
}
