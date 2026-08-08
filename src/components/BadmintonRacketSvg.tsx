import React from "react";
import Svg, { G, Path, Rect, Ellipse, Line, Circle, LinearGradient, Stop, Defs } from "react-native-svg";

/** Vector racket used in the boot splash's opening swing. */
export default function BadmintonRacketSvg({ size = 210 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.2} viewBox="0 0 200 240" fill="none">
      <Defs>
        <LinearGradient id="racketFrameGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#FF6B61" />
          <Stop offset="40%" stopColor="#FF3B30" />
          <Stop offset="80%" stopColor="#DC2626" />
          <Stop offset="100%" stopColor="#B3261E" />
        </LinearGradient>
        <LinearGradient id="shaftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#64748B" />
          <Stop offset="50%" stopColor="#334155" />
          <Stop offset="100%" stopColor="#0F172A" />
        </LinearGradient>
        <LinearGradient id="handleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#1E293B" />
          <Stop offset="100%" stopColor="#020617" />
        </LinearGradient>
      </Defs>

      <G transform="rotate(-25 100 120)">
        <Path d="M 92 215 L 108 215 L 106 222 L 94 222 Z" fill="#DC2626" />
        <Path d="M 91 165 L 109 165 L 107 215 L 93 215 Z" fill="url(#handleGrad)" stroke="#475569" strokeWidth="1" />
        <Line x1="91" y1="173" x2="108" y2="175" stroke="#334155" strokeWidth="1.5" />
        <Line x1="92" y1="183" x2="108" y2="185" stroke="#334155" strokeWidth="1.5" />
        <Line x1="92" y1="193" x2="107" y2="195" stroke="#334155" strokeWidth="1.5" />
        <Line x1="93" y1="203" x2="107" y2="205" stroke="#334155" strokeWidth="1.5" />

        <Path d="M 93 150 L 107 150 L 109 165 L 91 165 Z" fill="#FF3B30" />

        <Rect x="98" y="85" width="4" height="65" rx="2" fill="url(#shaftGrad)" />
        <Rect x="98" y="115" width="4" height="12" fill="#FF3B30" />

        <Path d="M 94 85 Q 100 80 106 85 L 102 90 L 98 90 Z" fill="#DC2626" />

        <Ellipse cx="100" cy="48" rx="34" ry="44" fill="none" stroke="url(#racketFrameGrad)" strokeWidth="4.5" />

        <G stroke="#22D3EE" strokeWidth="0.8" opacity={0.65}>
          <Line x1="82" y1="20" x2="82" y2="76" />
          <Line x1="88" y1="12" x2="88" y2="84" />
          <Line x1="94" y1="8" x2="94" y2="88" />
          <Line x1="100" y1="6" x2="100" y2="90" />
          <Line x1="106" y1="8" x2="106" y2="88" />
          <Line x1="112" y1="12" x2="112" y2="84" />
          <Line x1="118" y1="20" x2="118" y2="76" />

          <Line x1="72" y1="24" x2="128" y2="24" />
          <Line x1="68" y1="32" x2="132" y2="32" />
          <Line x1="67" y1="40" x2="133" y2="40" />
          <Line x1="66" y1="48" x2="134" y2="48" />
          <Line x1="67" y1="56" x2="133" y2="56" />
          <Line x1="68" y1="64" x2="132" y2="64" />
          <Line x1="72" y1="72" x2="128" y2="72" />
        </G>

        <Circle cx="100" cy="48" r="14" fill="none" stroke="#FF3B30" strokeWidth="1.8" opacity={0.8} />
      </G>
    </Svg>
  );
}
