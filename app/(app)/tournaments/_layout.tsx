import { Stack } from "expo-router";
import { C } from "../../../src/theme";

export const unstable_settings = { initialRouteName: "index" };

export default function TournamentsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        contentStyle: { backgroundColor: C.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Tournaments" }} />
      <Stack.Screen name="new" options={{ title: "New tournament", presentation: "modal" }} />
      <Stack.Screen name="[id]" options={{ title: "Bracket" }} />
      <Stack.Screen name="edit/[id]" options={{ title: "Edit tournament" }} />
    </Stack>
  );
}
