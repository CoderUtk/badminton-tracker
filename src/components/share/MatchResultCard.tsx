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
          <Avatar name={p.name} avatarUrl={avatarUrls[p.club_player_id ?? ""]} size={84} />
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

        <View style={s.vsRow}>
          <View style={s.vsLine} />
          <Text style={s.vsText}>VS</Text>
          <View style={s.vsLine} />
        </View>

        <View style={s.scoreBlock}>
          {games.map((g, i) => {
            const [a, b] = g.split("-");
            return (
              <View key={i} style={s.gameRow}>
                {games.length > 1 && <Text style={s.gameLabel}>GAME {i + 1}</Text>}
                <View style={s.gameScoreRow}>
                  <Text style={games.length === 1 ? s.scoreMain : s.scoreMinor}>{a}</Text>
                  <Text style={games.length === 1 ? s.scoreDashMain : s.scoreDash}>—</Text>
                  <Text style={games.length === 1 ? s.scoreMain : s.scoreMinor}>{b}</Text>
                </View>
              </View>
            );
          })}
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
  root: { alignItems: "center", gap: 36, width: "100%" },
  team: { alignItems: "center", gap: 16 },
  playerRow: { alignItems: "center", gap: 12 },
  playerName: { color: C.text, fontFamily: F.semibold, fontSize: 32, textAlign: "center" },
  playerNameWinner: { color: C.accent, ...textGlow(C.accent, 12) },
  winnerPill: { backgroundColor: C.red, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 8, ...glow(C.red, 12, 0.5) },
  winnerPillText: { color: C.text, fontFamily: F.bold, fontSize: 16, letterSpacing: 1 },
  vsRow: { flexDirection: "row", alignItems: "center", gap: 16, width: "70%" },
  vsLine: { flex: 1, height: 1, backgroundColor: C.line },
  vsText: { color: C.text3, fontFamily: F.bold, fontSize: 18, letterSpacing: 2 },
  scoreBlock: { alignItems: "center", gap: 16 },
  gameRow: { alignItems: "center", gap: 4 },
  gameLabel: { color: C.text3, fontFamily: F.medium, fontSize: 16, letterSpacing: 1 },
  gameScoreRow: { flexDirection: "row", alignItems: "center", gap: 20 },
  scoreMain: { color: C.text, fontFamily: F.display, fontSize: 140, ...textGlow(C.text, 10) },
  scoreMinor: { color: C.text, fontFamily: F.display, fontSize: 64 },
  scoreDashMain: { color: C.text3, fontFamily: F.display, fontSize: 72 },
  scoreDash: { color: C.text3, fontFamily: F.display, fontSize: 36 },
  date: { color: C.text3, fontFamily: F.body, fontSize: 22, marginTop: 8 },
});
