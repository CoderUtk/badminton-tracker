import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PressableScale from "./PressableScale";
import { C, F } from "../theme";

export type SheetAction = { label: string; onPress: () => void; destructive?: boolean; primary?: boolean };

/** Spring-up bottom sheet with drag-to-dismiss. Mount conditionally on `visible`. */
export default function Sheet({
  visible, title, message, actions, onClose,
}: {
  visible: boolean; title?: string; message?: string; actions: SheetAction[]; onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const ty = useSharedValue(height);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    ty.value = reduced ? 0 : withSpring(0, { dampingRatio: 0.9, duration: 420 });
    backdrop.value = withTiming(1, { duration: 200 });
  }, [reduced]);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  const backStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const pan = Gesture.Pan()
    .onUpdate((e) => { ty.value = Math.max(0, e.translationY); })
    .onEnd((e) => {
      if (e.translationY > 110 || e.velocityY > 800) {
        backdrop.value = withTiming(0, { duration: 160 });
        ty.value = withTiming(height, { duration: 200 }, () => runOnJS(onClose)());
      } else {
        ty.value = withSpring(0, { dampingRatio: 0.9, duration: 420 });
      }
    });

  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, backStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[s.panel, { paddingBottom: insets.bottom + 16 }, panelStyle]}>
          <View style={s.grabber} />
          {title ? <Text style={s.title}>{title}</Text> : null}
          {message ? <Text style={s.msg}>{message}</Text> : null}
          <View style={s.actions}>
            {actions.map((a, i) => (
              <PressableScale key={i} onPress={a.onPress} style={[s.btn, a.destructive ? s.btnDestructive : a.primary ? s.btnPrimary : s.btnSecondary]}>
                <Text style={[s.btnText, !a.destructive && !a.primary && s.btnTextSecondary]}>{a.label}</Text>
              </PressableScale>
            ))}
          </View>
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
    borderTopWidth: 1, borderColor: C.lineHi, gap: 12,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, marginBottom: 6 },
  title: { color: C.text, fontFamily: F.display, fontSize: 20, letterSpacing: 0.3 },
  msg: { color: C.text2, fontFamily: F.body, fontSize: 15, lineHeight: 21 },
  actions: { gap: 8, marginTop: 4 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnPrimary: { backgroundColor: C.red },
  btnDestructive: { backgroundColor: C.redDeep },
  btnSecondary: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  btnText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
  btnTextSecondary: { color: C.text2 },
});
