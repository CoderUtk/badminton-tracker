import { View } from "react-native";
import { Stack } from "expo-router";
import HeaderLogoLeft from "../../../src/components/HeaderLogoLeft";
import { C } from "../../../src/theme";

export const unstable_settings = { initialRouteName: "index" };


export default function MatchesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        contentStyle: { backgroundColor: C.bg },
        headerLeft: (props) => <HeaderLogoLeft {...props} />,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Matches" }} />
      <Stack.Screen name="[id]" options={{ title: "Match" }} />
    </Stack>
  );
}
