import React from "react";
import { StyleSheet, Text, View } from "react-native";
import CardShell from "./CardShell";
import Avatar from "./Avatar";
import Icon from "../Icon";
import { truncateName } from "../../lib/share/cardData";
import { C, F, glow, textGlow } from "../../theme";

export default function TournamentResultCard({
  tournamentName,
  date,
  champion,
  runnerUp,
}: {
  tournamentName: string;
  date: number;
  champion: { name: string; avatarUrl?: string | null };
  runnerUp: { name: string; avatarUrl?: string | null };
}) {
  return (
    <CardShell>
      <View style={s.root}>
        <View style={s.pill}>
          <Icon name="trophy" size={20} color={C.text} />
          <Text style={s.pillText}>CHAMPION</Text>
        </View>
        <Avatar name={champion.name} avatarUrl={champion.avatarUrl} size={120} />
        <Text style={s.championName}>{truncateName(champion.name)}</Text>
        <Text style={s.runnerUpLabel}>RUNNER-UP</Text>
        <View style={s.runnerUpRow}>
          <Avatar name={runnerUp.name} avatarUrl={runnerUp.avatarUrl} size={48} />
          <Text style={s.runnerUpName}>{truncateName(runnerUp.name)}</Text>
        </View>
        <Text style={s.tournamentName}>{tournamentName}</Text>
        <Text style={s.date}>{new Date(date).toLocaleDateString()}</Text>
      </View>
    </CardShell>
  );
}

const s = StyleSheet.create({
  root: { alignItems: "center", gap: 16 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.red, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8,
    ...glow(C.accent, 14, 0.5),
  },
  pillText: { color: C.text, fontFamily: F.bold, fontSize: 16, letterSpacing: 1 },
  championName: { color: C.accent, fontFamily: F.display, fontSize: 56, textAlign: "center", ...textGlow(C.accent, 14) },
  runnerUpLabel: { color: C.text3, fontFamily: F.medium, fontSize: 14, letterSpacing: 1, marginTop: 16 },
  runnerUpRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  runnerUpName: { color: C.text2, fontFamily: F.semibold, fontSize: 24 },
  tournamentName: { color: C.text, fontFamily: F.semibold, fontSize: 24, marginTop: 20, textAlign: "center" },
  date: { color: C.text3, fontFamily: F.body, fontSize: 18 },
});
