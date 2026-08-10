import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { defaultConfig, GAME_FORMATS, MatchConfig, replay } from "../src/engine";
import { createMatch } from "../src/repos/matchRepo";
import { Club, listRealClubs, listPlayers, ClubPlayer } from "../src/repos/clubRepo";
import Court, { type CourtEdit } from "../src/components/Court";
import type { CourtBoxEdit } from "../src/components/CourtBox";
import ClubPicker from "../src/components/ClubPicker";
import PressableScale from "../src/components/PressableScale";
import BusyButton from "../src/components/BusyButton";
import { courtZones, rightRow, type CourtRow, type CourtZone } from "../src/lib/courtZones";
import { loadLastLineup, resolveInitialLineup, saveLastLineup } from "../src/lib/lastLineup";
import { toast } from "../src/lib/toast";
import { useSession } from "../src/stores/session";
import { recordGuestMatch } from "../src/lib/guestMatches";
import { C } from "../src/theme";

type ZoneKey = { team: "A" | "B"; row: CourtRow };
const sameZone = (a: ZoneKey | null, b: ZoneKey) => !!a && a.team === b.team && a.row === b.row;

const DOUBLES_LABELS = ["Player 1", "Player 2", "Player 3", "Player 4"];
const SINGLES_LABELS = ["Player A", "Player B"];

export default function NewMatch() {
  const router = useRouter();
  const { session } = useSession();
  const isGuest = !!session?.user.is_anonymous;
  const params = useLocalSearchParams<{ clubId?: string; sessionId?: string; teamA?: string; teamB?: string }>();

  const [doubles, setDoubles] = useState(true);
  const [namesDoubles, setNamesDoubles] = useState<string[]>(["", "", "", ""]);
  const [namesSingles, setNamesSingles] = useState<string[]>(["", ""]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [roster, setRoster] = useState<ClubPlayer[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [points, setPoints] = useState<11 | 15 | 21>(21);
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(3);
  const [firstServerIdx, setFirstServerIdx] = useState(0); // index into the active names array
  const [editing, setEditing] = useState<ZoneKey | null>(null);
  const [pulse, setPulse] = useState<{ zone: ZoneKey; key: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const [lineupRestored, setLineupRestored] = useState(false);
  const pulseSeq = useRef(0);

  const names = doubles ? namesDoubles : namesSingles;
  const setNames = doubles ? setNamesDoubles : setNamesSingles;
  const labels = doubles ? DOUBLES_LABELS : SINGLES_LABELS;
  const filled = names.every((n) => n.trim());

  // Restore the previous lineup once on mount. Route params (a session or
  // tournament deep link) win over anything remembered.
  useEffect(() => {
    let cancelled = false;
    loadLastLineup().then((persisted) => {
      if (cancelled) return;
      const init = resolveInitialLineup(params, persisted, isGuest);
      setDoubles(init.doubles);
      setNamesDoubles(init.namesDoubles);
      setNamesSingles(init.namesSingles);
      setPoints(init.points);
      setBestOf(init.bestOf);
      setClubId(init.clubId);
      setLineupRestored(true);
    });
    return () => { cancelled = true; };
    // Mount only: later param changes would fight the user's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Guests never save to a club — skip the fetch so a stale local clubs_cache
    // from a previous signed-in account on this device can't leak through.
    if (isGuest) return;
    listRealClubs().then(setClubs);
  }, [isGuest]);

  // Auto-select the user's only club, but only once the lineup restore has
  // applied its own clubId (a params clubId or a persisted one): listRealClubs
  // and loadLastLineup race, and applying this before the restore lands would
  // let the restore's unconditional setClubId(init.clubId) silently overwrite
  // the auto-selected club with null. The `prev ?? ...` guard then also keeps
  // this from overriding whatever the restore actually chose.
  useEffect(() => {
    if (!lineupRestored || clubs.length !== 1) return;
    setClubId((prev) => prev ?? clubs[0].id);
  }, [clubs, lineupRestored]);

  // Roster for the selected club: powers the suggestion strip and fills any
  // name slot still empty.
  useEffect(() => {
    if (!clubId) { setRoster([]); return; }
    listPlayers(clubId).then((players) => {
      setRoster(players);
      setNames((prev) => prev.map((n, i) => (n.trim() ? n : players[i]?.name ?? "")));
    });
    // setNames is derived from `doubles`; the roster prefill only ever targets
    // the arrangement visible when the club was chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const buildConfig = (): MatchConfig => {
    const n = names.map((x, i) => x.trim() || labels[i]);
    const teams = doubles
      ? { A: [{ id: "a0", name: n[0] }, { id: "a1", name: n[1] }], B: [{ id: "b0", name: n[2] }, { id: "b1", name: n[3] }] }
      : { A: [{ id: "a0", name: n[0] }], B: [{ id: "b0", name: n[1] }] };
    const serverTeam = firstServerIdx < names.length / 2 ? "A" : "B";
    const serverPlayer = doubles ? firstServerIdx % 2 : 0;
    return defaultConfig({
      matchType: doubles ? "doubles" : "singles",
      teams,
      pointsToWin: points,
      cap: GAME_FORMATS[points].maxScore, // 11->15, 15->20, 21->30
      intervalAt: points === 21 ? 11 : 0,
      bestOf,
      firstServer: { team: serverTeam, playerIndex: serverPlayer },
    });
  };

  // Live preview of the starting arrangement (score 0–0). It is also the input
  // surface: every zone/name interaction below is resolved against this state.
  const preview = useMemo(() => {
    try {
      return replay([{ type: "MATCH_STARTED", config: buildConfig(), at: 0 }]);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesDoubles, namesSingles, doubles, points, bestOf, firstServerIdx]);

  /** Slot in the active names array for the player standing in a zone. */
  const nameIndexOf = (zone: CourtZone): number | null => {
    if (zone.playerIdx === null) return null;
    return doubles ? (zone.team === "A" ? 0 : 2) + zone.playerIdx : zone.team === "A" ? 0 : 1;
  };

  const setNameAt = (index: number, text: string) =>
    setNames((prev) => prev.map((n, i) => (i === index ? text : n)));

  /** Swap left/right halves (team A ↔ team B). */
  const swapSides = () => {
    if (doubles) {
      setNamesDoubles((p) => [p[2], p[3], p[0], p[1]]);
      setFirstServerIdx((i) => (i + 2) % 4);
    } else {
      setNamesSingles((p) => [p[1], p[0]]);
      setFirstServerIdx((i) => (i === 0 ? 1 : 0));
    }
    setEditing(null);
  };

  /**
   * Swap the two players within a team (top ↔ bottom court). We swap the name
   * slots but keep firstServerIdx pointing at the same slot: for the serving
   * team the right-court player is the first server, so this correctly moves
   * the other player into the right court (and into the serving role).
   */
  const swapTeam = (team: "A" | "B") => {
    const [x, y] = team === "A" ? [0, 1] : [2, 3];
    setNamesDoubles((p) => p.map((n, i) => (i === x ? p[y] : i === y ? p[x] : n)));
    setEditing(null);
  };

  const rejectServe = (team: "A" | "B") => {
    pulseSeq.current += 1;
    setPulse({ zone: { team, row: rightRow(team) }, key: pulseSeq.current });
    toast("Service must start from the right service court.", "error");
  };

  const pickServer = (zone: CourtZone) => {
    const index = nameIndexOf(zone);
    if (!zone.isRightCourt || index === null) {
      rejectServe(zone.team);
      return;
    }
    setEditing(null);
    setFirstServerIdx(index);
  };

  /** Move editing to the next occupied slot, or stop when this was the last. */
  const editNext = (zone: CourtZone) => {
    const index = nameIndexOf(zone);
    if (index === null || !preview) { setEditing(null); return; }
    const next = courtZones(preview).find((z) => nameIndexOf(z) === index + 1);
    setEditing(next ? { team: next.team, row: next.row } : null);
  };

  const zoneEdit = (zone: CourtZone): CourtBoxEdit => {
    const index = nameIndexOf(zone);
    const key: ZoneKey = { team: zone.team, row: zone.row };
    return {
      value: index === null ? "" : names[index],
      placeholder: index === null ? "" : labels[index],
      editing: sameZone(editing, key),
      onNamePress: () => index !== null && setEditing(key),
      onChangeText: (text) => index !== null && setNameAt(index, text),
      onSubmit: () => editNext(zone),
      // Only clear if this box is still the active one: onSubmitEditing runs
      // first and may already have moved editing to the next slot.
      onEndEdit: () => setEditing((e) => (sameZone(e, key) ? null : e)),
      onZonePress: () => pickServer(zone),
      pulseKey: pulse && sameZone(pulse.zone, key) ? pulse.key : 0,
    };
  };

  const edit: CourtEdit = {
    zoneEdit,
    onSwapSides: swapSides,
    onSwapTeam: swapTeam,
    showTeamSwap: doubles,
  };

  const suggestions = useMemo(() => {
    if (!editing || !preview || roster.length === 0) return [];
    const zone = courtZones(preview).find((z) => sameZone(editing, { team: z.team, row: z.row }));
    const index = zone ? nameIndexOf(zone) : null;
    const typed = index === null ? "" : names[index].trim().toLowerCase();
    const taken = new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean));
    return roster
      .filter((p) => !typed || p.name.toLowerCase().includes(typed))
      .filter((p) => !taken.has(p.name.toLowerCase()) || p.name.toLowerCase() === typed)
      .slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, preview, roster, namesDoubles, namesSingles, doubles]);

  const applySuggestion = (name: string) => {
    if (!editing || !preview) return;
    const zone = courtZones(preview).find((z) => sameZone(editing, { team: z.team, row: z.row }));
    const index = zone ? nameIndexOf(zone) : null;
    if (index === null || !zone) return;
    setNameAt(index, name);
    editNext(zone);
  };

  const toggleFormat = (next: boolean) => {
    setDoubles(next);
    setFirstServerIdx(0);
    setEditing(null);
  };

  const start = async () => {
    setStarting(true);
    try {
      const config = buildConfig();
      const side = (t: "A" | "B") => config.teams[t].map((p) => ({ club_player_id: null, name: p.name }));
      const id = await createMatch(config, side("A"), side("B"), clubId, params.sessionId ?? null);
      await saveLastLineup({ doubles, namesDoubles, namesSingles, points, bestOf, clubId });
      if (isGuest) await recordGuestMatch(id);
      router.replace(`/score/${id}`);
    } catch (e) {
      toast((e as Error).message || "Could not start the match", "error");
      setStarting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={s.topRow}>
        <View style={s.seg}>
          {[true, false].map((d) => (
            <PressableScale
              key={String(d)}
              style={[s.segBtn, doubles === d && s.segOn]}
              onPress={() => toggleFormat(d)}
              scaleTo={0.96}
            >
              <Text style={[s.segText, doubles === d && s.segTextOn]}>{d ? "Doubles" : "Singles"}</Text>
            </PressableScale>
          ))}
        </View>
        {!isGuest && <ClubPicker clubs={clubs} clubId={clubId} onChange={setClubId} />}
      </View>

      <View style={s.courtWrap}>{preview && <Court state={preview} edit={edit} />}</View>

      {/* One row, swapped for roster suggestions while a name is being edited,
          so the page height never changes. */}
      <View style={s.swapRow}>
        {editing && suggestions.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={s.chipRow}>
              {suggestions.map((p) => (
                <Pressable key={p.id} style={s.chip} onPress={() => applySuggestion(p.name)}>
                  <Text style={s.chipText} numberOfLines={1}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={s.formatRow}>
            <View style={s.formatGroup}>
              <Text style={s.caption}>Points</Text>
              <View style={s.seg}>
                {([11, 15, 21] as const).map((p) => (
                  <Pressable key={p} style={[s.segBtn, points === p && s.segOn]} onPress={() => setPoints(p)}>
                    <Text style={[s.segText, points === p && s.segTextOn]}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={s.formatGroup}>
              <Text style={s.caption}>Games</Text>
              <View style={s.seg}>
                {([[1, 1], [2, 3], [3, 5]] as const).map(([win, bo]) => (
                  <Pressable key={bo} style={[s.segBtn, bestOf === bo && s.segOn]} onPress={() => setBestOf(bo)}>
                    <Text style={[s.segText, bestOf === bo && s.segTextOn]}>{win}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}
      </View>

      <Text style={s.hint}>
        First to {Math.floor(bestOf / 2) + 1} {bestOf === 1 ? "game" : "games"} · best of {bestOf} ·
        tap a right-hand court to set the first serve
      </Text>

      <BusyButton busy={starting} disabled={!filled} style={[s.cta, !filled && { opacity: 0.5 }]} onPress={start}>
        <Text style={s.ctaText}>Start scoring</Text>
      </BusyButton>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 12 },
  topRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  seg: { flexDirection: "row", backgroundColor: C.card, borderRadius: 12, padding: 4, gap: 4, flex: 1 },
  segBtn: { flex: 1, borderRadius: 9, minHeight: 40, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: C.red },
  segText: { color: C.text2, fontSize: 15, fontWeight: "600" },
  segTextOn: { color: C.text },
  courtWrap: { flex: 1, minHeight: 200 },
  swapRow: { minHeight: 62, justifyContent: "center" },
  formatRow: { flexDirection: "row", gap: 12 },
  formatGroup: { flex: 1, gap: 2 },
  caption: { color: C.text2, fontSize: 12, fontWeight: "700" },
  chipRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  chip: {
    backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 14,
    minHeight: 40, justifyContent: "center",
    borderWidth: 1, borderColor: C.line, maxWidth: 160,
  },
  chipText: { color: C.text, fontSize: 14, fontWeight: "600" },
  hint: { color: C.text2, fontSize: 12 },
  cta: { backgroundColor: C.red, borderRadius: 14, minHeight: 56, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontSize: 18, fontWeight: "800" },
});
