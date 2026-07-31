import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createTournament } from "../../../src/repos/tournamentRepo";
import { listClubs, listPlayers, type ClubPlayer } from "../../../src/repos/clubRepo";
import type { BracketSize } from "../../../src/tournament/types";
import { C, F, press } from "../../../src/theme";

const SIZES: BracketSize[] = [4, 8, 16, 32];

export default function NewTournament() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clubId?: string }>();
  const [clubId, setClubId] = useState(params.clubId ?? "");
  const [name, setName] = useState("");
  const [size, setSize] = useState<BracketSize>(8);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [picked, setPicked] = useState<string[]>([]); // club_player_id in selection order

  useEffect(() => {
    (async () => {
      let id = clubId;
      if (!id) { id = (await listClubs())[0]?.id ?? ""; setClubId(id); }
      if (id) setPlayers(await listPlayers(id));
    })();
  }, [clubId]);

  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < size ? [...cur, id] : cur));

  const canCreate = useMemo(() => name.trim().length > 0 && picked.length >= 2 && picked.length <= size, [name, picked, size]);

  const onCreate = async () => {
    try {
      const byId = new Map(players.map((p) => [p.id, p]));
      const entrants = picked.map((pid, i) => ({ clubPlayerId: pid, name: byId.get(pid)?.name ?? "Player", seed: i + 1 }));
      const tid = await createTournament(clubId, name.trim(), size, entrants);
      router.replace(`/tournaments/${tid}`);
    } catch (e) {
      Alert.alert("Could not create tournament", (e as Error).message);
    }
  };

  return (
    <View style={s.root}>
      <TextInput style={s.input} placeholder="Tournament name" placeholderTextColor={C.text2} value={name} onChangeText={setName} />
      <View style={s.sizeRow}>
        {SIZES.map((n) => (
          <Pressable key={n} onPress={() => setSize(n)} style={({ pressed }) => [s.sizeBtn, pressed && press, size === n && s.sizeOn]}>
            <Text style={[s.sizeText, size === n && s.sizeTextOn]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.h}>Pick entrants ({picked.length}/{size})</Text>
      <FlatList
        style={{ flex: 1 }}
        data={players}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={s.empty}>No club players. Add players to the club first.</Text>}
        renderItem={({ item }) => {
          const idx = picked.indexOf(item.id);
          const on = idx >= 0;
          return (
            <Pressable style={({ pressed }) => [s.player, pressed && press, on && s.playerOn]} onPress={() => toggle(item.id)}>
              <Text style={[s.playerName, on && { color: C.text }]}>{item.name}</Text>
              {on ? <Text style={s.seed}>#{idx + 1}</Text> : null}
            </Pressable>
          );
        }}
      />
      <Pressable style={({ pressed }) => [s.create, pressed && press, !canCreate && s.off]} disabled={!canCreate} onPress={onCreate}>
        <Text style={s.createText}>Create bracket</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 12 },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 16 },
  sizeRow: { flexDirection: "row", gap: 8 },
  sizeBtn: { flex: 1, alignItems: "center", paddingVertical: 12, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  sizeOn: { borderColor: C.red, backgroundColor: "rgba(255,59,48,0.12)" },
  sizeText: { color: C.text2, fontFamily: F.semibold, fontSize: 16 },
  sizeTextOn: { color: C.text },
  h: { color: C.text, fontFamily: F.bold, fontSize: 15 },
  empty: { color: C.text2, textAlign: "center", marginTop: 24 },
  player: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.card, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  playerOn: { borderColor: C.accent },
  playerName: { color: C.text2, fontSize: 15, fontFamily: F.body },
  seed: { color: C.accent, fontFamily: F.semibold },
  create: { backgroundColor: C.red, borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  off: { opacity: 0.5 },
  createText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
});
