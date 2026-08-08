import React from "react";
import Svg, { G, Path, Ellipse, LinearGradient, RadialGradient, Stop, Defs } from "react-native-svg";

/** Vector shuttlecock used in the boot splash. */
export default function ShuttlecockSvg({ size = 120 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <Defs>
        <LinearGradient id="featherGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="65%" stopColor="#F1F5F9" />
          <Stop offset="100%" stopColor="#CBD5E1" />
        </LinearGradient>
        <RadialGradient id="corkGrad" cx="35%" cy="35%" r="65%">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="25%" stopColor="#FEF08A" />
          <Stop offset="70%" stopColor="#EAB308" />
          <Stop offset="100%" stopColor="#CA8A04" />
        </RadialGradient>
        <LinearGradient id="redRingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#FF6B61" />
          <Stop offset="100%" stopColor="#B3261E" />
        </LinearGradient>
      </Defs>

      <G transform="rotate(20 100 100)">
        <G stroke="#94A3B8" strokeWidth="1.2" opacity={0.6}>
          <Path d="M 68 85 L 100 135" />
          <Path d="M 78 78 L 100 135" />
          <Path d="M 88 74 L 100 135" />
          <Path d="M 100 72 L 100 135" />
          <Path d="M 112 74 L 100 135" />
          <Path d="M 122 78 L 100 135" />
          <Path d="M 132 85 L 100 135" />
        </G>

        <Path
          d="M 62 88 C 65 72, 135 72, 138 88 L 118 138 C 112 144, 88 144, 82 138 Z"
          fill="url(#featherGrad)"
          stroke="#E2E8F0"
          strokeWidth="1.5"
        />

        <G fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1">
          <Path d="M 62 88 Q 70 80 78 88 L 86 138 L 74 135 Z" />
          <Path d="M 76 86 Q 84 76 92 86 L 94 139 L 84 138 Z" />
          <Path d="M 88 84 Q 100 74 112 84 L 106 140 L 92 139 Z" />
          <Path d="M 108 86 Q 116 76 124 86 L 116 138 L 104 139 Z" />
          <Path d="M 122 88 Q 130 80 138 88 L 126 135 L 114 138 Z" />
        </G>

        <Path d="M 68 95 Q 100 102 132 95" stroke="#22D3EE" strokeWidth="2" fill="none" opacity={0.9} />
        <Path d="M 74 112 Q 100 118 126 112" stroke="#22D3EE" strokeWidth="2" fill="none" opacity={0.9} />

        <Path d="M 80 134 Q 100 140 120 134 L 118 141 Q 100 147 82 141 Z" fill="url(#redRingGrad)" />

        <Path
          d="M 82 140 Q 100 146 118 140 C 122 152, 118 168, 100 172 C 82 168, 78 152, 82 140 Z"
          fill="url(#corkGrad)"
          stroke="#D97706"
          strokeWidth="1"
        />

        <Ellipse cx="94" cy="152" rx="6" ry="10" fill="#FFFFFF" opacity={0.45} transform="rotate(-15 94 152)" />
      </G>
    </Svg>
  );
}
