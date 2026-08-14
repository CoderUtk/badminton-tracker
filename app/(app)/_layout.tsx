import React from "react";
import { Tabs } from "expo-router";
import { CommonActions, type NavigationState, type PartialState } from "@react-navigation/native";
import Icon, { type IconName } from "../../src/components/Icon";
import Logo from "../../src/components/Logo";
import { C } from "../../src/theme";
import { shouldResetTabStack } from "../../src/lib/tabReset";

const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: string; size: number }) {
    return <Icon name={name} color={color} size={size} />;
  };

export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        animation: "shift",
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.line },
        tabBarActiveTintColor: C.red,
        tabBarInactiveTintColor: C.text2,
        sceneStyle: { backgroundColor: C.bg },
        headerTitle: () => <Logo size={24} />,
        headerTitleAlign: "center",
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home") }} />
      <Tabs.Screen name="sessions" options={{ title: "Sessions", tabBarIcon: icon("calendar"), headerShown: false }} />
      <Tabs.Screen name="matches" options={{ title: "Matches", tabBarIcon: icon("badminton"), headerShown: false }} />
      <Tabs.Screen
        name="tournaments"
        options={{ title: "Tournaments", tabBarIcon: icon("trophy"), headerShown: false }}
        listeners={({ navigation, route }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            const routeIndex = state.routes.findIndex((r: { name: string }) => r.name === route.name);
            const isFocused = routeIndex !== -1 && state.index === routeIndex;
            const nested = state.routes[routeIndex]?.state as
              | NavigationState
              | PartialState<NavigationState>
              | undefined;
            if (isFocused && shouldResetTabStack(nested?.index)) {
              const firstRouteName = nested?.routes?.[0]?.name;
              if (!firstRouteName || !nested) return;
              e.preventDefault();
              navigation.dispatch({
                ...CommonActions.reset({ index: 0, routes: [{ name: firstRouteName }] }),
                target: nested.key,
              });
            }
          },
        })}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person"), headerShown: false }} />
      <Tabs.Screen name="clubs" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="watch" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
