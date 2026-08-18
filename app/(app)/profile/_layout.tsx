import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HeaderLogoLeft from "../../../src/components/HeaderLogoLeft";
import Logo from "../../../src/components/Logo";
import { C } from "../../../src/theme";
import { headerInset } from "../../../src/lib/headerInset";

export default function ProfileLayout() {
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
      <Stack.Screen
        name="index"
        options={{
          headerTitle: () => <Logo size={24} />,
          headerTitleAlign: "center",
        }}
      />
      <Stack.Screen
        name="friends"
        options={{ title: "Friends", headerLeft: (props) => <HeaderLogoLeft {...props} /> }}
      />
    </Stack>
  );
}
