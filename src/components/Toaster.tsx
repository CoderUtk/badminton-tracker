import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dismissToast, useToasts, type ToastKind } from "../lib/toast";
import { C, F, glow } from "../theme";

const edgeColor = (k: ToastKind) => (k === "error" ? C.red : k === "success" ? C.green : C.accent);

/** Renders the toast stack pinned below the status bar. Mount once at the root. */
export default function Toaster() {
  const toasts = useToasts();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  if (toasts.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={[s.wrap, { top: insets.top + 8 }]}>
      {toasts.map((t) => (
        <Animated.View
          key={t.id}
          entering={reduced ? undefined : FadeInDown.springify().damping(18).stiffness(180)}
          exiting={reduced ? undefined : FadeOutUp.duration(180)}
          style={[s.toast, { borderLeftColor: edgeColor(t.kind) }]}
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
