import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getMatch, MatchRecord, replayMatch } from "../../../src/repos/matchRepo";
import type { MatchState } from "../../../src/engine";
import { C } from "../../../src/theme";

export default function MatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [match, setMatch] = useState<MatchRecord | null>(null);
  const [state, setState] = useState<MatchState | null>(null);

  useEffect(() => {
    if (!id) return;
    getMatch(id).then(setMatch);
    replayMatch(id).then(setState);
  }, [id]);

  if (!match) return <View style={s.root} />;
  const names = (side: { name: string }[]) => side.map((p) => p.name).join(" / ");

  return (
    <ScrollView style={s.root} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={s.card}>
        <Text style={[s.team, match.winner === "A" && s.win]}>{names(match.side_a)}</Text>
        <Text style={s.vs}>vs</Text>
        <Text style={[s.team, match.winner === "B" && s.win]}>{names(match.side_b)}</Text>
      </View>
      {match.score_summary?.games.map((g, i) => (
        <View key={i} style={s.gameRow}>
          <Text style={s.gameLbl}>Game {i + 1}</Text>
          <Text style={s.gameScore}>{g.A} – {g.B}</Text>
        </View>
      ))}
      {state && (
        <View style={s.card}>
          <Text style={s.meta}>Total rallies: {state.rallies.length + state.gameHistory.reduce((n, g) => n + g.score.A + g.score.B, 0)}</Text>
          <Text style={s.meta}>Status: {match.status}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, gap: 4 },
  team: { color: C.text, fontSize: 18, fontWeight: "700" },
  win: { color: C.green },
  vs: { color: C.text2, fontSize: 13 },
  gameRow: {
    flexDirection: "row", justifyContent: "space-between",
    backgroundColor: C.card, borderRadius: 12, padding: 14,
  },
  gameLbl: { color: C.text2, fontSize: 15 },
  gameScore: { color: C.text, fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
  meta: { color: C.text2, fontSize: 14 },
});
