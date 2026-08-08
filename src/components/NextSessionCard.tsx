import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon from "./Icon";
import { C, F, press } from "../theme";

/**
 * The upcoming-session card. Both strings are resolved by the caller — the club
 * name as title (ClubSession has no title field) and sessionMetaLabel() as meta.
 * The caller renders nothing at all when there is no upcoming session; this
 * component has no empty state of its own.
 */
export default function NextSessionCard({
  title, meta, onPress,
}: {
  title: string; meta: string; onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && press]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Next session: ${title}, ${meta}`}
    >
      <View style={s.iconWrap}>
        <Icon name="calendar" color={C.accent} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <Text style={s.meta} numberOfLines={1}>{meta}</Text>
      </View>
      <Icon name="chevron-forward" color={C.text2} size={20} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.card, borderRadius: 12, padding: 14,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(34,211,238,0.12)", alignItems: "center", justifyContent: "center",
  },
  title: { color: C.text, fontSize: 16, fontFamily: F.bold },
  meta: { color: C.text2, fontSize: 13, fontFamily: F.body, marginTop: 2 },
});
