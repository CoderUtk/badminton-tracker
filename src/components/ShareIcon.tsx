import React from "react";
import Svg, { Circle, Line } from "react-native-svg";

/** Node-and-line share glyph (iOS-style), not the OS "box with arrow" icon. */
export default function ShareIcon({ size = 18, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="7" y1="12" x2="17" y2="6" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1="7" y1="12" x2="17" y2="18" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx="5" cy="12" r="3" fill={color} />
      <Circle cx="19" cy="6" r="3" fill={color} />
      <Circle cx="19" cy="18" r="3" fill={color} />
    </Svg>
  );
}
