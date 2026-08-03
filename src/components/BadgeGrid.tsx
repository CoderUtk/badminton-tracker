import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Icon, { type IconName } from "./Icon";
import type { EarnedBadge } from "../achievements/types";
import { C, F } from "../theme";

/**
 * Wrap grid of badge chips. Earned badges read as accented (icon + title in
 * C.red, matching the "earned/active" language used elsewhere on Profile —
 * see the Stat accent boxes); locked badges are dim (C.text2/C.text3) with a
 * thin progress bar showing how close the player is. Purely presentational —
 * no data fetching, no tap action, so plain Views rather than PressableScale.
 */
export default function BadgeGrid({ badges }: { badges: EarnedBadge[] }) {
  return (
    <View style={s.grid}>
      {badges.map((b) => (
        <View key={b.id} style={s.chip}>
          <Icon name={b.icon as IconName} color={b.earned ? C.red : C.text3} size={24} />
          <Text style={[s.title, b.earned ? s.titleEarned : s.titleLocked]} numberOfLines={1}>
            {b.title}
          </Text>
          <Text style={s.desc} numberOfLines={2}>{b.description}</Text>
          {!b.earned && (
            <View style={s.track}>
              <View style={[s.fill, { width: `${Math.round(b.progress * 100)}%` }]} />
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    width: "31%",
    backgroundColor: C.bgElev,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    padding: 10,
    alignItems: "center",
    gap: 4,
  },
  title: { fontSize: 12, fontFamily: F.semibold, textAlign: "center" },
  titleEarned: { color: C.red },
  titleLocked: { color: C.text2 },
  desc: { color: C.text3, fontSize: 10, fontFamily: F.body, textAlign: "center" },
  track: { width: "100%", height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 2, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2, backgroundColor: C.text3 },
});
