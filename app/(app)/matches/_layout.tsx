import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HeaderLogoLeft from "../../../src/components/HeaderLogoLeft";
import { C } from "../../../src/theme";
import { headerInset } from "../../../src/lib/headerInset";

export const unstable_settings = { initialRouteName: "index" };


export default function MatchesLayout() {
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
      <Stack.Screen name="index" options={{ title: "Matches" }} />
      <Stack.Screen name="[id]" options={{ title: "Match" }} />
    </Stack>
  );
}
