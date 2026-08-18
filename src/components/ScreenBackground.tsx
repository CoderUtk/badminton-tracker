import React from "react";
import { Image, Platform, StyleSheet, View, type ViewStyle } from "react-native";
import Svg, {
  Defs, LinearGradient as SvgLinearGradient, RadialGradient, Rect, Stop,
} from "react-native-svg";
import { BLOOM, C, GRAD, GRAIN_OPACITY } from "../theme";

const GRAIN = require("../../assets/grain.png");

/**
 * The screen ground. Replaces `backgroundColor: C.bg` on a screen's root view.
 *
 * Three layers, bottom to top: an eased vertical ramp (GRAD.screen), the
 * ambient blooms from BLOOM, and a tiling grain plate. The gradient and blooms
 * live in one Svg rather than stacked expo-linear-gradient views because
 * expo-linear-gradient has no radial mode, and because one flattened Svg is one
 * draw pass instead of three overlapping ones.
 *
 * The grain is what makes the blooms safe to ship: a smooth 20-unit ramp across
 * 800dp banks visibly on 6-bit panels, and per-pixel noise is the standard fix.
 */
export default function ScreenBackground({
  children, style,
}: {
  children?: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[s.root, style]}>
      {/* aria-hidden equivalent: decorative, and must never take a touch. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <SvgLinearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={GRAD.screen[0]} />
              <Stop offset="0.55" stopColor={GRAD.screen[1]} />
              <Stop offset="1" stopColor={GRAD.screen[2]} />
            </SvgLinearGradient>
            {BLOOM.map((b, i) => (
              <RadialGradient
                key={i} id={`bloom${i}`} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry}
                gradientUnits="objectBoundingBox"
              >
                <Stop offset="0" stopColor={b.color} stopOpacity={b.opacity} />
                <Stop offset="1" stopColor={b.color} stopOpacity={0} />
              </RadialGradient>
            ))}
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#ground)" />
          {BLOOM.map((_, i) => (
            <Rect key={i} x="0" y="0" width="100%" height="100%" fill={`url(#bloom${i})`} />
          ))}
        </Svg>
        {/* Native only. react-native-web ignores resizeMode="repeat" and
            stretches the 96px plate across the whole viewport, which reads as a
            grey haze rather than grain. Banding is a 6-bit-mobile-panel problem
            anyway — desktop browsers dither the ramp themselves. */}
        {Platform.OS !== "web" && (
          <Image
            source={GRAIN}
            resizeMode="repeat"
            style={[StyleSheet.absoluteFill, { opacity: GRAIN_OPACITY }]}
          />
        )}
      </View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  // C.bg still paints first: the Svg mounts a frame late on a cold start, and
  // without a base colour that frame is a white flash on Android.
  root: { flex: 1, backgroundColor: C.bg },
});
