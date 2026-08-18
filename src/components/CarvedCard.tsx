import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { carved, carvedFill, radius } from "../theme";

/**
 * A card lit from above — see `carved` in theme.ts for why translucent.
 *
 * Exists so the two-stop fill and the asymmetric border are declared once. Hand
 * -rolling them per call site is how a "carved" surface drifts into six
 * slightly different carved surfaces.
 *
 * Pass `pressed` from a Pressable's style callback rather than applying `press`
 * outside: scaling the frame and the gradient separately shears the top
 * highlight by a pixel on Android.
 */
export default function CarvedCard({
  children, style, pressed = false, r = radius.md,
}: {
  children?: React.ReactNode;
  style?: ViewStyle;
  pressed?: boolean;
  r?: number;
}) {
  return (
    <View
      style={[
        carved,
        { borderRadius: r },
        pressed && s.pressed,
        style,
      ]}
    >
      <LinearGradient
        colors={carvedFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        // Inset by the border so the fill cannot bleed over the top highlight,
        // which is the whole effect.
        style={[StyleSheet.absoluteFill, { borderRadius: r - 1 }]}
      />
      {children}
    </View>
  );
}

// Opacity only, no scale: `press` scales, and a scaled 1px hairline shimmers.
const s = StyleSheet.create({ pressed: { opacity: 0.92 } });
