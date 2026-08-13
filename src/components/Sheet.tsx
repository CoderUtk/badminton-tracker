import React, { useEffect } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PressableScale from "./PressableScale";
import Icon from "./Icon";
import { C, F, MIN_TOUCH } from "../theme";

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
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* A Modal, not an absolute View: rendered in the screen tree the sheet
          drew UNDER the bottom tab bar, which stayed tappable mid-modal
          (audit M10). */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, backStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View style={[s.panel, { paddingBottom: insets.bottom + 16 }, panelStyle]}>
            <View style={s.grabber} />
            <PressableScale
              style={s.close}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="close" color={C.text2} size={20} />
            </PressableScale>
            {title ? <Text style={s.title}>{title}</Text> : null}
            {message ? <Text style={s.msg}>{message}</Text> : null}
            <ScrollView style={{ maxHeight: height * 0.5 }} contentContainerStyle={s.actions} showsVerticalScrollIndicator={false}>
              {actions.map((a, i) => (
                <PressableScale key={i} onPress={a.onPress} style={[s.btn, a.destructive ? s.btnDestructive : a.primary ? s.btnPrimary : s.btnSecondary]}>
                  <Text style={[s.btnText, !a.destructive && !a.primary && s.btnTextSecondary]}>{a.label}</Text>
                </PressableScale>
              ))}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
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
  // Drag-to-dismiss was the only way out. It is a fine gesture and a poor
  // affordance — nothing on screen said the sheet could be closed (audit M10).
  close: {
    position: "absolute", top: 10, right: 12,
    width: MIN_TOUCH, height: MIN_TOUCH,
    alignItems: "center", justifyContent: "center",
    zIndex: 2,
  },
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
