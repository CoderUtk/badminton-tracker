import { useEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { createTournament, type MatchType } from "../../../src/repos/tournamentRepo";
import { addGuestPlayer, listClubs, listPlayers, type ClubPlayer } from "../../../src/repos/clubRepo";
import { drawSizeFor, startBlocker } from "../../../src/tournament/draw";
import { C, F, press, selected, selectedText } from "../../../src/theme";
import Icon from "../../../src/components/Icon";
import { toast } from "../../../src/lib/toast";
import { validateName } from "../../../src/lib/validate";

const BESTOFS = [1, 3, 5] as const;
const MIN_COURTS = 1;
const MAX_COURTS = 10;

export default function NewTournament() {
  const router = useRouter();
  const [clubId, setClubId] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [matchType, setMatchType] = useState<MatchType>("singles");
  const [bestOf, setBestOf] = useState<number>(3);
  const [finalsBestOf, setFinalsBestOf] = useState<number>(3);
  const [courts, setCourts] = useState<number>(4);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [picked, setPicked] = useState<string[]>([]); // club_player_id in selection order
  const [guestName, setGuestName] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const [tab, setTab] = useState<"config" | "entrants">("config");
  const [entrantMode, setEntrantMode] = useState<"registered" | "guest">("registered");

  useEffect(() => {
    (async () => {
      const id = (await listClubs()).find((c) => c.personal)?.id ?? "";
      setClubId(id);
      if (id) setPlayers(await listPlayers(id));
    })();
  }, []);

  const perEntrant = matchType === "doubles" ? 2 : 1;
  // 64 is the largest BracketSize (startBlocker's ceiling), so this is
  // 64 entrants max — 64 singles players or 64 doubles pairs (128 players).
  const maxPicked = 64 * perEntrant;

  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < maxPicked ? [...cur, id] : cur));

  const setMode = (m: MatchType) => { setMatchType(m); setPicked([]); };

  const entrantCount = Math.floor(picked.length / perEntrant);
  const nameError = validateName(name, "Tournament name");
  const entrantsBlocker = startBlocker(picked.length, matchType);
  const canCreate = useMemo(
    () => nameError === null && picked.length > 0 && picked.length % perEntrant === 0 && entrantsBlocker === null,
    [nameError, picked.length, perEntrant, entrantsBlocker],
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
      const tid = await createTournament(name.trim(), matchType, bestOf, finalsBestOf, entrants, courts);
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
      if (added) setPicked((cur) => (cur.length < maxPicked ? [...cur, added.id] : cur));
      toast("Player added", "success");
    } catch (e) {
      toast((e as Error).message || "Could not add player", "error");
    } finally {
      setAddingGuest(false);
    }
  };

  // Values above MAX_COURTS are refused, not clamped silently.
  const CourtsStepper = () => (
    <View style={s.stepRow}>
      <Pressable
        onPress={() => setCourts((c) => Math.max(MIN_COURTS, c - 1))}
        disabled={courts <= MIN_COURTS}
        style={({ pressed }) => [s.stepBtn, pressed && press, courts <= MIN_COURTS && s.off]}
      >
        <Text style={s.stepBtnText}>−</Text>
      </Pressable>
      <Text style={s.stepValue}>{courts}</Text>
      <Pressable
        onPress={() => setCourts((c) => Math.min(MAX_COURTS, c + 1))}
        disabled={courts >= MAX_COURTS}
        style={({ pressed }) => [s.stepBtn, pressed && press, courts >= MAX_COURTS && s.off]}
      >
        <Text style={s.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );

  const Segmented = ({ value, options, onPick }: { value: number | string; options: readonly (number | string)[]; onPick: (v: never) => void }) => (
    <View style={s.segRow}>
      {options.map((o) => (
        <Pressable key={String(o)} onPress={() => onPick(o as never)} style={({ pressed }) => [s.segBtn, pressed && press, value === o && s.segOn]}>
          <Text style={[s.segText, value === o && s.segTextOn]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    // A FlatList must not be nested in a ScrollView, so this screen keeps its
    // View root and only lifts it above the keyboard.
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.tabRow}>
        <Pressable onPress={() => setTab("config")} style={({ pressed }) => [s.tabBtn, pressed && press, tab === "config" && s.tabOn]}>
          <Text style={[s.tabText, tab === "config" && s.tabTextOn]}>Config</Text>
        </Pressable>
        <Pressable onPress={() => setTab("entrants")} style={({ pressed }) => [s.tabBtn, pressed && press, tab === "entrants" && s.tabOn]}>
          <Text style={[s.tabText, tab === "entrants" && s.tabTextOn]}>Entrants ({entrantCount})</Text>
        </Pressable>
      </View>

      {tab === "config" ? (
        <View style={{ gap: 10 }}>
          <TextInput
            style={s.input} placeholder="Tournament name" placeholderTextColor={C.text2}
            value={name} onChangeText={setName} onBlur={() => setNameTouched(true)}
          />
          {nameTouched && nameError ? <Text style={s.err}>{nameError}</Text> : null}

          <Text style={s.h}>Format</Text>
          <Segmented value={matchType} options={["singles", "doubles"]} onPick={(v) => setMode(v as MatchType)} />

          <View style={s.gamesRow}>
            <View style={s.gamesCol}>
              <Text style={s.h} numberOfLines={1}>Games</Text>
              <Segmented value={bestOf} options={BESTOFS} onPick={(v) => setBestOf(v as number)} />
            </View>
            <View style={s.gamesCol}>
              <Text style={s.h}>Semis onward</Text>
              <Segmented value={finalsBestOf} options={BESTOFS} onPick={(v) => setFinalsBestOf(v as number)} />
            </View>
            <View style={s.gamesCol}>
              <Text style={s.h}>Courts</Text>
              <CourtsStepper />
            </View>
          </View>
        </View>
      ) : (
        <View style={{ flex: 1, gap: 10 }}>
          <Text style={s.h}>{entrantCount} → {drawSizeFor(entrantCount)} draw</Text>

          <View style={s.segRow}>
            <Pressable
              onPress={() => setEntrantMode("registered")}
              style={({ pressed }) => [s.segBtn, pressed && press, entrantMode === "registered" && s.segOn]}
            >
              <Text style={[s.segText, entrantMode === "registered" && s.segTextOn]}>Registered</Text>
            </Pressable>
            <Pressable
              onPress={() => setEntrantMode("guest")}
              style={({ pressed }) => [s.segBtn, pressed && press, entrantMode === "guest" && s.segOn]}
            >
              <Text style={[s.segText, entrantMode === "guest" && s.segTextOn]}>Add guest</Text>
            </Pressable>
          </View>

          {entrantMode === "guest" ? (
            <>
              <View style={s.guestRow}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Guest player name"
                  placeholderTextColor={C.text2}
                  value={guestName}
                  onChangeText={setGuestName}
                  onSubmitEditing={() => { if (!guestError && !addingGuest) void onAddGuest(); }}
                  returnKeyType="done"
                  autoFocus
                />
                <Pressable
                  style={({ pressed }) => [s.guestBtn, pressed && press, (!!guestError || addingGuest) && s.off]}
                  disabled={!!guestError || addingGuest}
                  onPress={onAddGuest}
                >
                  <Text style={s.guestBtnText}>Add</Text>
                </Pressable>
              </View>
              {guestName && guestError ? <Text style={s.err}>{guestError}</Text> : null}
            </>
          ) : (
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
                    <View style={[s.checkbox, on && s.checkboxOn]}>
                      {on && <Icon name="checkmark" color={C.text} size={14} />}
                    </View>
                    <Text style={[s.playerName, { flex: 1 }, on && { color: C.text }]}>{item.name}</Text>
                    {on ? <Text style={s.seed}>{badge}</Text> : null}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      )}

      {entrantsBlocker ? <Text style={s.err}>{entrantsBlocker}</Text> : null}
      <Pressable style={({ pressed }) => [s.create, pressed && press, !canCreate && s.createOff]} disabled={!canCreate} onPress={onCreate}>
        <Text style={[s.createText, !canCreate && s.createTextOff]}>Create bracket</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 10 },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 16 },
  h: { color: C.text, fontFamily: F.bold, fontSize: 14 },
  segRow: { flexDirection: "row", gap: 8 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 11, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  segOn: selected,
  segText: { color: C.text2, fontFamily: F.semibold, fontSize: 15, textTransform: "capitalize" },
  segTextOn: selectedText,
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  stepBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },
  stepBtnText: { color: C.text, fontFamily: F.bold, fontSize: 20 },
  stepValue: { color: C.text, fontFamily: F.bold, fontSize: 18, minWidth: 24, textAlign: "center" },
  gamesRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  gamesCol: { flexGrow: 1, flexBasis: "40%", gap: 6 },
  empty: { color: C.text2, textAlign: "center", marginTop: 24 },
  player: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.card, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  playerOn: { borderColor: C.lineHi, backgroundColor: C.cardHi },
  playerName: { color: C.text2, fontSize: 15, fontFamily: F.body },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.line, alignItems: "center", justifyContent: "center", marginRight: 10 },
  checkboxOn: { backgroundColor: C.red, borderColor: C.red },
  seed: { color: C.accent, fontFamily: F.semibold },
  create: { backgroundColor: C.red, borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  off: { opacity: 0.5 },
  createText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
  createOff: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  createTextOff: { color: C.text3 },
  err: { color: C.red, fontSize: 12.5, fontFamily: F.body },
  guestRow: { flexDirection: "row", gap: 8 },
  guestBtn: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 18, justifyContent: "center" },
  guestBtnText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
  tabRow: { flexDirection: "row", gap: 8 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line },
  tabOn: selected,
  tabText: { color: C.text2, fontFamily: F.semibold, fontSize: 15 },
  tabTextOn: { color: C.text },
});
