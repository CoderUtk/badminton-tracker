import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon, { type IconName } from "./Icon";
import type { EarnedBadge } from "../achievements/types";
import { C, F, glow } from "../theme";

/**
 * Wrap grid of badge chips. Three visual states driven by earned/progress:
 * locked (progress 0, fully dimmed), in progress (0 < progress < 1,
 * standard-color icon + active progress fill), unlocked (earned, accented
 * icon + glow + checkmark badge, progress bar hidden since the goal's met).
 * Earned badges are pressable if onPressBadge is provided.
 */
export default function BadgeGrid({
  badges, onPressBadge,
}: {
  badges: EarnedBadge[];
  onPressBadge?: (badge: EarnedBadge) => void;
}) {
  return (
    <View style={s.grid}>
      {badges.map((b) => {
        const inProgress = !b.earned && b.progress > 0;
        const iconColor = b.earned ? C.red : inProgress ? C.text : C.text3;
        const titleStyle = b.earned ? s.titleEarned : inProgress ? s.titleActive : s.titleLocked;
        const Wrapper = b.earned ? Pressable : View;
        const wrapperProps = b.earned ? { onPress: () => onPressBadge?.(b) } : {};
        return (
          <Wrapper
            key={b.id}
            style={[s.chip, b.earned && s.chipEarned, b.earned && glow(C.red, 10, 0.35)]}
            {...wrapperProps}
          >
            {b.earned && (
              <View style={s.checkBadge}>
                <Icon name="checkmark-circle" color={C.red} size={16} />
              </View>
            )}
            <Icon name={b.icon as IconName} color={iconColor} size={24} />
            <Text style={[s.title, titleStyle]} numberOfLines={1}>{b.title}</Text>
            <Text style={s.desc} numberOfLines={2}>{b.description}</Text>
            {!b.earned && (
              <View style={s.track}>
                <View style={[s.fill, { width: `${Math.round(b.progress * 100)}%` }, inProgress && s.fillActive]} />
              </View>
            )}
          </Wrapper>
        );
      })}
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
    position: "relative",
  },
  chipEarned: { borderColor: C.red },
  checkBadge: {
    position: "absolute", top: 6, right: 6, zIndex: 1,
    backgroundColor: C.bgElev, borderRadius: 999,
  },
  title: { fontSize: 12, fontFamily: F.semibold, textAlign: "center" },
  titleEarned: { color: C.red },
  titleActive: { color: C.text },
  titleLocked: { color: C.text2 },
  desc: { color: C.text3, fontSize: 10, fontFamily: F.body, textAlign: "center" },
  track: { width: "100%", height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 2, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2, backgroundColor: C.text3 },
  fillActive: { backgroundColor: C.red },
});
