import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { C, space } from "../theme";

/**
 * Content grouping that is NOT a card. Use inside a card when a subsection
 * needs separating — nesting a real card produces the stacked-panel look the
 * audit banned.
 *
 * The 0.06 white lift reads on every surface in this palette without adding a
 * second border weight next to the parent card's.
 */
export default function Group({
  children, bordered = false, style,
}: {
  children: React.ReactNode;
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.group, bordered && s.bordered, style]}>{children}</View>;
}

const s = StyleSheet.create({
  group: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: space.md,
    gap: space.sm,
  },
  bordered: { borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
});
