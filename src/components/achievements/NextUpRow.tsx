import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Icon, { type IconName } from "../Icon";
import type { EarnedBadge } from "../../achievements/types";
import { C, F, radius } from "../../theme";

/**
 * One in-progress badge, full width. Deliberately not pressable: there is
 * nothing to share until it is earned. The percentage is rendered as text as
 * well as a bar so the progress is not conveyed by the bar's length alone.
 */
export default function NextUpRow({ badge }: { badge: EarnedBadge }) {
  const pct = Math.round(badge.progress * 100);
  return (
    <View
      style={s.row}
      accessible
      accessibilityLabel={`${badge.title}, ${pct} percent complete. ${badge.description}.`}
    >
      <View style={s.iconWrap}>
        <Icon name={badge.icon as IconName} color={C.text} size={22} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={s.head}>
          <Text style={s.title} numberOfLines={1}>{badge.title}</Text>
          <Text style={s.pct}>{pct}%</Text>
        </View>
        <Text style={s.desc} numberOfLines={2}>{badge.description}</Text>
        <View style={s.track}>
          <View style={[s.fill, { width: `${pct}%` }]} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.bgElev,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: C.line,
    padding: 12,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: C.card, alignItems: "center", justifyContent: "center",
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { color: C.text, fontSize: 14, fontFamily: F.semibold, flexShrink: 1 },
  pct: { color: C.text2, fontSize: 12, fontFamily: F.medium },
  desc: { color: C.text3, fontSize: 12, fontFamily: F.body },
  track: { width: "100%", height: 6, borderRadius: 3, backgroundColor: C.line, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3, backgroundColor: C.accent },
});
