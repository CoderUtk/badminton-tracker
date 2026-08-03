import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { RussoOne_400Regular } from "@expo-google-fonts/russo-one";
import {
  ChakraPetch_400Regular, ChakraPetch_500Medium,
  ChakraPetch_600SemiBold, ChakraPetch_700Bold,
} from "@expo-google-fonts/chakra-petch";
import { SessionProvider, useSession } from "../src/stores/session";
import { getMyProfile, subscribeProfile } from "../src/repos/profileRepo";
import { startSyncListener } from "../src/sync/runner";
import AnimatedSplash from "../src/components/AnimatedSplash";
import Toaster from "../src/components/Toaster";
import { consumePendingLink, setPendingLink } from "../src/lib/pendingLink";
import { parseJoinTarget } from "../src/lib/joinLink";
import * as Sentry from "@sentry/react-native";
import { initObservability, sentryEnabled } from "../src/lib/observability";
import { C } from "../src/theme";

// Keep the native splash up until the JS animated splash takes over.
void SplashScreen.preventAutoHideAsync();
initObservability();

function Gate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  // undefined while the profile is in flight — never redirect on a guess.
  const [needsName, setNeedsName] = useState<boolean | undefined>(undefined);
  const [profileTick, setProfileTick] = useState(0);

  useEffect(() => subscribeProfile(() => setProfileTick((n) => n + 1)), []);

  useEffect(() => {
    if (!session) { setNeedsName(undefined); return; }
    let live = true;
    void getMyProfile().then((p) => {
      if (live) setNeedsName(p !== null && !p.displayNameSet);
    });
    return () => { live = false; };
  }, [session, profileTick]);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    const inWelcome = segments[0] === "welcome";
    if (!session) {
      if (!inAuth) {
        // Remember where they were headed; Gate replays it once signed in.
        if (segments[0] === "join") setPendingLink(pathname);
        router.replace("/sign-in");
      }
      return;
    }
    if (needsName === undefined) return; // profile still loading
    if (needsName) {
      if (!inWelcome) {
        // Park the join destination for welcome's onContinue to replay once a
        // display name is set.
        if (segments[0] === "join") setPendingLink(pathname);
        router.replace("/welcome");
      }
      return;
    }
    if (inAuth || inWelcome) {
      const path = consumePendingLink();
      const target = path ? parseJoinTarget(path) : null;
      router.replace(target ? `/join/club/${target.id}` : "/");
      return;
    }
  }, [session, loading, needsName, segments, router]);

  return <>{children}</>;
}

function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);
  const [fontsLoaded] = useFonts({
    RussoOne_400Regular,
    ChakraPetch_400Regular,
    ChakraPetch_500Medium,
    ChakraPetch_600SemiBold,
    ChakraPetch_700Bold,
  });
  useEffect(() => startSyncListener(), []);
  useEffect(() => {
    // Hand off from the native splash to the animated one only once the gaming
    // fonts are ready, so no text flashes in a fallback face.
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;
  const tree = (
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
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="join/club/[id]" options={{ headerShown: false }} />
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

  // Sentry.ErrorBoundary is the piece that actually catches render crashes
  // with component stacks — Sentry.wrap (not used here) only composes
  // TouchEventBoundary/Profiler/FeedbackWidgetProvider in the installed SDK
  // version, not an error boundary. Only wrap when Sentry is actually
  // enabled — when disabled, render the tree with no wrapper at all, exactly
  // as before this file used Sentry.
  return sentryEnabled() ? <Sentry.ErrorBoundary>{tree}</Sentry.ErrorBoundary> : tree;
}

export default RootLayout;
