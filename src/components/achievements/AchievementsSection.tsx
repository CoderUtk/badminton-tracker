import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon from "../Icon";
import BadgeChip from "./BadgeChip";
import NextUpRow from "./NextUpRow";
import { groupBadges } from "../../achievements/grouping";
import type { EarnedBadge } from "../../achievements/types";
import { C, F, press, radius } from "../../theme";

/**
 * The profile screen's achievements card. Earned badges come first so they are
 * not buried in definition order, Next up shows what is actually reachable, and
 * the untouched badges collapse behind a disclosure — 14 locked chips should not
 * be the first thing a new player scrolls past.
 */
export default function AchievementsSection({
  badges, onPressBadge,
}: {
  badges: EarnedBadge[];
  onPressBadge?: (badge: EarnedBadge) => void;
}) {
  const [showLocked, setShowLocked] = useState(false);
  const g = useMemo(() => groupBadges(badges), [badges]);
  const total = badges.length;
  const done = g.earned.length;
  const ratio = total > 0 ? done / total : 0;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.cardTitle}>Achievements</Text>
        <Text style={s.count}>{done} of {total}</Text>
      </View>
      <View
        style={s.summaryTrack}
        accessible
        accessibilityLabel={`${done} of ${total} achievements earned`}
      >
        <View style={[s.summaryFill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>

      {g.earned.length > 0 ? (
        <>
          <Text style={s.groupLabel}>Earned</Text>
          <View style={s.grid}>
            {g.earned.map((b) => (
              <BadgeChip key={b.id} badge={b} onPress={onPressBadge} />
            ))}
          </View>
        </>
      ) : (
        <Text style={s.empty}>No badges yet — play a match and your first one is close.</Text>
      )}

      {g.nextUp.length > 0 && (
        <>
          <Text style={s.groupLabel}>Next up</Text>
          <View style={{ gap: 8 }}>
            {g.nextUp.map((b) => (
              <NextUpRow key={b.id} badge={b} />
            ))}
          </View>
        </>
      )}

      {g.locked.length > 0 && (
        <>
          <Pressable
            style={({ pressed }) => [s.disclosure, pressed && press]}
            onPress={() => setShowLocked((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showLocked }}
            accessibilityLabel={`Locked, ${g.locked.length} achievements. ${showLocked ? "Tap to collapse." : "Tap to expand."}`}
          >
            <Text style={s.disclosureText}>Locked ({g.locked.length})</Text>
            <Icon name={showLocked ? "chevron-down" : "chevron-forward"} color={C.text2} size={18} />
          </Pressable>
          {showLocked && (
            <View style={s.grid}>
              {g.locked.map((b) => (
                <BadgeChip key={b.id} badge={b} dimmed />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: C.line, gap: 10,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: C.text, fontSize: 15, fontFamily: F.bold },
  count: { color: C.text2, fontSize: 13, fontFamily: F.medium },
  summaryTrack: { width: "100%", height: 6, borderRadius: radius.pill, backgroundColor: C.line, overflow: "hidden" },
  summaryFill: { height: "100%", borderRadius: radius.pill, backgroundColor: C.accent },
  groupLabel: { color: C.text2, fontSize: 12, fontFamily: F.semibold, textTransform: "uppercase", letterSpacing: 0.6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  empty: { color: C.text3, fontSize: 13, fontFamily: F.body },
  disclosure: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: C.bgElev, borderRadius: radius.md,
    borderWidth: 1, borderColor: C.line,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  disclosureText: { color: C.text2, fontSize: 13, fontFamily: F.semibold },
});
