import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, {
  Defs,
  Ellipse,
  Line,
  LinearGradient,
  Polygon,
  Stop,
} from "react-native-svg";
import { C, F } from "../theme";

const FEATHER = "#EEF2F8";
const FACET = "#AAB2C4";
const TIP_X = [18.5, 28.5, 38.5, 50, 61.5, 71.5, 81.5]; // scalloped feather tips

/** Vector shuttlecock mark — white feather cone + red cork. Resolution-independent. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="cork" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FF6B60" />
          <Stop offset="1" stopColor="#B31610" />
        </LinearGradient>
      </Defs>

      {/* feather cone */}
      <Polygon points="38.3,74.5 61.7,74.5 81.5,11.5 18.5,11.5" fill={FEATHER} />
      {/* scalloped tips */}
      {TIP_X.map((x) => (
        <Ellipse key={x} cx={x} cy={11.5} rx={5.6} ry={5.6} fill={FEATHER} />
      ))}
      {/* facet lines from cork neck to each tip */}
      {TIP_X.map((x) => (
        <Line key={`f${x}`} x1={50} y1={71.5} x2={x} y2={11.5} stroke={FACET} strokeWidth={0.8} />
      ))}
      {/* cross bands */}
      <Line x1={31} y1={38} x2={69} y2={38} stroke={FACET} strokeWidth={0.6} />
      <Line x1={26} y1={54} x2={74} y2={54} stroke={FACET} strokeWidth={0.6} />

      {/* cork */}
      <Ellipse cx={50} cy={77.5} rx={15} ry={14} fill="url(#cork)" />
      <Ellipse cx={50} cy={72.5} rx={9} ry={5} fill="#FF8A80" opacity={0.5} />
    </Svg>
  );
}

/** Logo + CourtSide wordmark, used in headers and hero areas. */
export default function Logo({
  size = 28,
  showWordmark = true,
  style,
}: {
  size?: number;
  showWordmark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.row, style]}>
      <LogoMark size={size} />
      {showWordmark && (
        <Text style={[s.word, { fontSize: size * 0.6 }]}>
          COURT<Text style={s.accent}>SIDE</Text>
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 9 },
  word: { color: C.text, fontFamily: F.display, letterSpacing: 1 },
  accent: { color: C.red },
});
