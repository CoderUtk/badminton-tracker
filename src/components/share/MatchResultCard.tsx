import React from "react";
import { StyleSheet, Text, View } from "react-native";
import CardShell from "./CardShell";
import Avatar from "./Avatar";
import { truncateName, formatGameScores } from "../../lib/share/cardData";
import type { MatchRecord, SidePlayer } from "../../repos/matchRepo";
import { C, F, glow, textGlow } from "../../theme";

function TeamBlock({
  players,
  isWinner,
  avatarUrls,
}: {
  players: SidePlayer[];
  isWinner: boolean;
  avatarUrls: Record<string, string | null>;
}) {
  return (
    <View style={s.team}>
      {isWinner && (
        <View style={s.winnerPill}>
          <Text style={s.winnerPillText}>WINNER</Text>
        </View>
      )}
      {players.map((p) => (
        <View key={p.club_player_id ?? p.name} style={s.playerRow}>
          <Avatar name={p.name} avatarUrl={avatarUrls[p.club_player_id ?? ""]} size={56} />
          <Text style={[s.playerName, isWinner && s.playerNameWinner]}>
            {truncateName(p.name)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function MatchResultCard({
  record,
  avatarUrls = {},
}: {
  record: MatchRecord;
  avatarUrls?: Record<string, string | null>;
}) {
  const games = formatGameScores(record.score_summary);
  const winnerIsA = record.winner === "A";

  return (
    <CardShell>
      <View style={s.root}>
        <TeamBlock players={record.side_a} isWinner={winnerIsA} avatarUrls={avatarUrls} />
        <View style={s.scoreBlock}>
          {games.map((g, i) => (
            <Text key={i} style={i === 0 ? s.scoreMain : s.scoreMinor}>{g}</Text>
          ))}
        </View>
        <TeamBlock players={record.side_b} isWinner={!winnerIsA} avatarUrls={avatarUrls} />
        <Text style={s.date}>
          {new Date(record.created_at).toLocaleDateString()}
        </Text>
      </View>
    </CardShell>
  );
}

const s = StyleSheet.create({
  root: { alignItems: "center", gap: 28 },
  team: { alignItems: "center", gap: 12 },
  playerRow: { alignItems: "center", gap: 8 },
  playerName: { color: C.text, fontFamily: F.semibold, fontSize: 26, textAlign: "center" },
  playerNameWinner: { color: C.accent, ...textGlow(C.accent, 10) },
  winnerPill: { backgroundColor: C.red, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6, ...glow(C.red, 10, 0.5) },
  winnerPillText: { color: C.text, fontFamily: F.bold, fontSize: 14, letterSpacing: 1 },
  scoreBlock: { alignItems: "center", gap: 4 },
  scoreMain: { color: C.text, fontFamily: F.display, fontSize: 96 },
  scoreMinor: { color: C.text2, fontFamily: F.display, fontSize: 48 },
  date: { color: C.text3, fontFamily: F.body, fontSize: 20, marginTop: 12 },
});
