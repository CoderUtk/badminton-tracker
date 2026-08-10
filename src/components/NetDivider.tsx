import React, { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, Line, Pattern, Rect } from "react-native-svg";

const WIDTH = 8;

/**
 * Vertical badminton-net texture (white tape + diagonal mesh) used as the
 * court divider so opposing sides stay legible in both orientations.
 */
export default function NetDivider({ color = "rgba(255,255,255,0.5)" }: { color?: string }) {
  const [height, setHeight] = useState(0);

  return (
    <View
      style={{ width: WIDTH, flex: 1 }}
      onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}
    >
      {height > 0 && (
        <Svg width={WIDTH} height={height}>
          <Defs>
            <Pattern id="netMesh" patternUnits="userSpaceOnUse" width={6} height={6}>
              <Line x1="0" y1="6" x2="6" y2="0" stroke={color} strokeWidth={0.75} />
              <Line x1="-1.5" y1="1.5" x2="1.5" y2="-1.5" stroke={color} strokeWidth={0.75} />
              <Line x1="4.5" y1="7.5" x2="7.5" y2="4.5" stroke={color} strokeWidth={0.75} />
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width={WIDTH} height={height} fill="url(#netMesh)" />
          <Rect x={0} y={0} width={WIDTH} height={5} fill="rgba(255,255,255,0.85)" />
          <Rect x={0} y={Math.max(0, height - 5)} width={WIDTH} height={5} fill="rgba(255,255,255,0.85)" />
        </Svg>
      )}
    </View>
  );
}
