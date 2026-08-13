import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import PressableScale from "./PressableScale";
import { C, F, MIN_TOUCH, danger, dangerText, space } from "../theme";

/**
 * Themed confirmation dialog. Replaces the native AlertDialog, which rendered
 * in stock Material grey/teal Roboto and broke the design language at the one
 * irreversible action in the app (audit M1).
 *
 * Rendered in a Modal so it sits above the bottom tab bar — the same layering
 * bug M10 describes for the bottom sheets.
 */
export default function AppDialog({
  visible, title, message, confirmLabel, cancelLabel = "Cancel",
  destructive = false, onConfirm, onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onCancel}
    >
      {/* Entrance only. Android's Modal unmounts its subtree synchronously
          when `visible` flips false, so an `exiting` animation has no window
          left to run in — it would read as intent without doing anything. */}
      <Animated.View entering={FadeIn.duration(180)} style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Dismiss" />
        <Animated.View
          entering={ZoomIn.springify().damping(18).mass(0.7)}
          style={s.card}
          accessibilityViewIsModal
          accessibilityRole="alert"
          onStartShouldSetResponder={() => true}
        >
          <Text style={s.title}>{title}</Text>
          {message ? <Text style={s.message}>{message}</Text> : null}
          <View style={s.row}>
            <PressableScale
              style={[s.btn, s.cancel]}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <Text style={s.cancelText}>{cancelLabel}</Text>
            </PressableScale>
            <PressableScale
              style={[s.btn, destructive ? danger : s.primary]}
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
            >
              <Text style={[s.confirmText, destructive && dangerText]}>{confirmLabel}</Text>
            </PressableScale>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center", justifyContent: "center", padding: space.lg,
  },
  card: {
    width: "100%", maxWidth: 400,
    backgroundColor: C.card, borderRadius: 20,
    borderWidth: 1, borderColor: C.lineHi,
    padding: space.lg, gap: space.sm,
  },
  title: { color: C.text, fontFamily: F.display, fontSize: 20, letterSpacing: 0.3 },
  message: { color: C.text2, fontFamily: F.body, fontSize: 15, lineHeight: 21 },
  row: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  btn: {
    flex: 1, minHeight: MIN_TOUCH, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  // Cancel is the safe path, so it is the quiet one. Confirm carries the weight.
  cancel: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  cancelText: { color: C.text2, fontFamily: F.semibold, fontSize: 16 },
  primary: { backgroundColor: C.red },
  confirmText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
});
