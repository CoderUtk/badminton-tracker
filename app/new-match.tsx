import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { keyboardShift } from "../src/lib/keyboardShift";
import { useScreenInsets } from "../src/hooks/useScreenInsets";
import { useLocalSearchParams, useRouter } from "expo-router";
import { defaultConfig, GAME_FORMATS, MatchConfig, replay } from "../src/engine";
import { createMatch, logMatch } from "../src/repos/matchRepo";
import { parseGames } from "../src/lib/scoreEntry";
import SegmentedControl from "../src/components/SegmentedControl";
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
import { C, F, MIN_TOUCH } from "../src/theme";

type ZoneKey = { team: "A" | "B"; row: CourtRow };
const sameZone = (a: ZoneKey | null, b: ZoneKey) => !!a && a.team === b.team && a.row === b.row;

const DOUBLES_LABELS = ["Player 1", "Player 2", "Player 3", "Player 4"];
const SINGLES_LABELS = ["Player A", "Player B"];

/** "Score live" runs the rally scorer; "Log result" just files the final games. */
type Mode = "live" | "log";
const MAX_LOGGED_GAMES = 5;

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
  const [mode, setMode] = useState<Mode>("live");
  const [gameRows, setGameRows] = useState<{ A: string; B: string }[]>([{ A: "", B: "" }]);
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
      setMode(init.mode ?? "live");
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

  const buildConfig = (bestOfOverride?: 1 | 3 | 5): MatchConfig => {
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
      bestOf: bestOfOverride ?? bestOf,
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
        <Pressable accessibilityRole="button"
          style={[s.pickRow, adding && { opacity: 0.5 }]}
          onPress={addTypedToClub}
          disabled={adding}
        >
          <Icon name="account-plus" color={C.red} size={16} />
          <Text style={[s.pickText, s.pickAddText]} numberOfLines={1}>Add {picker.typed}</Text>
        </Pressable>
      )}
      {picker.players.map((p) => (
        <Pressable accessibilityRole="button" key={p.id} style={s.pickRow} onPress={() => applySuggestion(p.name)}>
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

  // Parsed once: it is both the save payload and the "can save" test.
  const loggedGames = useMemo(() => parseGames(gameRows), [gameRows]);

  const setGameScore = (index: number, team: "A" | "B", text: string) =>
    setGameRows((prev) => prev.map((g, i) => (i === index ? { ...g, [team]: text } : g)));

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/(app)/matches"));

  const saveResult = async () => {
    if (!loggedGames) return;
    setStarting(true);
    try {
      // The stored format follows what was actually played, so a logged
      // one-game result isn't recorded as an abandoned best-of-three.
      const config = buildConfig(loggedGames.length <= 1 ? 1 : loggedGames.length <= 3 ? 3 : 5);
      const side = (t: "A" | "B") => config.teams[t].map((p) => ({ club_player_id: null, name: p.name }));
      const id = await logMatch(config, side("A"), side("B"), clubId, params.sessionId ?? null, loggedGames);
      await saveLastLineup({ doubles, namesDoubles, namesSingles, points, bestOf, clubId, mode });
      if (isGuest && Platform.OS !== "web") await recordGuestMatch(id);
      toast("Result saved", "success");
      leave();
    } catch (e) {
      toast((e as Error).message || "Could not save the result", "error");
      setStarting(false);
    }
  };

  const start = async () => {
    setStarting(true);
    try {
      const config = buildConfig();
      const side = (t: "A" | "B") => config.teams[t].map((p) => ({ club_player_id: null, name: p.name }));
      const id = await createMatch(config, side("A"), side("B"), clubId, params.sessionId ?? null);
      await saveLastLineup({ doubles, namesDoubles, namesSingles, points, bestOf, clubId, mode });
      // Web guest history reads straight from guest_matches (RLS-scoped); the
      // localStorage id list is native-only.
      if (isGuest && Platform.OS !== "web") await recordGuestMatch(id);
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
        <View style={s.segFill}>
          <SegmentedControl
            options={[{ label: "Doubles", value: "doubles" }, { label: "Singles", value: "singles" }]}
            value={doubles ? "doubles" : "singles"}
            onChange={(v) => toggleFormat(v === "doubles")}
            role="radio"
          />
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
        <SegmentedControl
          options={[
            { label: "Score live", value: "live" as Mode },
            { label: "Log result", value: "log" as Mode },
          ]}
          value={mode}
          onChange={setMode}
          role="radio"
        />

        {mode === "log" ? (
          <>
            {gameRows.map((g, i) => (
              <View key={i} style={s.gameRow}>
                <Text style={s.gameLabel}>Game {i + 1}</Text>
                <TextInput
                  style={s.gameInput}
                  value={g.A}
                  onChangeText={(t) => setGameScore(i, "A", t)}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="0"
                  placeholderTextColor={C.text2}
                  accessibilityLabel={`Game ${i + 1}, team A score`}
                />
                <Text style={s.gameDash}>–</Text>
                <TextInput
                  style={s.gameInput}
                  value={g.B}
                  onChangeText={(t) => setGameScore(i, "B", t)}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="0"
                  placeholderTextColor={C.text2}
                  accessibilityLabel={`Game ${i + 1}, team B score`}
                />
                {gameRows.length > 1 && (
                  <Pressable accessibilityRole="button"
                    hitSlop={8}
                    accessibilityLabel={`Remove game ${i + 1}`}
                    onPress={() => setGameRows((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Icon name="trash-outline" color={C.text2} size={17} />
                  </Pressable>
                )}
              </View>
            ))}
            {gameRows.length < MAX_LOGGED_GAMES && (
              <Pressable accessibilityRole="button"
                style={s.addGame}
                onPress={() => setGameRows((prev) => [...prev, { A: "", B: "" }])}
              >
                <Icon name="add" color={C.text2} size={16} />
                <Text style={s.hint}>Add a game</Text>
              </Pressable>
            )}
          </>
        ) : (
        <View style={s.formatRow}>
        <View style={s.formatGroup}>
          <Text style={s.caption}>Points</Text>
          <SegmentedControl
            options={[{ label: "11", value: "11" }, { label: "15", value: "15" }, { label: "21", value: "21" }]}
            value={String(points)}
            onChange={(v) => setPoints(Number(v) as 11 | 15 | 21)}
            role="radio"
          />
        </View>
        <View style={s.formatGroup}>
          <Text style={s.caption}>Games (best of)</Text>
          <SegmentedControl
            options={[{ label: "1", value: "1" }, { label: "3", value: "3" }, { label: "5", value: "5" }]}
            value={String(bestOf)}
            onChange={(v) => setBestOf(Number(v) as 1 | 3 | 5)}
            role="radio"
          />
        </View>
        </View>
        )}

        {/* Says WHY the CTA below is dead. Both buttons are disabled until
            every player is named, and a greyed-out button with no explanation
            reads as a broken app — it was reported as exactly that. */}
        <Text style={s.hint} numberOfLines={1}>
          {!filled
            ? "Name every player to continue."
            : mode === "log"
              ? "Enter the final score of each game played."
              : `First to ${Math.floor(bestOf / 2) + 1} ${bestOf === 1 ? "game" : "games"} · best of ${bestOf}`}
        </Text>

        {mode === "log" ? (
          <BusyButton
            busy={starting}
            disabled={!filled || !loggedGames}
            style={[s.cta, (!filled || !loggedGames) && { opacity: 0.5 }]}
            accessibilityHint={
              !filled ? "Name every player first" : !loggedGames ? "Enter a score first" : undefined
            }
            onPress={saveResult}
          >
            <Text style={s.ctaText}>Save result</Text>
          </BusyButton>
        ) : (
          <BusyButton
            busy={starting}
            disabled={!filled}
            style={[s.cta, !filled && { opacity: 0.5 }]}
            accessibilityHint={!filled ? "Name every player first" : undefined}
            onPress={start}
          >
            <Text style={s.ctaText}>Start scoring</Text>
          </BusyButton>
        )}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // paddingBottom now comes from useScreenInsets at render time (audit H3):
  // the nav bar was clipping the bottom 32dp of the Start scoring CTA.
  root: { flex: 1, padding: 16, gap: 12 },
  belowCourt: { gap: 12 },
  topRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  // No flex here: inside the column-laid-out format groups it would stretch the
  // pill row past the card background. The top row opts in with segFill.
  segFill: { flex: 1 },
  courtWrap: { flex: 1, minHeight: 200 },
  formatRow: { flexDirection: "row", gap: 12 },
  gameRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  gameLabel: { color: C.text2, fontSize: 13, fontFamily: F.bold, width: 62 },
  gameInput: {
    flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.line, textAlign: "center",
    color: C.text, fontSize: 20, fontFamily: F.bold },
  gameDash: { color: C.text2, fontSize: 18, fontFamily: F.bold },
  addGame: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: MIN_TOUCH, paddingLeft: 2 },
  formatGroup: { flex: 1, gap: 2 },
  caption: { color: C.text2, fontSize: 12, fontFamily: F.bold },
  pickRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    minHeight: 44, paddingHorizontal: 12,
  },
  pickText: { color: C.text, fontSize: 14, fontFamily: F.semibold, flexShrink: 1 },
  pickAddText: { color: C.red },
  hint: { color: C.text2, fontSize: 12 },
  cta: { backgroundColor: C.red, borderRadius: 14, minHeight: 56, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontSize: 18, fontFamily: F.bold },
});
