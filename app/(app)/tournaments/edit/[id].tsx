import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { refreshTournament, updateTournament } from "../../../../src/repos/tournamentRepo";
import { validateName } from "../../../../src/lib/validate";
import { toast } from "../../../../src/lib/toast";
import FormScreen from "../../../../src/components/FormScreen";
import { C, F, press } from "../../../../src/theme";

const BESTOFS = [1, 3, 5] as const;
const COURTS = [1, 2, 3, 4, 6, 8] as const;

/**
 * Edit a tournament's settings. Format and draw size are deliberately absent:
 * either would invalidate the existing bracket and its entrants, which is a
 * re-seed rather than an edit.
 */
export default function EditTournament() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [courts, setCourts] = useState(4);
  const [bestOf, setBestOf] = useState(3);
  const [finalsBestOf, setFinalsBestOf] = useState(3);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        // Deliberately network-only, not cache-first: this is an edit form.
        // Painting stale values risks the user submitting them back over
        // another admin's change, or a late refresh clobbering their typing.
        const full = await refreshTournament(id);
        if (!full) throw new Error("Tournament not found");
        const { tournament } = full;
        setName(tournament.name);
        setCourts(tournament.courts);
        setBestOf(tournament.bestOf);
        setFinalsBestOf(tournament.finalsBestOf);
        setLoaded(true);
      } catch (e) {
        toast((e as Error).message || "Could not load the tournament", "error");
      }
    })();
  }, [id]);

  const nameError = validateName(name, "Tournament name");

  const onSave = async () => {
    if (nameError) { setTouched(true); toast(nameError, "error"); return; }
    if (!id) return;
    setBusy(true);
    try {
      await updateTournament(id, { name: name.trim(), courts, bestOf, finalsBestOf });
      toast("Tournament updated", "success");
      router.back();
    } catch (e) {
      toast((e as Error).message || "Could not update tournament", "error");
    } finally {
      setBusy(false);
    }
  };

  const Segmented = ({ value, options, onPick }: { value: number; options: readonly number[]; onPick: (v: number) => void }) => (
    <View style={s.segRow}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onPick(o)} style={({ pressed }) => [s.segBtn, pressed && press, value === o && s.segOn]}>
          <Text style={[s.segText, value === o && s.segTextOn]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );

  if (!loaded) return <View style={s.center}><Text style={s.muted}>Loading…</Text></View>;

  return (
    <FormScreen contentContainerStyle={s.content}>
      <Text style={s.h}>Name</Text>
      <TextInput
        style={s.input} placeholder="Tournament name" placeholderTextColor={C.text2}
        value={name} onChangeText={setName} onBlur={() => setTouched(true)}
      />
      {touched && nameError ? <Text style={s.err}>{nameError}</Text> : null}

      <Text style={s.h}>Courts</Text>
      <Segmented value={courts} options={COURTS} onPick={setCourts} />

      <Text style={s.h}>Games / match</Text>
      <Segmented value={bestOf} options={BESTOFS} onPick={setBestOf} />

      <Text style={s.h}>Semis onward</Text>
      <Segmented value={finalsBestOf} options={BESTOFS} onPick={setFinalsBestOf} />

      <Text style={s.note}>
        Format and draw size cannot be changed once the bracket exists. Games per
        match applies to matches started from now on.
      </Text>

      <Pressable
        style={({ pressed }) => [s.save, pressed && press, (!!nameError || busy) && s.off]}
        disabled={!!nameError || busy}
        onPress={onSave}
      >
        <Text style={s.saveText}>Save changes</Text>
      </Pressable>
    </FormScreen>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  muted: { color: C.text2 },
  h: { color: C.text, fontFamily: F.bold, fontSize: 14, marginTop: 6 },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 16 },
  segRow: { flexDirection: "row", gap: 8 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 11, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  segOn: { borderColor: C.lineHi, backgroundColor: C.cardHi },
  segText: { color: C.text2, fontFamily: F.semibold, fontSize: 15 },
  segTextOn: { color: C.text },
  note: { color: C.text2, fontSize: 13, lineHeight: 19, marginTop: 8, fontFamily: F.body },
  save: { backgroundColor: C.red, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 12 },
  saveText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
  off: { opacity: 0.5 },
  err: { color: C.red, fontSize: 12.5, fontFamily: F.body },
});
