import React, { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SessionProvider, useSession } from "../src/stores/session";
import { startSyncListener } from "../src/sync/runner";
import { seedDemoData } from "../src/db/seed";
import { supabase } from "../src/lib/supabase";
import AnimatedSplash from "../src/components/AnimatedSplash";
import { C } from "../src/theme";

// Keep the native splash up until the JS animated splash takes over.
void SplashScreen.preventAutoHideAsync();

function Gate({ children }: { children: React.ReactNode }) {
  const { session, loading, offlineOnly } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    const signedIn = offlineOnly || !!session;
    if (!signedIn && !inAuth) router.replace("/sign-in");
    else if (signedIn && inAuth) router.replace("/");
  }, [session, loading, offlineOnly, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);
  useEffect(() => {
    if (!supabase) void seedDemoData();
    // Hand the native splash off to the animated one on the next frame.
    void SplashScreen.hideAsync();
    return startSyncListener();
  }, []);
  return (
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
          <Stack.Screen
            name="score/[matchId]"
            options={{ headerShown: false, presentation: "fullScreenModal", orientation: "landscape" }}
          />
          <Stack.Screen name="new-match" options={{ title: "New match", presentation: "modal" }} />
          <Stack.Screen name="new-session" options={{ title: "Plan session", presentation: "modal" }} />
        </Stack>
      </Gate>
    </SessionProvider>
  );
}
