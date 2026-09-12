import React from "react";
import { Pressable, Text } from "react-native";
import { C, F } from "../theme";

/**
 * Header "⋮" trigger. Deliberately renders ONLY the button: the menu itself
 * must be mounted in the screen body, never here.
 *
 * A Sheet rendered inside headerRight positions against the header, not the
 * screen — its absolutely-positioned panel lands inside a ~56px box and is
 * clipped away, so the menu appears to do nothing when tapped.
 */
export default function MenuButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button"
      onPress={onPress}
      accessibilityLabel="More actions"
      hitSlop={12}
      style={{ paddingHorizontal: 12, paddingVertical: 4 }}
    >
      <Text style={{ color: C.text, fontFamily: F.bold, fontSize: 22 }}>⋮</Text>
    </Pressable>
  );
}
