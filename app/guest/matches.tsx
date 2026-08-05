import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { getGuestMatchIds } from "../../src/lib/guestMatches";
import { getMatch, MatchRecord } from "../../src/repos/matchRepo";
import Icon from "../../src/components/Icon";
import PressableScale from "../../src/components/PressableScale";
import { C, F } from "../../src/theme";

const names = (side: { name: string }[]) => side.map((p) => p.name).join(" / ");
const format = (m: MatchRecord) =>
  `${m.config.matchType === "singles" ? "Singles" : "Doubles"} · ${m.config.pointsToWin} pts`;

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
          <Text style={s.teamName} numberOfLines={1}>{names(item.side_a)}</Text>
          <Text style={s.vs}>vs</Text>
          <Text style={s.teamName} numberOfLines={1}>{names(item.side_b)}</Text>
          {item.status === "live" && <Text style={s.liveBadge}>● LIVE — tap to resume</Text>}
        </PressableScale>
      )}
    />
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.line, gap: 4 },
  cardLive: { borderColor: C.green },
  format: { color: C.text2, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  teamName: { color: C.text, fontSize: 16, fontWeight: "700" },
  vs: { color: C.text3, fontSize: 12 },
  liveBadge: { color: C.green, fontSize: 12, fontWeight: "900", marginTop: 4 },
  emptyRoot: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24, backgroundColor: C.bg },
  emptyTitle: { color: C.text, fontSize: 20, fontWeight: "900", marginTop: 4, fontFamily: F.display },
  emptyText: { color: C.text2, fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 8 },
  emptyCta: { flexDirection: "row", gap: 8, backgroundColor: C.red, borderRadius: 14, minHeight: 52, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },
  emptyCtaText: { color: C.text, fontSize: 17, fontWeight: "800" },
});
