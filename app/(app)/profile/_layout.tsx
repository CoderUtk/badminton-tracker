import { Stack } from "expo-router";
import HeaderLogoLeft from "../../../src/components/HeaderLogoLeft";
import Logo from "../../../src/components/Logo";
import { C } from "../../../src/theme";

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        contentStyle: { backgroundColor: C.bg },
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
