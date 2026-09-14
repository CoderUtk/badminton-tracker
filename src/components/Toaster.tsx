import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dismissToast, useToasts, type ToastKind } from "../lib/toast";
import { C, F, glow } from "../theme";

const edgeColor = (k: ToastKind) => (k === "error" ? C.red : k === "success" ? C.green : C.accent);

/** Renders the toast stack pinned below the status bar. Mount once at the root. */
export default function Toaster() {
  const toasts = useToasts();
  const insets = useSafeAreaInsets();
  // Reanimated's entering layout animations do not run on web: the element is
  // mounted with `visibility: hidden` waiting for an animation that never
  // starts, so the toast is laid out at the right place, at opacity 1, and
  // stays invisible forever. Since this component is where "every failure in
  // the app surfaces, and nowhere else", that silently swallowed every error
  // message in the web build — a guest pasting a bad tournament link got a
  // dead button and no explanation.
  //
  // The reduced-motion path already renders the same toast without entering
  // and exiting animations, so web takes it too.
  const reduced = useReducedMotion() || Platform.OS === "web";
  if (toasts.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={[s.wrap, { top: insets.top + 8 }]}>
      {toasts.map((t) => (
        <Animated.View
          key={t.id}
          entering={reduced ? undefined : FadeInDown.springify().damping(18).stiffness(180)}
          exiting={reduced ? undefined : FadeOutUp.duration(180)}
          style={[s.toast, { borderLeftColor: edgeColor(t.kind) }]}
          // Every failure in the app surfaces here and nowhere else, and the
          // toast auto-dismisses — without a live region a screen-reader user
          // gets silence when a match fails to start. Errors interrupt;
          // anything else waits for a pause.
          accessibilityLiveRegion={t.kind === "error" ? "assertive" : "polite"}
        >
          <Pressable onPress={() => dismissToast(t.id)} style={s.press} accessibilityRole="button">
            <Text style={s.text} numberOfLines={3}>{t.message}</Text>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12, alignItems: "center", gap: 8, zIndex: 1000 },
  toast: {
    width: "100%", maxWidth: 480, backgroundColor: C.cardHi, borderRadius: 12,
    borderLeftWidth: 4, borderWidth: 1, borderColor: C.line, ...glow(C.bg, 10, 0.4),
  },
  press: { paddingVertical: 12, paddingHorizontal: 14 },
  text: { color: C.text, fontFamily: F.medium, fontSize: 14 },
});
