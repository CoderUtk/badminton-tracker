import React from "react";
import { StyleSheet, Text, View } from "react-native";
import CardShell from "./CardShell";
import Icon, { type IconName } from "../Icon";
import { C, F } from "../../theme";

export default function BadgeResultCard({
  badge, playerName,
}: {
  badge: { title: string; description: string; icon: string };
  playerName: string;
}) {
  return (
    <CardShell>
      <View style={s.root}>
        <View style={s.iconRing}>
          <Icon name={badge.icon as IconName} color={C.red} size={120} />
        </View>
        <Text style={s.title}>{badge.title}</Text>
        <Text style={s.desc}>{badge.description}</Text>
        <Text style={s.name}>{playerName}</Text>
      </View>
    </CardShell>
  );
}

const s = StyleSheet.create({
  root: { width: "100%", alignItems: "center", gap: 28 },
  iconRing: {
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: C.card, borderWidth: 2, borderColor: C.red,
    alignItems: "center", justifyContent: "center",
  },
  title: { color: C.text, fontFamily: F.display, fontSize: 56, letterSpacing: 1, textAlign: "center" },
  desc: { color: C.text2, fontFamily: F.body, fontSize: 26, textAlign: "center", paddingHorizontal: 20 },
  name: { color: C.text3, fontFamily: F.medium, fontSize: 24, marginTop: 12 },
});
