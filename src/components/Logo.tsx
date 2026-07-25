import React from "react";
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { C, F } from "../theme";

const SOURCE = require("../../assets/splash.png");

/** The shuttlecock mark on its own. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return <Image source={SOURCE} style={{ width: size, height: size }} resizeMode="contain" />;
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
