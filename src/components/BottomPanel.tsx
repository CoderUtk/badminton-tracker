import React, { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, F } from "../theme";

/**
 * Spring-up bottom panel with drag-to-dismiss, sharing Sheet's animation and
 * chrome but taking arbitrary content instead of a fixed action list — for
 * full forms/lists (the tournament tab panels) rather than a confirm menu.
 * Mount conditionally on `visible`.
 */
export default function BottomPanel({
  visible, title, onClose, children,
}: {
  visible: boolean; title: string; onClose: () => void; children: React.ReactNode;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const ty = useSharedValue(height);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    // Apple fluid entrance: ease-out curve with slight bounce (dampingRatio 0.86)
    ty.value = reduced ? 0 : withSpring(0, { dampingRatio: 0.86, duration: 450, overshootClamping: false });
    backdrop.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) });
  }, [reduced]);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  const backStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const pan = Gesture.Pan()
    .onUpdate((e) => { 
      // Rubber-band resistance when dragging upward (negative translation)
      if (e.translationY < 0) {
        ty.value = e.translationY * 0.4; // 40% resistance for overscroll
      } else {
        ty.value = e.translationY;
      }
    })
    .onEnd((e) => {
      // Velocity-driven dismissal: flick down > 900px/s or drag > 120px
      const shouldDismiss = e.translationY > 120 || e.velocityY > 900;
      
      if (shouldDismiss) {
        backdrop.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) });
        ty.value = withTiming(height, { duration: 250, easing: Easing.in(Easing.cubic) }, () => runOnJS(onClose)());
      } else {
        // Spring back with velocity handoff (Reanimated automatically preserves gesture velocity)
        ty.value = withSpring(0, { dampingRatio: 0.86, duration: 450, velocity: e.velocityY });
      }
    });

  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, backStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[s.panel, { maxHeight: height * 0.82, paddingBottom: insets.bottom + 16 }, panelStyle]}>
          <View style={s.grabber} />
          <Text style={s.title}>{title}</Text>
          <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.55)" },
  panel: {
    position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: C.card,
    borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 10,
    borderTopWidth: 1, borderColor: C.lineHi,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, marginBottom: 6 },
  title: { color: C.text, fontFamily: F.display, fontSize: 20, letterSpacing: 0.3, marginBottom: 4 },
  content: { paddingBottom: 4 },
});
