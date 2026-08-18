import React from "react";
import { StyleSheet, Text, View } from "react-native";
import CardShell from "./CardShell";
import Avatar from "./Avatar";
import Icon, { type IconName } from "../Icon";
import { C, F, CARD_TYPE, textGlow } from "../../theme";

export default function BadgeResultCard({
  badge, playerName, avatarUrl = null,
}: {
  badge: { title: string; description: string; icon: string };
  playerName: string;
  avatarUrl?: string | null;
}) {
  return (
    <CardShell>
      <View style={s.root}>
        <View style={s.iconRing}>
          <Icon name={badge.icon as IconName} color={C.accent} size={120} />
        </View>
        <Text style={s.title}>{badge.title}</Text>
        <Text style={s.desc}>{badge.description}</Text>
        <View style={s.playerRow}>
          <Avatar name={playerName} avatarUrl={avatarUrl} size={72} />
          <Text style={s.name}>{playerName}</Text>
        </View>
      </View>
    </CardShell>
  );
}

const s = StyleSheet.create({
  root: { width: "100%", alignItems: "center", gap: 28 },
  iconRing: {
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: C.card, borderWidth: 2, borderColor: C.accent,
    alignItems: "center", justifyContent: "center",
  },
  title: { color: C.text, fontFamily: F.display, fontSize: CARD_TYPE.title, letterSpacing: 1, textAlign: "center", ...textGlow(C.accent, 24) },
  desc: { color: C.text2, fontFamily: F.body, fontSize: CARD_TYPE.body, textAlign: "center", paddingHorizontal: 20 },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 12 },
  name: { color: C.text3, fontFamily: F.medium, fontSize: CARD_TYPE.subtitle },
});
