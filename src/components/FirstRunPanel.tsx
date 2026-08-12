import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon from "./Icon";
import { C, F, press } from "../theme";

const STEPS = [
  "Name the players and pick the format",
  "Tap the side that won each rally",
  "History and stats build up as you play",
];

/**
 * Everything below the START A MATCH button while the account has no matches
 * and no clubs. The caller decides when this replaces the dashboard blocks
 * (isFirstRun in src/home/dashboard.ts) and owns the club sheet itself — this
 * component only reports the tap.
 */
export default function FirstRunPanel({ onCreateClub }: { onCreateClub: () => void }) {
  return (
    <View style={s.wrap}>
      <Text style={s.subtitle}>Set the court, tap to score. No club needed.</Text>

      <View style={s.steps}>
        {STEPS.map((text, i) => (
          <View key={text} style={s.step}>
            <View style={s.badge}>
              <Text style={s.badgeText}>{i + 1}</Text>
            </View>
            <Text style={s.stepText}>{text}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [s.clubRow, pressed && press]}
        onPress={onCreateClub}
        accessibilityRole="button"
        accessibilityLabel="Create or join a club"
      >
        <Text style={s.clubText}>
          Play with a regular group?{" "}
          <Text style={s.clubLink}>Create or join a club</Text>
        </Text>
        <Icon name="chevron-forward" color={C.text2} size={18} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 16 },
  subtitle: {
    color: C.text2, fontSize: 13, fontFamily: F.body, lineHeight: 19,
    textAlign: "center", paddingHorizontal: 8, marginTop: -4,
  },
  steps: { gap: 12, paddingHorizontal: 4 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "rgba(255,59,48,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: C.red, fontSize: 13, fontFamily: F.bold },
  stepText: { color: C.text2, fontSize: 13, fontFamily: F.body, flex: 1, lineHeight: 18 },
  clubRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.card, borderRadius: 12, padding: 14,
  },
  clubText: { color: C.text2, fontSize: 14, fontFamily: F.body, flex: 1 },
  clubLink: { color: C.text, fontFamily: F.semibold },
});
