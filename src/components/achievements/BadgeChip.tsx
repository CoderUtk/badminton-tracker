import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon, { type IconName } from "../Icon";
import type { EarnedBadge } from "../../achievements/types";
import { C, F, glow, press, radius } from "../../theme";

/**
 * One badge chip. Earned chips use C.accent per the accent rule in theme.ts —
 * the same cyan as the share card they open, so tapping does not change colour
 * mid-flow. Locked chips carry a lock glyph so their state is not conveyed by
 * dimming alone. The `dimmed` flag is for the collapsed Locked group.
 */
export default function BadgeChip({
  badge, onPress, dimmed,
}: {
  badge: EarnedBadge;
  onPress?: (badge: EarnedBadge) => void;
  dimmed?: boolean;
}) {
  const inProgress = !badge.earned && badge.progress > 0;
  const pct = Math.round(badge.progress * 100);
  const iconColor = badge.earned ? C.accent : inProgress ? C.text : C.ghost;
  const titleStyle = badge.earned ? s.titleEarned : inProgress ? s.titleActive : s.titleLocked;

  const body = (
    <>
      {badge.earned && (
        <View style={s.corner}>
          <Icon name="checkmark-circle" color={C.accent} size={16} />
        </View>
      )}
      {!badge.earned && !inProgress && (
        <View style={s.corner}>
          <Icon name="lock-closed-outline" color={C.ghost} size={12} />
        </View>
      )}
      <Icon name={badge.icon as IconName} color={iconColor} size={24} />
      <Text style={[s.title, titleStyle]} numberOfLines={1}>{badge.title}</Text>
      <Text style={s.desc} numberOfLines={2}>{badge.description}</Text>
      {!badge.earned && (
        <>
          <View style={s.track}>
            <View style={[s.fill, { width: `${pct}%` }, inProgress && s.fillActive]} />
          </View>
          <Text style={s.progressLabel}>{pct}%</Text>
        </>
      )}
    </>
  );

  if (badge.earned && onPress) {
    return (
      <Pressable
        style={({ pressed }) => [s.chip, s.chipEarned, glow(C.accent, 10, 0.35), pressed && press]}
        onPress={() => onPress(badge)}
        accessibilityRole="button"
        accessibilityLabel={`${badge.title}, earned. ${badge.description}. Tap to share.`}
      >
        {body}
      </Pressable>
    );
  }

  const label = badge.earned
    ? `${badge.title}, earned. ${badge.description}.`
    : inProgress
      ? `${badge.title}, ${pct} percent complete. ${badge.description}.`
      : `${badge.title}, locked. ${badge.description}.`;

  return (
    <View
      style={[
        s.chip,
        badge.earned && s.chipEarned,
        badge.earned && glow(C.accent, 10, 0.35),
        dimmed && s.dimmed,
      ]}
      accessible
      accessibilityLabel={label}
    >
      {body}
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    width: "48%",
    backgroundColor: C.bgElev,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: C.line,
    padding: 10,
    alignItems: "center",
    gap: 4,
    position: "relative",
  },
  chipEarned: { borderColor: C.accent },
  dimmed: { opacity: 0.6 },
  corner: {
    position: "absolute", top: 6, right: 6, zIndex: 1,
    backgroundColor: C.bgElev, borderRadius: radius.pill,
  },
  title: { fontSize: 12, fontFamily: F.semibold, textAlign: "center" },
  titleEarned: { color: C.accent },
  titleActive: { color: C.text },
  titleLocked: { color: C.text2 },
  desc: { color: C.text3, fontSize: 12, fontFamily: F.body, textAlign: "center" },
  track: { width: "100%", height: 4, borderRadius: radius.pill, backgroundColor: C.line, marginTop: 2, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: C.ghost },
  fillActive: { backgroundColor: C.accent },
  progressLabel: { color: C.text2, fontSize: 12, fontFamily: F.medium, marginTop: 2 },
});
