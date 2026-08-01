import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { RussoOne_400Regular } from "@expo-google-fonts/russo-one";
import {
  ChakraPetch_400Regular, ChakraPetch_500Medium,
  ChakraPetch_600SemiBold, ChakraPetch_700Bold,
} from "@expo-google-fonts/chakra-petch";
import { SessionProvider, useSession } from "../src/stores/session";
import { startSyncListener } from "../src/sync/runner";
import { seedDemoData } from "../src/db/seed";
import { supabase } from "../src/lib/supabase";
import AnimatedSplash from "../src/components/AnimatedSplash";
import Toaster from "../src/components/Toaster";
import { ONBOARDING_SEEN_KEY, getSetting } from "../src/repos/settingsRepo";
import { C } from "../src/theme";

// Keep the native splash up until the JS animated splash takes over.
void SplashScreen.preventAutoHideAsync();

function Gate({ children }: { children: React.ReactNode }) {
  const { session, loading, offlineOnly } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => { void getSetting(ONBOARDING_SEEN_KEY).then((v) => setOnboarded(v === "1")); }, []);

  useEffect(() => {
    if (loading || onboarded === null) return;
    const inAuth = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "onboarding";
    const signedIn = offlineOnly || !!session;
    if (!signedIn && !inAuth) router.replace("/sign-in");
    else if (signedIn && inAuth) router.replace("/");
    else if (signedIn && !onboarded && !inOnboarding) router.replace("/onboarding");
  }, [session, loading, offlineOnly, onboarded, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);
  const [fontsLoaded] = useFonts({
    RussoOne_400Regular,
    ChakraPetch_400Regular,
    ChakraPetch_500Medium,
    ChakraPetch_600SemiBold,
    ChakraPetch_700Bold,
  });
  useEffect(() => {
    if (!supabase) void seedDemoData();
    return startSyncListener();
  }, []);
  useEffect(() => {
    // Hand off from the native splash to the animated one only once the gaming
    // fonts are ready, so no text flashes in a fallback face.
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SessionProvider>
      <StatusBar style="light" />
      {!splashDone && <AnimatedSplash onFinish={() => setSplashDone(true)} />}
      <Gate>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.bg },
            headerTintColor: C.text,
            contentStyle: { backgroundColor: C.bg },
          }}
        >
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen
            name="score/[matchId]"
            options={{ headerShown: false, presentation: "fullScreenModal", orientation: "all" }}
          />
          <Stack.Screen name="new-match" options={{ title: "New match", presentation: "modal" }} />
          <Stack.Screen name="new-session" options={{ title: "Plan session", presentation: "modal" }} />
        </Stack>
      </Gate>
    </SessionProvider>
    <Toaster />
    </GestureHandlerRootView>
  );
}
