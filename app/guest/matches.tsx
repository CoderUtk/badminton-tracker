import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter, Stack } from "expo-router";
import { getGuestMatchIds } from "../../src/lib/guestMatches";
import { getMatch, MatchRecord } from "../../src/repos/matchRepo";
import type { TeamId } from "../../src/engine";
import Icon from "../../src/components/Icon";
import PressableScale from "../../src/components/PressableScale";
import { C, F } from "../../src/theme";

const names = (side: { name: string }[]) => side.map((p) => p.name).join(" / ");
const format = (m: MatchRecord) =>
  `${m.config.matchType === "singles" ? "Singles" : "Doubles"} · ${m.config.pointsToWin} pts`;

function TeamLine({ item, team }: { item: MatchRecord; team: TeamId }) {
  const side = team === "A" ? item.side_a : item.side_b;
  const won = item.winner === team;
  const games = item.score_summary?.games ?? [];
  const current = item.score_summary?.current;
  return (
    <View style={s.teamLine}>
      {won && <Icon name="trophy" color={C.green} size={14} />}
      <Text style={[s.teamName, won && s.teamWon]} numberOfLines={1}>{names(side)}</Text>
      {item.status === "live" && current ? (
        <Text style={s.liveScore}>{current[team]}</Text>
      ) : (
        <View style={s.scoreCells}>
          {games.map((g, i) => {
            const mine = team === "A" ? g.A : g.B;
            const gameWon = team === "A" ? g.A > g.B : g.B > g.A;
            return <Text key={i} style={[s.gameCell, gameWon && s.gameCellWon]}>{mine}</Text>;
          })}
        </View>
      )}
    </View>
  );
}

export default function GuestMatches() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        const ids = await getGuestMatchIds();
        const rows = await Promise.all(ids.map((id) => getMatch(id)));
        if (live) setMatches(rows.filter((m): m is MatchRecord => m !== null));
      })();
      return () => { live = false; };
    }, [])
  );

  if (matches.length === 0) {
    return (
      <View style={s.emptyRoot}>
        <Stack.Screen options={{ title: "My matches" }} />
        <Icon name="badminton" color={C.text2} size={48} />
        <Text style={s.emptyTitle}>No matches yet</Text>
        <Text style={s.emptyText}>Quick matches you score this session show up here.</Text>
        <PressableScale style={s.emptyCta} onPress={() => router.push("/new-match")}>
          <Icon name="play" color={C.text} size={18} />
          <Text style={s.emptyCtaText}>Start a match</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "My matches" }} />
      <FlatList
        style={s.root}
        contentContainerStyle={s.list}
        data={matches}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <PressableScale
            style={[s.card, item.status === "live" && s.cardLive]}
            onPress={() => router.push(`/score/${item.id}`)}
          >
            <Text style={s.format}>{format(item)}</Text>
            <TeamLine item={item} team="A" />
            <Text style={s.vs}>vs</Text>
            <TeamLine item={item} team="B" />
            {item.status === "live" && <Text style={s.liveBadge}>● LIVE — tap to resume</Text>}
          </PressableScale>
        )}
      />
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.line, gap: 4 },
  cardLive: { borderColor: C.green },
  format: { color: C.text2, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  teamLine: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 },
  teamName: { flex: 1, color: C.text, fontSize: 16, fontWeight: "700" },
  teamWon: { color: C.green, fontWeight: "900" },
  scoreCells: { flexDirection: "row", alignItems: "center", gap: 6 },
  gameCell: { color: C.text2, fontSize: 15, fontWeight: "700", minWidth: 22, textAlign: "center", fontVariant: ["tabular-nums"] },
  gameCellWon: { color: C.text, fontWeight: "900" },
  liveScore: { color: C.green, fontSize: 20, fontFamily: F.display, minWidth: 30, textAlign: "right", fontVariant: ["tabular-nums"] },
  vs: { color: C.text3, fontSize: 12 },
  liveBadge: { color: C.green, fontSize: 12, fontWeight: "900", marginTop: 4 },
  emptyRoot: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  emptyTitle: { color: C.text, fontSize: 20, fontWeight: "900", marginTop: 4, fontFamily: F.display },
  emptyText: { color: C.text2, fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 8 },
  emptyCta: { flexDirection: "row", gap: 8, backgroundColor: C.red, borderRadius: 14, minHeight: 52, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },
  emptyCtaText: { color: C.text, fontSize: 17, fontWeight: "800" },
});
