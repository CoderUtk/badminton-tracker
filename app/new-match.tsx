import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { keyboardShift } from "../src/lib/keyboardShift";
import { useScreenInsets } from "../src/hooks/useScreenInsets";
import { useLocalSearchParams, useRouter } from "expo-router";
import { defaultConfig, GAME_FORMATS, MatchConfig, replay } from "../src/engine";
import { createMatch } from "../src/repos/matchRepo";
import { Club, listRealClubs, listPlayers, addGuestPlayer, ClubPlayer } from "../src/repos/clubRepo";
import Icon from "../src/components/Icon";
import Court, { type CourtEdit } from "../src/components/Court";
import type { CourtBoxEdit } from "../src/components/CourtBox";
import ClubPicker from "../src/components/ClubPicker";
import PressableScale from "../src/components/PressableScale";
import BusyButton from "../src/components/BusyButton";
import { courtZones, rightRow, type CourtRow, type CourtZone } from "../src/lib/courtZones";
import { loadLastLineup, resolveInitialLineup, saveLastLineup } from "../src/lib/lastLineup";
import { fillEmptySlots } from "../src/lib/matchLineup";
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
  const [touchedDoubles, setTouchedDoubles] = useState<boolean[]>([false, false, false, false]);
  const [touchedSingles, setTouchedSingles] = useState<boolean[]>([false, false]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [roster, setRoster] = useState<ClubPlayer[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [points, setPoints] = useState<11 | 15 | 21>(21);
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(3);
  const [firstServerIdx, setFirstServerIdx] = useState(0); // index into the active names array
  const [editing, setEditing] = useState<ZoneKey | null>(null);
  const [pulse, setPulse] = useState<{ zone: ZoneKey; key: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [lineupRestored, setLineupRestored] = useState(false);
  const [clubsLoaded, setClubsLoaded] = useState(false);
  const [courtHeight, setCourtHeight] = useState(0);
  const pulseSeq = useRef(0);

  const names = doubles ? namesDoubles : namesSingles;
  const setNames = doubles ? setNamesDoubles : setNamesSingles;
  const touched = doubles ? touchedDoubles : touchedSingles;
  const setTouched = doubles ? setTouchedDoubles : setTouchedSingles;
  const labels = doubles ? DOUBLES_LABELS : SINGLES_LABELS;
  const filled = names.every((n) => n.trim());

  // Mirrors `touched` so the in-flight listPlayers().then() below can read the
  // latest touched-flags instead of the stale closure it captured when the
  // effect started — a keystroke that lands while the fetch is in flight must
  // still protect its slot.
  const touchedRef = useRef(touched);
  useEffect(() => { touchedRef.current = touched; }, [touched]);

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
      setTouchedDoubles([false, false, false, false]);
      setTouchedSingles([false, false]);
      setPoints(init.points);
      setBestOf(init.bestOf);
      // Names and format are restored, the club deliberately is not: a quick
      // match defaults to Personal, and only an explicit deep-link param
      // preselects a club. Otherwise one club choice would silently stick to
      // every later match.
      setClubId(params.clubId ?? null);
      setLineupRestored(true);
    });
    return () => { cancelled = true; };
    // Mount only: later param changes would fight the user's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Guests never save to a club — skip the fetch so a stale local clubs_cache
    // from a previous signed-in account on this device can't leak through.
    if (isGuest) { setClubsLoaded(true); return; }
    listRealClubs()
      .then(setClubs)
      .catch(() => setClubs([]))
      .finally(() => setClubsLoaded(true));
  }, [isGuest]);

  // A param clubId may belong to a club the current account no
  // longer has — a shared device switching accounts, or a deleted club. Once
  // the real club list has actually finished loading (clubsLoaded, not just a
  // non-empty array — an account can genuinely have zero clubs), drop a
  // clubId that isn't in it so the picker and the saved match never silently
  // disagree. Guarded on lineupRestored so this can't race the initial
  // restore above.
  useEffect(() => {
    if (!lineupRestored || !clubsLoaded) return;
    setClubId((prev) => (prev && !clubs.some((c) => c.id === prev) ? null : prev));
  }, [clubs, clubsLoaded, lineupRestored]);

  // Roster for the selected club: powers the suggestion strip and fills any
  // name slot still empty. Cancelled on cleanup so a slower response from a
  // club/format that's no longer current can't overwrite a newer one.
  useEffect(() => {
    if (!clubId) { setRoster([]); return; }
    let cancelled = false;
    listPlayers(clubId)
      .then((players) => {
        if (cancelled) return;
        setRoster(players);
        setNames((prev) => fillEmptySlots(prev, touchedRef.current, players));
      })
      .catch(() => { if (!cancelled) setRoster([]); });
    return () => { cancelled = true; };
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

  const setNameAt = (index: number, text: string) => {
    setNames((prev) => prev.map((n, i) => (i === index ? text : n)));
    setTouched((prev) => prev.map((t, i) => (i === index ? true : t)));
  };

  /** Swap left/right halves (team A ↔ team B). */
  const swapSides = () => {
    if (doubles) {
      setNamesDoubles((p) => [p[2], p[3], p[0], p[1]]);
      setTouchedDoubles((p) => [p[2], p[3], p[0], p[1]]);
      setFirstServerIdx((i) => (i + 2) % 4);
    } else {
      setNamesSingles((p) => [p[1], p[0]]);
      setTouchedSingles((p) => [p[1], p[0]]);
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
    setTouchedDoubles((p) => p.map((t, i) => (i === x ? p[y] : i === y ? p[x] : t)));
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

  /** Whether an occupied slot follows this one, in name-index order. */
  const hasNextSlot = (zone: CourtZone): boolean => {
    const index = nameIndexOf(zone);
    if (index === null || !preview) return false;
    return !!courtZones(preview).find((z) => nameIndexOf(z) === index + 1);
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
      isLast: !hasNextSlot(zone),
    };
  };

  /**
   * The roster picker, drawn inside the court over the other box of the half
   * being edited. Rendering it here (rather than in a row under the court)
   * keeps it beside the field it fills and leaves Points/Games reachable.
   */
  /**
   * The roster strip shown while a name is being edited: the club players still
   * worth offering, plus whether what has been typed is a name the club doesn't
   * have yet (which earns an "add to club" chip).
   */
  const picker = useMemo(() => {
    const none = { typed: "", players: [] as ClubPlayer[], canAdd: false };
    if (!editing || !preview || !clubId) return none;
    const zone = courtZones(preview).find((z) => sameZone(editing, { team: z.team, row: z.row }));
    const index = zone ? nameIndexOf(zone) : null;
    if (index === null) return none;

    const typed = names[index].trim();
    const lower = typed.toLowerCase();
    const taken = new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean));
    const players = roster
      .filter((p) => !lower || p.name.toLowerCase().includes(lower))
      // `taken` includes this slot's own text, so a name that is already fully
      // typed drops out — picking it would be a no-op, and the panel closes
      // once there is nothing left to choose.
      .filter((p) => !taken.has(p.name.toLowerCase()))
      .slice(0, 12);

    return {
      typed,
      players,
      // Two characters before offering to add, so the chip doesn't flash on the
      // first keystroke of a name that is already on the roster.
      canAdd: typed.length >= 2 && !roster.some((p) => p.name.toLowerCase() === lower),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, preview, roster, clubId, namesDoubles, namesSingles, doubles]);

  const applySuggestion = (name: string) => {
    if (!editing || !preview) return;
    const zone = courtZones(preview).find((z) => sameZone(editing, { team: z.team, row: z.row }));
    const index = zone ? nameIndexOf(zone) : null;
    if (index === null || !zone) return;
    setNameAt(index, name);
    editNext(zone);
  };

  /**
   * Put the typed name on the club's roster, so a guest who keeps turning up
   * stops being retyped every match. The slot already holds the name — this
   * only adds it to the club and moves on.
   */
  const addTypedToClub = async () => {
    if (!clubId || !picker.canAdd || adding) return;
    const name = picker.typed;
    setAdding(true);
    try {
      await addGuestPlayer(clubId, name);
      setRoster(await listPlayers(clubId));
      toast(`${name} added to the club`, "success");
      const zone = preview
        ? courtZones(preview).find((z) => sameZone(editing, { team: z.team, row: z.row }))
        : undefined;
      if (zone) editNext(zone);
    } catch (e) {
      toast((e as Error).message || "Could not add the player", "error");
    } finally {
      setAdding(false);
    }
  };

  const panelNode = (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {picker.canAdd && (
        <Pressable
          style={[s.pickRow, adding && { opacity: 0.5 }]}
          onPress={addTypedToClub}
          disabled={adding}
        >
          <Icon name="account-plus" color={C.red} size={16} />
          <Text style={[s.pickText, s.pickAddText]} numberOfLines={1}>Add {picker.typed}</Text>
        </Pressable>
      )}
      {picker.players.map((p) => (
        <Pressable key={p.id} style={s.pickRow} onPress={() => applySuggestion(p.name)}>
          <Icon name="person-outline" color={C.text2} size={16} />
          <Text style={s.pickText} numberOfLines={1}>{p.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const edit: CourtEdit = {
    zoneEdit,
    onSwapSides: swapSides,
    onSwapTeam: swapTeam,
    showTeamSwap: doubles,
    panel:
      editing && (picker.players.length > 0 || picker.canAdd)
        ? {
            team: editing.team,
            row: editing.row,
            node: panelNode,
            // Half the court is the box the panel covers; never taller.
            maxHeight: courtHeight > 0 ? courtHeight * 0.5 : undefined,
          }
        : undefined,
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

  const { ctaPadding, bottom } = useScreenInsets();
  const { height: kbHeight } = useReanimatedKeyboardAnimation();
  // Measured, not guessed: the block below the court absorbs part of the IME.
  const belowContent = useSharedValue(0);
  // The Doubles/Singles row is the only thing we are willing to push off the
  // top — everything else on this screen has to stay reachable while typing.
  const topRow = useSharedValue(0);

  const shift = useDerivedValue(() =>
    keyboardShift({
      // useReanimatedKeyboardAnimation reports height as a negative offset.
      keyboardHeight: Math.abs(kbHeight.value),
      belowContentHeight: belowContent.value,
      bottomInset: bottom,
      maxShift: topRow.value,
    })
  );

  const rootAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: -shift.value }],
  }));

  return (
    <Animated.View style={[s.root, { paddingBottom: ctaPadding }, rootAnim]}>
      <View
        style={s.topRow}
        onLayout={(e) => { topRow.value = e.nativeEvent.layout.height; }}
      >
        <View style={[s.seg, s.segFill]}>
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

      <View style={s.courtWrap} onLayout={(e) => setCourtHeight(e.nativeEvent.layout.height)}>
        {preview && <Court state={preview} edit={edit} />}
      </View>

      <View
        style={s.belowCourt}
        onLayout={(e) => { belowContent.value = e.nativeEvent.layout.height; }}
      >
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
          <Text style={s.caption}>Games (best of)</Text>
          <View style={s.seg}>
            {([1, 3, 5] as const).map((bo) => (
              <Pressable key={bo} style={[s.segBtn, bestOf === bo && s.segOn]} onPress={() => setBestOf(bo)}>
                <Text style={[s.segText, bestOf === bo && s.segTextOn]}>{bo}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        </View>

        <Text style={s.hint} numberOfLines={1}>
          First to {Math.floor(bestOf / 2) + 1} {bestOf === 1 ? "game" : "games"} · best of {bestOf}
        </Text>

        <BusyButton busy={starting} disabled={!filled} style={[s.cta, !filled && { opacity: 0.5 }]} onPress={start}>
          <Text style={s.ctaText}>Start scoring</Text>
        </BusyButton>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // paddingBottom now comes from useScreenInsets at render time (audit H3):
  // the nav bar was clipping the bottom 32dp of the Start scoring CTA.
  root: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 12 },
  belowCourt: { gap: 12 },
  topRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  // No flex here: inside the column-laid-out format groups it would stretch the
  // pill row past the card background. The top row opts in with segFill.
  seg: { flexDirection: "row", backgroundColor: C.card, borderRadius: 12, padding: 4, gap: 4 },
  segFill: { flex: 1 },
  segBtn: { flex: 1, borderRadius: 9, minHeight: 40, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: C.red },
  segText: { color: C.text2, fontSize: 15, fontWeight: "600" },
  segTextOn: { color: C.text },
  courtWrap: { flex: 1, minHeight: 200 },
  formatRow: { flexDirection: "row", gap: 12 },
  formatGroup: { flex: 1, gap: 2 },
  caption: { color: C.text2, fontSize: 12, fontWeight: "700" },
  pickRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    minHeight: 44, paddingHorizontal: 12,
  },
  pickText: { color: C.text, fontSize: 14, fontWeight: "600", flexShrink: 1 },
  pickAddText: { color: C.red },
  hint: { color: C.text2, fontSize: 12 },
  cta: { backgroundColor: C.red, borderRadius: 14, minHeight: 56, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontSize: 18, fontWeight: "800" },
});
