import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getMatch, MatchRecord, replayMatch } from "../../../src/repos/matchRepo";
import type { MatchState } from "../../../src/engine";
import PressableScale from "../../../src/components/PressableScale";
import ShareCard from "../../../src/components/ShareCard";
import Icon from "../../../src/components/Icon";
import { shareMatchCard } from "../../../src/lib/shareMatch";
import { toast } from "../../../src/lib/toast";
import { C, F } from "../../../src/theme";

export default function MatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [match, setMatch] = useState<MatchRecord | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const cardRef = useRef<View>(null);

  useEffect(() => {
    if (!id) return;
    getMatch(id).then(setMatch);
    replayMatch(id).then(setState);
  }, [id]);

  if (!match) return <View style={s.root} />;
  const names = (side: { name: string }[]) => side.map((p) => p.name).join(" / ");
  const scoreLine = (match.score_summary?.games ?? []).map((g) => `${g.A}-${g.B}`).join("   ");
  const onShare = () => shareMatchCard(cardRef).catch(() => toast("Couldn't share", "error"));

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

      <PressableScale style={s.shareBtn} onPress={onShare}>
        <Icon name="trophy" color={C.text} size={18} />
        <Text style={s.shareText}>Share to story</Text>
      </PressableScale>

      {/* Off-screen card captured for sharing. */}
      <View style={s.offscreen} pointerEvents="none">
        <ShareCard
          ref={cardRef}
          teamA={names(match.side_a)}
          teamB={names(match.side_b)}
          winner={match.winner}
          scoreLine={scoreLine || "—"}
          subtitle={`COURTSIDE · ${new Date(match.created_at).toLocaleDateString()}`}
        />
      </View>
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
  shareBtn: { flexDirection: "row", gap: 8, backgroundColor: C.red, borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 4 },
  shareText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
  offscreen: { position: "absolute", left: -10000, top: 0 },
});
