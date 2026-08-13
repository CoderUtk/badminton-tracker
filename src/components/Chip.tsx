import React from "react";
import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import PressableScale from "./PressableScale";
import { C, F, MIN_TOUCH, selected, selectedText, space, unselectedText } from "../theme";

/**
 * Selectable chip with a guaranteed 48dp touch box and a real selected state
 * in the accessibility tree.
 *
 * Both halves are audit findings: M4 (attendance chips were 43x32dp, so RSVPs
 * were being mis-tapped) and A4 (selection was colour-only, so a screen reader
 * announced selected and unselected identically).
 */
export default function Chip({
  label, isSelected, onPress, disabled = false, accessibilityLabel, style,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      // The box is already >= MIN_TOUCH; hitSlop absorbs the 8dp gutter between
      // adjacent chips so a near-miss still lands on the intended one.
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: isSelected, disabled }}
      style={[s.chip, isSelected ? selected : s.unselected, disabled && s.disabled, style]}
    >
      <Text style={[s.text, isSelected ? selectedText : unselectedText]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  chip: {
    minWidth: MIN_TOUCH, minHeight: MIN_TOUCH,
    paddingHorizontal: space.md,
    borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  unselected: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  disabled: { opacity: 0.4 },
  text: { fontFamily: F.semibold, fontSize: 14 },
});
