import React from "react";
import { StyleSheet, Text, View } from "react-native";
import CardShell from "./CardShell";
import Avatar from "./Avatar";
import { truncateName, topStandings } from "../../lib/share/cardData";
import type { ClubSession, SessionStats } from "../../repos/sessionRepo";
import { formatMatchDate } from "../../lib/matchDetail";
import { C, F, radius, CARD_TYPE } from "../../theme";

export default function SessionResultCard({
  session,
  stats,
  avatarUrls = {},
}: {
  session: ClubSession;
  stats: SessionStats;
  /** Keyed by PlayerStat.id, never by name - two players in a club can share
   *  a display name, and a name key hands one of them the other's photo. */
  avatarUrls?: Record<string, string | null>;
}) {
  const top = topStandings(stats.players, 3);

  return (
    <CardShell>
      <View style={s.root}>
        <Text style={s.title}>SESSION RESULTS</Text>
        <Text style={s.date}>{formatMatchDate(session.starts_at)}</Text>
        <View style={s.rows}>
          {top.map((p, i) => (
            <View key={p.name} style={s.row}>
              <Text style={s.rank}>{i + 1}</Text>
              <Avatar name={p.name} avatarUrl={avatarUrls[p.id]} size={64} />
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
  root: { width: "100%", alignItems: "center", gap: 32 },
  title: { color: C.text, fontFamily: F.display, fontSize: CARD_TYPE.title, letterSpacing: 1 },
  date: { color: C.text3, fontFamily: F.body, fontSize: CARD_TYPE.caption, marginBottom: 16 },
  rows: { width: "100%", gap: 20 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 20,
    backgroundColor: C.card, borderRadius: radius.md, padding: 22,
  },
  rank: { color: C.text2, fontFamily: F.display, fontSize: CARD_TYPE.title, width: 46, fontVariant: ["tabular-nums"] },
  name: { flex: 1, color: C.text, fontFamily: F.semibold, fontSize: CARD_TYPE.subtitle },
  record: { color: C.text2, fontFamily: F.medium, fontSize: CARD_TYPE.subtitle, fontVariant: ["tabular-nums"] },
});
