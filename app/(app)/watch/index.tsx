import { useEffect, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { getRealtimeBackend } from "../../../src/realtime";
import type { LiveMatch } from "../../../src/realtime/backend";
import { listClubs } from "../../../src/repos/clubRepo";
import { C, F } from "../../../src/theme";

export default function WatchList() {
  const [items, setItems] = useState<LiveMatch[]>([]);

  useEffect(() => {
    let off = () => {};
    let cancelled = false;
    (async () => {
      const clubs = await listClubs();
      const clubId = clubs[0]?.id ?? "";
      const rt = getRealtimeBackend();
      const initial = await rt.listLiveMatches(clubId);
      if (cancelled) return;
      setItems(initial);
      off = rt.onLiveMatchesChange(clubId, setItems);
    })();
    return () => { cancelled = true; off(); };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 16 }}>
      {items.length === 0 ? (
        <Text style={{ color: C.text2, textAlign: "center", marginTop: 48 }}>No live matches right now</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.matchId}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/watch/${item.matchId}`)}
              style={{ backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderColor: C.line, borderWidth: 1 }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: C.text, fontFamily: F.semibold }} numberOfLines={1}>
                  {item.teamA.join(" / ")} vs {item.teamB.join(" / ")}
                </Text>
                <Text style={{ color: C.text2, marginTop: 4, fontFamily: F.body }}>{item.scoreSummary}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.red }} />
                <Text style={{ color: C.red, fontFamily: F.medium, fontSize: 12 }}>LIVE</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
