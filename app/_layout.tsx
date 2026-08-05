import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
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
import { getDb } from "../src/db/db";
import { startSyncListener } from "../src/sync/runner";
import { scheduleInactivityReminder } from "../src/lib/reminders";
import AnimatedSplash from "../src/components/AnimatedSplash";
import Toaster from "../src/components/Toaster";
import { consumePendingLink, setPendingLink } from "../src/lib/pendingLink";
import { joinRouteFor, parseJoinTarget } from "../src/lib/joinLink";
import { isGuestAllowedSegments } from "../src/lib/gateRedirect";
import * as Sentry from "@sentry/react-native";
import { initObservability, sentryEnabled } from "../src/lib/observability";
import { C, F } from "../src/theme";

// Keep the native splash up until the JS animated splash takes over.
void SplashScreen.preventAutoHideAsync();
initObservability();

function CrashFallback({ resetError }: { resetError: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
      <Text style={{ color: C.text, fontFamily: F.display, fontSize: 20 }}>Something went wrong</Text>
      <Text style={{ color: C.text2, fontFamily: F.body, fontSize: 14, textAlign: "center" }}>
        The app hit an unexpected error. Tap below to try again.
      </Text>
      <Pressable
        onPress={resetError}
        style={{ backgroundColor: C.red, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 }}
      >
        <Text style={{ color: C.text, fontFamily: F.semibold, fontSize: 15 }}>Try again</Text>
      </Pressable>
    </View>
  );
}

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
    if (!session || session.user.is_anonymous) { setNeedsName(undefined); return; }
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
    if (session.user.is_anonymous) {
      // Guests skip the display-name step entirely and are confined to a
      // small allowlist of routes — everything else bounces to the guest home.
      if (inAuth || inWelcome || !isGuestAllowedSegments(segments)) {
        router.replace("/guest");
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
      router.replace(target ? joinRouteFor(target) : "/");
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
  useEffect(() => {
    // Wait for db to be ready before starting sync to avoid nested transactions
    void (async () => {
      await getDb(); // Ensure migrations complete first
      startSyncListener();
    })();
  }, []);
  // Pushes the 7-day inactivity-reminder clock forward on every app open;
  // no-ops if the setting is off, permission isn't granted, or on web. A
  // warm resume (AppState -> "active") counts as an "open" too, not just
  // the cold-start mount above — otherwise a resident app never reschedules.
  useEffect(() => {
    void scheduleInactivityReminder();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void scheduleInactivityReminder();
    });
    return () => sub.remove();
  }, []);
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
          <Stack.Screen name="guest" options={{ headerShown: false }} />
          <Stack.Screen name="join/club/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="join/tournament/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="join/tournament/[id]/scorer" options={{ headerShown: false }} />
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
  return sentryEnabled() ? (
    <Sentry.ErrorBoundary fallback={({ resetError }) => <CrashFallback resetError={resetError} />}>
      {tree}
    </Sentry.ErrorBoundary>
  ) : (
    tree
  );
}

export default RootLayout;
