import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { C, F } from "../theme";

/** One tile in the Recent Performance row. Value is pre-formatted by the caller. */
export default function StatTile({
  label, value, valueColor = C.text,
}: {
  label: string; value: string; valueColor?: string;
}) {
  return (
    <View style={s.tile}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, { color: valueColor }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tile: {
    flex: 1, backgroundColor: C.card, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 10, alignItems: "center", gap: 6,
  },
  // C.text2, never C.text3 — #5C6472 on C.bg is ~2.9:1, below WCAG AA.
  // minHeight reserves space for a 2-line label (e.g. "Longest Streak")
  // so every tile's value starts at the same y regardless of wrap (P1).
  label: { color: C.text2, fontSize: 12, fontFamily: F.medium, letterSpacing: 0.3, minHeight: 30, textAlign: "center" },
  value: { fontSize: 22, fontFamily: F.display },
});
