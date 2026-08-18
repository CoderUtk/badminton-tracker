import { useEffect, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getRealtimeBackend } from "../../../../src/realtime";
import type { LiveMatch } from "../../../../src/realtime/backend";
import { C, F } from "../../../../src/theme";

/**
 * Live matches for one club. The club id comes from the route: an earlier
 * version guessed it with `clubs[0]`, so it only ever watched the user's first
 * club and subscribed to "" when they had none.
 */
export default function ClubLive() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<LiveMatch[]>([]);

  useEffect(() => {
    if (!id) return;
    let off = () => {};
    let cancelled = false;
    (async () => {
      const rt = getRealtimeBackend();
      const initial = await rt.listLiveMatches(id);
      if (cancelled) return;
      setItems(initial);
      off = rt.onLiveMatchesChange(id, setItems);
    })();
    return () => { cancelled = true; off(); };
  }, [id]);

  return (
    <View style={{ flex: 1, padding: 16 }}>
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
