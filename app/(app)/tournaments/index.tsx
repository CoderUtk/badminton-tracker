import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { listTournaments, type TournamentRow } from "../../../src/repos/tournamentRepo";
import { listClubs } from "../../../src/repos/clubRepo";
import Icon from "../../../src/components/Icon";
import { C, F, press } from "../../../src/theme";

const statusColor = (s: string) => (s === "done" ? C.text3 : s === "live" ? C.red : C.accent);

export default function TournamentsList() {
  const router = useRouter();
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [clubId, setClubId] = useState("");

  const reload = useCallback(() => {
    (async () => {
      const clubs = await listClubs();
      const id = clubs[0]?.id ?? "";
      setClubId(id);
      setRows(await listTournaments(id));
    })();
  }, []);
  useFocusEffect(reload);

  return (
    <View style={s.root}>
      <Pressable
        style={({ pressed }) => [s.newBtn, pressed && press, !clubId && s.off]}
        disabled={!clubId}
        onPress={() => router.push(`/tournaments/new?clubId=${clubId}`)}
      >
        <Icon name="add" color={C.text} size={18} />
        <Text style={s.newText}>New tournament</Text>
      </Pressable>
      <FlatList
        data={rows}
        keyExtractor={(t) => t.id}
        ListEmptyComponent={<Text style={s.empty}>No tournaments yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [s.card, pressed && press]} onPress={() => router.push(`/tournaments/${item.id}`)}>
            <Icon name="trophy" color={statusColor(item.status)} size={22} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.meta}>{item.size}-player · {item.status}</Text>
            </View>
            <Icon name="chevron-forward" color={C.text2} size={20} />
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 12 },
  newBtn: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: C.red, borderRadius: 12, paddingVertical: 14 },
  off: { opacity: 0.5 },
  newText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
  empty: { color: C.text2, textAlign: "center", marginTop: 40 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  name: { color: C.text, fontSize: 16, fontFamily: F.semibold },
  meta: { color: C.text2, fontSize: 13, marginTop: 2 },
});
