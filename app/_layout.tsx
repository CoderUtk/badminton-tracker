import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { AppState, Platform, Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { useFonts } from "expo-font";
import { RussoOne_400Regular } from "@expo-google-fonts/russo-one";
import {
  ChakraPetch_400Regular, ChakraPetch_500Medium,
  ChakraPetch_600SemiBold, ChakraPetch_700Bold,
} from "@expo-google-fonts/chakra-petch";
import { SessionProvider, useSession } from "../src/stores/session";
import { supabase } from "../src/lib/supabase";
import { getMyProfile, subscribeProfile } from "../src/repos/profileRepo";
import { getDb } from "../src/db/db";
import { startSyncListener } from "../src/sync/runner";
import { sweepStaleLiveSessions } from "../src/repos/sessionRepo";
import { scheduleInactivityReminder } from "../src/lib/reminders";
import { configureNotificationHandling, syncPushRegistration } from "../src/lib/push";
import { notificationRoute } from "../src/lib/notificationRoute";
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
      if (Platform.OS === "web") {
        // Web build is guest-only: skip the sign-in screen entirely and go
        // straight to an anonymous session so it lands on /guest below.
        void supabase?.auth.signInAnonymously();
        return;
      }
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
  const router = useRouter();
  const [splashDone, setSplashDone] = useState(false);
  // A notification route resolved before the navigator was mounted.
  const [notificationRoutePath, setNotificationRoutePath] = useState<string | null>(null);
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
      // Persists auto-finish for sessions left live past the window. Runs here
      // rather than inside listSessions() so a cache read never fires network
      // calls on a render path.
      void sweepStaleLiveSessions();
    })();
  }, []);
  // Pushes the 7-day inactivity-reminder clock forward on every app open;
  // no-ops if the setting is off, permission isn't granted, or on web. A
  // warm resume (AppState -> "active") counts as an "open" too, not just
  // the cold-start mount above — otherwise a resident app never reschedules.
  // syncPushRegistration() rides along here for the same reason: it's the
  // upsert heartbeat push_to()'s 60-day staleness window depends on, so it
  // needs to fire on every open/resume, not just cold start, or a resident
  // app's token silently ages out. It also retries a delete that an offline
  // toggle-off or sign-out failed to complete. It self-guards on the toggle,
  // sign-in state, and permission, so calling it unconditionally here is safe.
  useEffect(() => {
    void configureNotificationHandling();
    void scheduleInactivityReminder();
    void syncPushRegistration();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void scheduleInactivityReminder();
        void syncPushRegistration();
      }
    });
    return () => sub.remove();
  }, []);
  // Resolves a tapped notification to a route and parks it. Both sources are
  // required: the listener covers a tap while the app is already running,
  // getLastNotificationResponse() covers a tap that cold-started it — neither
  // one covers the other case.
  //
  // Parking rather than navigating is what makes the cold-start path work at
  // all: this component returns null until the fonts load, so on first render
  // no navigator is mounted and a router.push() here throws "Attempted to
  // navigate before mounting the Root Layout component" straight into a
  // swallowed catch. The replay effect below waits for fontsLoaded.
  //
  // clearLastNotificationResponse() stops an in-process re-mount (a Sentry
  // ErrorBoundary reset, say) from re-reading and re-navigating to a tap that
  // has already been handled.
  useEffect(() => {
    let cancelled = false;

    const take = (response: Notifications.NotificationResponse | null) => {
      if (cancelled || !response) return;
      const path = notificationRoute(response.notification.request.content.data);
      try {
        Notifications.clearLastNotificationResponse();
      } catch {
        // Clearing is an optimisation, never a precondition for routing.
      }
      if (path) setNotificationRoutePath(path);
    };

    try {
      take(Notifications.getLastNotificationResponse());
    } catch {
      // No native module (web/dev client edge cases) — the listener still works.
    }
    const sub = Notifications.addNotificationResponseReceivedListener(take);

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  // Replays the parked route once the navigator exists.
  //
  // Signed-out taps are deliberately NOT preserved across sign-in: Gate
  // redirects to /sign-in and the destination is dropped. A push only reaches
  // this device while its token is bound to a signed-in profile, so being
  // signed out at tap time means the session is already gone, and landing on
  // home after re-authenticating is the honest result. src/lib/pendingLink.ts
  // is not reused here — Gate replays it only through parseJoinTarget(), which
  // understands join links and nothing else.
  useEffect(() => {
    if (!fontsLoaded || !notificationRoutePath) return;
    setNotificationRoutePath(null);
    router.push(notificationRoutePath as never);
  }, [fontsLoaded, notificationRoutePath, router]);
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
