import React from "react";
import { PixelRatio, StyleSheet, Text } from "react-native";
import CarvedCard from "./CarvedCard";
import { C, F } from "../theme";

/** One tile in the Recent Performance row. Value is pre-formatted by the caller. */
export default function StatTile({
  label, value, valueColor = C.text,
}: {
  label: string; value: string; valueColor?: string;
}) {
  return (
    <CarvedCard style={s.tile}>
      <Text style={s.label} numberOfLines={2}>{label}</Text>
      <Text style={[s.value, { color: valueColor }]} numberOfLines={1}>{value}</Text>
    </CarvedCard>
  );
}

const s = StyleSheet.create({
  // No backgroundColor or borderRadius: CarvedCard owns the surface now.
  tile: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, alignItems: "center", gap: 6 },
  // C.text2, never C.text3 — #5C6472 on C.bg is ~2.9:1, below WCAG AA.
  // minHeight reserves space for a 2-line label (e.g. "Longest Streak")
  // so every tile's value starts at the same y regardless of wrap (P1).
  // 30 undershot the actual 2-line height at this font/letterSpacing by
  // ~7.5dp, confirmed on-device via the accessibility tree (Longest
  // Streak's value sat 15px/2x lower than Matches/Win Rate's) — 38
  // covers the measured 2-line content height with a small margin.
  // Scaled by the OS font scale: minHeight is in dp but the two lines it
  // reserves space for are not, so at "Largest" text size a fixed 38 clipped
  // the second line of "Longest Streak". Android relaunches the activity when
  // the font scale changes, so reading it once at module load is enough.
  label: { color: C.text2, fontSize: 12, fontFamily: F.medium, letterSpacing: 0.3, minHeight: 38 * PixelRatio.getFontScale(), textAlign: "center" },
  value: { fontSize: 22, fontFamily: F.display },
});
