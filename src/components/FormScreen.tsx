import React from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  type StyleProp, type ViewStyle,
} from "react-native";
import { C } from "../theme";

/** Screen container that keeps focused inputs visible above the keyboard. */
export default function FormScreen({
  children, contentContainerStyle, style,
}: {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAvoidingView
      style={[s.root, style]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: C.bg } });
