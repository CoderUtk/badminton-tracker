import { useEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createTournament, type MatchType } from "../../../src/repos/tournamentRepo";
import { addGuestPlayer, listClubs, listPlayers, type ClubPlayer } from "../../../src/repos/clubRepo";
import type { BracketSize } from "../../../src/tournament/types";
import { C, F, press } from "../../../src/theme";
import { toast } from "../../../src/lib/toast";
import { validateName } from "../../../src/lib/validate";

const SIZES: BracketSize[] = [4, 8, 16, 32, 64];
const BESTOFS = [1, 3, 5] as const;
const COURTS = [1, 2, 3, 4, 6, 8] as const;

export default function NewTournament() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clubId?: string }>();
  const [clubId, setClubId] = useState(params.clubId ?? "");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [size, setSize] = useState<BracketSize>(8);
  const [matchType, setMatchType] = useState<MatchType>("singles");
  const [bestOf, setBestOf] = useState<number>(3);
  const [finalsBestOf, setFinalsBestOf] = useState<number>(3);
  const [courts, setCourts] = useState<number>(4);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [picked, setPicked] = useState<string[]>([]); // club_player_id in selection order
  const [guestName, setGuestName] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);

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
  const nameError = validateName(name, "Tournament name");
  const canCreate = useMemo(
    () => nameError === null && entrantCount >= 2 && entrantCount <= size && picked.length % perEntrant === 0,
    [nameError, entrantCount, size, picked.length, perEntrant],
  );

  const onCreate = async () => {
    if (nameError) { toast(nameError, "error"); return; }
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
      const tid = await createTournament(clubId, name.trim(), size, matchType, bestOf, finalsBestOf, entrants, courts);
      router.replace(`/tournaments/${tid}`);
    } catch (e) {
      toast((e as Error).message || "Could not create tournament", "error");
    }
  };

  const guestError = validateName(guestName, "Player name");

  /**
   * Add a non-registered player to the club and select them straight away.
   * addGuestPlayer returns void, so the new row is found by name in the
   * refreshed roster — ignoring ids already picked, so repeated names still
   * resolve to the row that was just created.
   */
  const onAddGuest = async () => {
    if (guestError || !clubId) { if (guestError) toast(guestError, "error"); return; }
    const trimmed = guestName.trim();
    setAddingGuest(true);
    try {
      await addGuestPlayer(clubId, trimmed);
      const next = await listPlayers(clubId);
      setPlayers(next);
      setGuestName("");
      const added = next.find((p) => p.name === trimmed && !picked.includes(p.id));
      if (added) setPicked((cur) => (cur.length < cap ? [...cur, added.id] : cur));
      toast("Player added", "success");
    } catch (e) {
      toast((e as Error).message || "Could not add player", "error");
    } finally {
      setAddingGuest(false);
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
    // A FlatList must not be nested in a ScrollView, so this screen keeps its
    // View root and only lifts it above the keyboard.
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TextInput
        style={s.input} placeholder="Tournament name" placeholderTextColor={C.text2}
        value={name} onChangeText={setName} onBlur={() => setNameTouched(true)}
      />
      {nameTouched && nameError ? <Text style={s.err}>{nameError}</Text> : null}

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

      <Text style={s.h}>Courts</Text>
      <Segmented value={courts} options={COURTS} onPick={(v) => setCourts(v as number)} />

      <Text style={s.h}>Pick entrants ({entrantCount}/{size} {label})</Text>
      <View style={s.guestRow}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          placeholder="Guest player name"
          placeholderTextColor={C.text2}
          value={guestName}
          onChangeText={setGuestName}
          onSubmitEditing={() => { if (!guestError && !addingGuest) void onAddGuest(); }}
          returnKeyType="done"
        />
        <Pressable
          style={({ pressed }) => [s.guestBtn, pressed && press, (!!guestError || addingGuest) && s.off]}
          disabled={!!guestError || addingGuest}
          onPress={onAddGuest}
        >
          <Text style={s.guestBtnText}>Add</Text>
        </Pressable>
      </View>
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
    </KeyboardAvoidingView>
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
  err: { color: C.red, fontSize: 12.5, fontFamily: F.body },
  guestRow: { flexDirection: "row", gap: 8 },
  guestBtn: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 18, justifyContent: "center" },
  guestBtnText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
});
