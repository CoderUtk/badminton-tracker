import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createTournament, type MatchType } from "../../../src/repos/tournamentRepo";
import { listClubs, listPlayers, type ClubPlayer } from "../../../src/repos/clubRepo";
import type { BracketSize } from "../../../src/tournament/types";
import { C, F, press } from "../../../src/theme";
import { toast } from "../../../src/lib/toast";

const SIZES: BracketSize[] = [4, 8, 16, 32, 64];
const BESTOFS = [1, 3, 5] as const;

export default function NewTournament() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clubId?: string }>();
  const [clubId, setClubId] = useState(params.clubId ?? "");
  const [name, setName] = useState("");
  const [size, setSize] = useState<BracketSize>(8);
  const [matchType, setMatchType] = useState<MatchType>("singles");
  const [bestOf, setBestOf] = useState<number>(3);
  const [finalsBestOf, setFinalsBestOf] = useState<number>(3);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [picked, setPicked] = useState<string[]>([]); // club_player_id in selection order

  useEffect(() => {
    (async () => {
      let id = clubId;
      if (!id) { id = (await listClubs())[0]?.id ?? ""; setClubId(id); }
      if (id) setPlayers(await listPlayers(id));
    })();
  }, [clubId]);

  const perEntrant = matchType === "doubles" ? 2 : 1;
  const cap = size * perEntrant; // max individual players selectable

  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < cap ? [...cur, id] : cur));

  const setMode = (m: MatchType) => { setMatchType(m); setPicked([]); };

  const entrantCount = Math.floor(picked.length / perEntrant);
  const canCreate = useMemo(
    () => name.trim().length > 0 && entrantCount >= 2 && entrantCount <= size && picked.length % perEntrant === 0,
    [name, entrantCount, size, picked.length, perEntrant],
  );

  const onCreate = async () => {
    try {
      const byId = new Map(players.map((p) => [p.id, p]));
      const nameOf = (pid: string) => byId.get(pid)?.name ?? "Player";
      const entrants =
        matchType === "doubles"
          ? Array.from({ length: entrantCount }, (_, i) => {
              const p1 = picked[i * 2], p2 = picked[i * 2 + 1];
              return { clubPlayerId: p1, clubPlayerId2: p2, name: `${nameOf(p1)} / ${nameOf(p2)}`, seed: i + 1 };
            })
          : picked.map((pid, i) => ({ clubPlayerId: pid, name: nameOf(pid), seed: i + 1 }));
      const tid = await createTournament(clubId, name.trim(), size, matchType, bestOf, finalsBestOf, entrants);
      router.replace(`/tournaments/${tid}`);
    } catch (e) {
      toast((e as Error).message || "Could not create tournament", "error");
    }
  };

  const Segmented = ({ value, options, onPick }: { value: number | string; options: readonly (number | string)[]; onPick: (v: never) => void }) => (
    <View style={s.segRow}>
      {options.map((o) => (
        <Pressable key={String(o)} onPress={() => onPick(o as never)} style={({ pressed }) => [s.segBtn, pressed && press, value === o && s.segOn]}>
          <Text style={[s.segText, value === o && s.segTextOn]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );

  const label = matchType === "doubles" ? "pairs" : "players";

  return (
    <View style={s.root}>
      <TextInput style={s.input} placeholder="Tournament name" placeholderTextColor={C.text2} value={name} onChangeText={setName} />

      <Text style={s.h}>Format</Text>
      <Segmented value={matchType} options={["singles", "doubles"]} onPick={(v) => setMode(v as MatchType)} />

      <Text style={s.h}>Draw size</Text>
      <Segmented value={size} options={SIZES} onPick={(v) => setSize(v as BracketSize)} />

      <View style={s.gamesRow}>
        <View style={s.gamesCol}>
          <Text style={s.h}>Games / match</Text>
          <Segmented value={bestOf} options={BESTOFS} onPick={(v) => setBestOf(v as number)} />
        </View>
        <View style={s.gamesCol}>
          <Text style={s.h}>Semis onward</Text>
          <Segmented value={finalsBestOf} options={BESTOFS} onPick={(v) => setFinalsBestOf(v as number)} />
        </View>
      </View>

      <Text style={s.h}>Pick entrants ({entrantCount}/{size} {label})</Text>
      <FlatList
        style={{ flex: 1 }}
        data={players}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={s.empty}>No club players. Add players to the club first.</Text>}
        renderItem={({ item }) => {
          const idx = picked.indexOf(item.id);
          const on = idx >= 0;
          const badge = matchType === "doubles" ? `P${Math.floor(idx / 2) + 1}` : `#${idx + 1}`;
          return (
            <Pressable style={({ pressed }) => [s.player, pressed && press, on && s.playerOn]} onPress={() => toggle(item.id)}>
              <Text style={[s.playerName, on && { color: C.text }]}>{item.name}</Text>
              {on ? <Text style={s.seed}>{badge}</Text> : null}
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
  root: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 10 },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 16 },
  h: { color: C.text, fontFamily: F.bold, fontSize: 14 },
  segRow: { flexDirection: "row", gap: 8 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 11, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  segOn: { borderColor: C.red, backgroundColor: "rgba(255,59,48,0.12)" },
  segText: { color: C.text2, fontFamily: F.semibold, fontSize: 15, textTransform: "capitalize" },
  segTextOn: { color: C.text },
  gamesRow: { flexDirection: "row", gap: 12 },
  gamesCol: { flex: 1, gap: 6 },
  empty: { color: C.text2, textAlign: "center", marginTop: 24 },
  player: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.card, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  playerOn: { borderColor: C.accent },
  playerName: { color: C.text2, fontSize: 15, fontFamily: F.body },
  seed: { color: C.accent, fontFamily: F.semibold },
  create: { backgroundColor: C.red, borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  off: { opacity: 0.5 },
  createText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
});
