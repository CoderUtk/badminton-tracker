import React from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

/**
 * Screen container that keeps focused inputs visible above the keyboard.
 *
 * Uses react-native-keyboard-controller rather than KeyboardAvoidingView: the
 * old implementation leaned on Android's adjustResize, which app/_layout.tsx
 * documents as ignored under Android 15 edge-to-edge — the reason new-match.tsx
 * already drives its own KeyboardProvider-based shift. That left the shared
 * container (sign-in, welcome, the profile modals) on the weaker of the two
 * strategies, so the password field could still sit behind the IME. The
 * provider is mounted at the root, so this needs no extra setup.
 */
export default function FormScreen({
  children, contentContainerStyle, style,
}: {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAwareScrollView
      style={[s.root, style]}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      // Clears the focused field of the keyboard's top edge rather than
      // aligning flush against it.
      bottomOffset={24}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

const s = StyleSheet.create({ root: { flex: 1 } });
