import React, { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { endMatchEarly, listMatches, MatchRecord, replayMatch } from "../../../src/repos/matchRepo";
import { syncNow } from "../../../src/sync/runner";
import { C } from "../../../src/theme";

function summaryText(m: MatchRecord): string {
  if (!m.score_summary?.games.length) return m.status;
  return m.score_summary.games.map((g) => `${g.A}–${g.B}`).join(", ");
}

export default function Matches() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const reload = useCallback(() => { listMatches().then(setMatches); }, []);
  useFocusEffect(reload);

  const endLive = (m: MatchRecord) => {
    Alert.alert("End match?", "Finish now and save the current score to history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End match",
        style: "destructive",
        onPress: async () => {
          const state = await replayMatch(m.id);
          if (state) await endMatchEarly(m.id, state);
          void syncNow();
          reload();
        },
      },
    ]);
  };

  return (
    <View style={s.root}>
      <FlatList
        data={matches}
        keyExtractor={(m) => m.id}
        ListEmptyComponent={
          <Text style={s.empty}>No matches yet. Start one from the Home tab.</Text>
        }
        renderItem={({ item }) => {
          const names = (side: { name: string }[]) => side.map((p) => p.name).join(" / ");
          const live = item.status === "live";
          return (
            <Pressable
              style={s.card}
              onPress={() =>
                live ? router.push(`/score/${item.id}`) : router.push(`/matches/${item.id}`)
              }
            >
              <View style={s.rowBetween}>
                <Text style={[s.team, item.winner === "A" && s.winner]}>{names(item.side_a)}</Text>
                {live && <Text style={s.live}>● LIVE</Text>}
              </View>
              <Text style={[s.team, item.winner === "B" && s.winner]}>{names(item.side_b)}</Text>
              <Text style={s.meta}>
                {summaryText(item)} · {new Date(item.created_at).toLocaleDateString()}
              </Text>
              {live && (
                <View style={s.actions}>
                  <Pressable style={s.resume} onPress={() => router.push(`/score/${item.id}`)}>
                    <Text style={s.resumeText}>▶ Resume</Text>
                  </Pressable>
                  <Pressable style={s.stop} onPress={() => endLive(item)}>
                    <Text style={s.stopText}>■ End</Text>
                  </Pressable>
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 16 },
  empty: { color: C.text2, fontSize: 15, paddingVertical: 12 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8, gap: 2 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  team: { color: C.text, fontSize: 16, fontWeight: "600" },
  winner: { color: C.green },
  live: { color: C.green, fontWeight: "800", fontSize: 13 },
  meta: { color: C.text2, fontSize: 13, marginTop: 4 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  resume: { flex: 1, backgroundColor: C.cardHi, borderRadius: 9, minHeight: 40, alignItems: "center", justifyContent: "center" },
  resumeText: { color: C.text, fontWeight: "800", fontSize: 14 },
  stop: { flex: 1, backgroundColor: C.red, borderRadius: 9, minHeight: 40, alignItems: "center", justifyContent: "center" },
  stopText: { color: C.text, fontWeight: "800", fontSize: 14 },
});
