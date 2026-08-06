import React from "react";
import { StyleSheet, Text, View } from "react-native";
import CardShell from "./CardShell";
import Avatar from "./Avatar";
import { truncateName, topStandings } from "../../lib/share/cardData";
import type { ClubSession, SessionStats } from "../../repos/sessionRepo";
import { C, F, radius } from "../../theme";

export default function SessionResultCard({
  session,
  stats,
  avatarUrls = {},
}: {
  session: ClubSession;
  stats: SessionStats;
  avatarUrls?: Record<string, string | null>;
}) {
  const top = topStandings(stats.players, 3);

  return (
    <CardShell>
      <View style={s.root}>
        <Text style={s.title}>SESSION RESULTS</Text>
        <Text style={s.date}>{new Date(session.starts_at).toLocaleDateString()}</Text>
        <View style={s.rows}>
          {top.map((p, i) => (
            <View key={p.name} style={s.row}>
              <Text style={s.rank}>{i + 1}</Text>
              <Avatar name={p.name} avatarUrl={avatarUrls[p.name]} size={48} />
              <Text style={s.name}>{truncateName(p.name)}</Text>
              <Text style={s.record}>{p.wins}-{p.losses}</Text>
            </View>
          ))}
        </View>
      </View>
    </CardShell>
  );
}

const s = StyleSheet.create({
  root: { width: "100%", alignItems: "center", gap: 20 },
  title: { color: C.text, fontFamily: F.display, fontSize: 40, letterSpacing: 1 },
  date: { color: C.text3, fontFamily: F.body, fontSize: 20, marginBottom: 12 },
  rows: { width: "100%", gap: 12 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: C.card, borderRadius: radius.md, padding: 16,
  },
  rank: { color: C.text2, fontFamily: F.display, fontSize: 28, width: 36 },
  name: { flex: 1, color: C.text, fontFamily: F.semibold, fontSize: 24 },
  record: { color: C.text2, fontFamily: F.medium, fontSize: 22 },
});
