import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { updateTournament, type TournamentRow } from "../repos/tournamentRepo";
import { buildTournamentJoinPath, buildTournamentScorerJoinPath, buildTournamentSpectatorJoinPath } from "../lib/joinLink";
import { shareJoinLink } from "../lib/shareJoin";
import { validateName } from "../lib/validate";
import { toast } from "../lib/toast";
import Icon from "./Icon";
import BusyButton from "./BusyButton";
import { C, F, press } from "../theme";

const BESTOFS = [1, 3, 5] as const;
const MIN_COURTS = 1;
const MAX_COURTS = 10;

/**
 * Config tab: name, a courts stepper, both share links, and Start. Non-admins
 * get a read-only summary and the player link only — sharing the scorer link
 * is an admin action.
 */
export default function TournamentConfigTab({
  tournament, isAdmin, isDraft, blocker, starting, onStart, onChanged,
}: {
  tournament: TournamentRow;
  isAdmin: boolean;
  isDraft: boolean;
  blocker: string | null;
  starting: boolean;
  onStart: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(tournament.name);
  const [touched, setTouched] = useState(false);
  const [courts, setCourts] = useState(tournament.courts);
  const [bestOf, setBestOf] = useState(tournament.bestOf);
  const [finalsBestOf, setFinalsBestOf] = useState(tournament.finalsBestOf);
  const [busy, setBusy] = useState(false);

  const nameError = validateName(name, "Tournament name");
  const dirty =
    name.trim() !== tournament.name || courts !== tournament.courts ||
    bestOf !== tournament.bestOf || finalsBestOf !== tournament.finalsBestOf;

  const onSave = async () => {
    if (nameError) { setTouched(true); toast(nameError, "error"); return; }
    setBusy(true);
    try {
      await updateTournament(tournament.id, { name: name.trim(), courts, bestOf, finalsBestOf });
      toast("Tournament updated", "success");
      onChanged();
    } catch (e) {
      toast((e as Error).message || "Could not update tournament", "error");
    } finally {
      setBusy(false);
    }
  };

  const onSharePlayer = () =>
    shareJoinLink(buildTournamentJoinPath(tournament.id), `invited you to compete in "${tournament.name}"`);
  const onShareScorer = () =>
    shareJoinLink(buildTournamentScorerJoinPath(tournament.id), `invited you to help score "${tournament.name}"`);
  const onShareSpectator = () =>
    shareJoinLink(buildTournamentSpectatorJoinPath(tournament.id), `invited you to watch "${tournament.name}" live`);

  // Values above MAX_COURTS are refused, not clamped silently.
  const Stepper = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <View style={s.stepRow}>
      <Pressable
        onPress={() => onChange(Math.max(MIN_COURTS, value - 1))}
        disabled={value <= MIN_COURTS}
        style={({ pressed }) => [s.stepBtn, pressed && press, value <= MIN_COURTS && s.off]}
      >
        <Text style={s.stepBtnText}>−</Text>
      </Pressable>
      <Text style={s.stepValue}>{value}</Text>
      <Pressable
        onPress={() => onChange(Math.min(MAX_COURTS, value + 1))}
        disabled={value >= MAX_COURTS}
        style={({ pressed }) => [s.stepBtn, pressed && press, value >= MAX_COURTS && s.off]}
      >
        <Text style={s.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );

  const Segmented = ({ value, options, onPick }: { value: number; options: readonly number[]; onPick: (v: number) => void }) => (
    <View style={s.segRow}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onPick(o)} style={({ pressed }) => [s.segBtn, pressed && press, value === o && s.segOn]}>
          <Text style={[s.segText, value === o && s.segTextOn]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );

  // The courts stepper and best-of segments only mean anything pre-start —
  // courts is read once by start_tournament to seed round-1, and editing it
  // live changes a number nothing reads. Once live, everyone (including
  // admins) gets the same read-only summary; admin editing moves to the
  // Scorers tab's share link and Live Ops for anything that still matters.
  if (!isAdmin || !isDraft) {
    return (
      <View style={s.root}>
        <Text style={s.h}>{tournament.name}</Text>
        <Text style={s.summary}>
          {tournament.courts} courts · best of {tournament.bestOf} ({tournament.finalsBestOf} semis onward)
        </Text>
        <Pressable style={s.share} onPress={onSharePlayer}>
          <Icon name="share-social-outline" color={C.text} size={18} />
          <Text style={s.shareText}>Share join link</Text>
        </Pressable>
        <Pressable style={s.share} onPress={onShareSpectator}>
          <Icon name="share-social-outline" color={C.text} size={18} />
          <Text style={s.shareText}>Share spectator link</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <Text style={s.label}>Name</Text>
      <TextInput
        style={s.input} placeholder="Tournament name" placeholderTextColor={C.text2}
        value={name} onChangeText={setName} onBlur={() => setTouched(true)}
      />
      {touched && nameError ? <Text style={s.err}>{nameError}</Text> : null}

      <Text style={s.label}>Courts</Text>
      <Stepper value={courts} onChange={setCourts} />

      <Text style={s.label}>Games / match</Text>
      <Segmented value={bestOf} options={BESTOFS} onPick={setBestOf} />

      <Text style={s.label}>Semis onward</Text>
      <Segmented value={finalsBestOf} options={BESTOFS} onPick={setFinalsBestOf} />

      {dirty ? (
        <BusyButton busy={busy} disabled={!!nameError} style={[s.save, !!nameError && s.off]} onPress={onSave}>
          <Text style={s.saveText}>Save changes</Text>
        </BusyButton>
      ) : null}

      <Pressable style={s.share} onPress={onSharePlayer}>
        <Icon name="share-social-outline" color={C.text} size={18} />
        <Text style={s.shareText}>Share join link</Text>
      </Pressable>
      <Pressable style={s.share} onPress={onShareScorer}>
        <Icon name="share-social-outline" color={C.text} size={18} />
        <Text style={s.shareText}>Share scorer link</Text>
      </Pressable>
      <Pressable style={s.share} onPress={onShareSpectator}>
        <Icon name="share-social-outline" color={C.text} size={18} />
        <Text style={s.shareText}>Share spectator link</Text>
      </Pressable>

      {isDraft ? (
        <>
          <BusyButton busy={starting} disabled={!!blocker} style={[s.start, !!blocker && s.off]} onPress={onStart}>
            <Text style={s.startText}>Start tournament</Text>
          </BusyButton>
          {blocker ? <Text style={s.err}>{blocker}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 10, paddingVertical: 12 },
  h: { color: C.text, fontFamily: F.bold, fontSize: 18 },
  summary: { color: C.text2, fontFamily: F.body, fontSize: 14 },
  label: { color: C.text, fontFamily: F.bold, fontSize: 14, marginTop: 6 },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 16 },
  segRow: { flexDirection: "row", gap: 8 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 11, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  segOn: { borderColor: C.lineHi, backgroundColor: C.cardHi },
  segText: { color: C.text2, fontFamily: F.semibold, fontSize: 15 },
  segTextOn: { color: C.text },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },
  stepBtnText: { color: C.text, fontFamily: F.bold, fontSize: 20 },
  stepValue: { color: C.text, fontFamily: F.bold, fontSize: 18, minWidth: 24, textAlign: "center" },
  err: { color: C.red, fontSize: 12.5, fontFamily: F.body },
  save: { backgroundColor: C.red, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  saveText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
  share: { flexDirection: "row", gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 4 },
  shareText: { color: C.text, fontSize: 16, fontWeight: "700" },
  start: { backgroundColor: C.red, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 12 },
  startText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
  off: { opacity: 0.5 },
});
