import React from "react";
import { ActivityIndicator, type StyleProp, type ViewStyle } from "react-native";
import PressableScale from "./PressableScale";
import { C } from "../theme";

/**
 * Wraps PressableScale so a button's own size/position never shifts while
 * busy — content swaps for a centered spinner and the button becomes inert,
 * instead of the screen giving no feedback while an async action is in
 * flight. Not a new visual style: callers keep their own `style` (background,
 * radius, etc.) exactly as before.
 */
export default function BusyButton({
  busy,
  disabled,
  onPress,
  style,
  indicatorColor = C.text,
  accessibilityHint,
  accessibilityLabel,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  indicatorColor?: string;
  /** Why the button is inert, for callers that disable it conditionally. */
  accessibilityHint?: string;
  accessibilityLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: busy || disabled, busy }}
      style={style}
      disabled={busy || disabled}
      onPress={onPress}
    >
      {busy ? <ActivityIndicator color={indicatorColor} /> : children}
    </PressableScale>
  );
}
