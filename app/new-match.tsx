import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { defaultConfig, GAME_FORMATS, MatchConfig, replay } from "../src/engine";
import { createMatch } from "../src/repos/matchRepo";
import { Club, listRealClubs, listPlayers } from "../src/repos/clubRepo";
import Court from "../src/components/Court";
import Icon from "../src/components/Icon";
import FormScreen from "../src/components/FormScreen";
import PressableScale from "../src/components/PressableScale";
import BusyButton from "../src/components/BusyButton";
import { toast } from "../src/lib/toast";
import { useSession } from "../src/stores/session";
import { recordGuestMatch } from "../src/lib/guestMatches";
import { C } from "../src/theme";

export default function NewMatch() {
  const router = useRouter();
  const { session } = useSession();
  const params = useLocalSearchParams<{ clubId?: string; sessionId?: string; teamA?: string; teamB?: string }>();
  const [doubles, setDoubles] = useState(true);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [names, setNames] = useState(["", "", "", ""]);
  const [points, setPoints] = useState<11 | 15 | 21>(21);
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(3);
  const [firstServerIdx, setFirstServerIdx] = useState(0); // index into name fields
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    // Guests never save to a club — skip the fetch so a stale local clubs_cache
    // from a previous signed-in account on this device can't leak through.
    if (session?.user.is_anonymous) return;
    listRealClubs().then((cs) => {
      setClubs(cs);
      if (cs.length === 1) setClubId(cs[0].id);
    });
  }, [session]);

  useEffect(() => {
    if (params.clubId) setClubId(params.clubId);
    const fromSession = [...(params.teamA?.split(",") ?? []), ...(params.teamB?.split(",") ?? [])]
      .map((name) => name.trim())
      .filter(Boolean);
    if (fromSession.length) {
      setDoubles(fromSession.length > 2);
      setNames((previous) => previous.map((name, index) => fromSession[index] ?? name));
    }
  }, [params.clubId, params.teamA, params.teamB]);

  // Prefill empty name fields from the selected club's roster.
  useEffect(() => {
    if (!clubId) return;
    listPlayers(clubId).then((players) => {
      setNames((prev) =>
        prev.map((n, i) => (n.trim() ? n : players[i]?.name ?? ""))
      );
    });
  }, [clubId]);

  const needed = doubles ? 4 : 2;
  const filled = names.slice(0, needed).every((n) => n.trim());

  const buildConfig = (): MatchConfig => {
    const n = names.map((x, i) => x.trim() || `Player ${i + 1}`);
    const teams = doubles
      ? { A: [{ id: "a0", name: n[0] }, { id: "a1", name: n[1] }], B: [{ id: "b0", name: n[2] }, { id: "b1", name: n[3] }] }
      : { A: [{ id: "a0", name: n[0] }], B: [{ id: "b0", name: n[1] }] };
    const serverTeam = firstServerIdx < needed / 2 ? "A" : "B";
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

  // Live preview of the starting arrangement (score 0–0), so players can see
  // where they'll stand and adjust before the match begins.
  const preview = useMemo(() => {
    try {
      return replay([{ type: "MATCH_STARTED", config: buildConfig(), at: 0 }]);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, doubles, points, bestOf, firstServerIdx]);

  /** Swap left/right halves (team A ↔ team B). */
  const swapSides = () => {
    if (doubles) {
      setNames((p) => [p[2], p[3], p[0], p[1]]);
      setFirstServerIdx((i) => (i + 2) % 4);
    } else {
      setNames((p) => [p[1], p[0], p[2], p[3]]);
      setFirstServerIdx((i) => (i === 0 ? 1 : 0));
    }
  };

  /**
   * Swap the two players within a team (top ↔ bottom court). We swap the name
   * slots but keep firstServerIdx pointing at the same slot: for the serving
   * team the right-court player is the first server, so this correctly moves
   * the other player into the right court (and into the serving role).
   */
  const swapTeam = (team: "A" | "B") => {
    const [x, y] = team === "A" ? [0, 1] : [2, 3];
    setNames((p) => p.map((n, i) => (i === x ? p[y] : i === y ? p[x] : n)));
  };

  const start = async () => {
    setStarting(true);
    try {
      const config = buildConfig();
      const side = (t: "A" | "B") => config.teams[t].map((p) => ({ club_player_id: null, name: p.name }));
      const id = await createMatch(config, side("A"), side("B"), clubId, params.sessionId ?? null);
      if (session?.user.is_anonymous) await recordGuestMatch(id);
      router.replace(`/score/${id}`);
    } catch (e) {
      toast((e as Error).message || "Could not start the match", "error");
      setStarting(false);
    }
  };

  const label = (i: number) =>
    doubles ? ["Team A — player 1", "Team A — player 2", "Team B — player 1", "Team B — player 2"][i]
            : ["Player A", "Player B"][i];

  return (
    <FormScreen contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={s.seg}>
        {[true, false].map((d) => (
          <PressableScale
            key={String(d)}
            style={[s.segBtn, doubles === d && s.segOn]}
            onPress={() => { setDoubles(d); setFirstServerIdx(0); }}
            scaleTo={0.96}
          >
            <Text style={[s.segText, doubles === d && s.segTextOn]}>{d ? "Doubles" : "Singles"}</Text>
          </PressableScale>
        ))}
      </View>

      {Array.from({ length: needed }, (_, i) => (
        <TextInput
          key={i}
          style={s.input}
          placeholder={label(i)}
          placeholderTextColor={C.text2}
          value={names[i]}
          onChangeText={(t) => setNames((p) => p.map((x, j) => (j === i ? t : x)))}
        />
      ))}

      {/* Live court preview + position swaps */}
      <Text style={s.h}>Starting positions</Text>
      <View style={s.previewWrap}>
        {preview && <Court state={preview} />}
      </View>
      <View style={s.swapRow}>
        {doubles && (
          <PressableScale style={s.swapBtn} onPress={() => swapTeam("A")} scaleTo={0.95}>
            <Icon name="swap-vertical" color={C.text} size={16} />
            <Text style={s.swapText}>Team A</Text>
          </PressableScale>
        )}
        <PressableScale style={[s.swapBtn, s.swapSides]} onPress={swapSides} scaleTo={0.95}>
          <Icon name="swap-horizontal" color={C.text} size={16} />
          <Text style={s.swapText}>Swap sides</Text>
        </PressableScale>
        {doubles && (
          <PressableScale style={s.swapBtn} onPress={() => swapTeam("B")} scaleTo={0.95}>
            <Icon name="swap-vertical" color={C.text} size={16} />
            <Text style={s.swapText}>Team B</Text>
          </PressableScale>
        )}
      </View>

      <Text style={s.h}>Points per game</Text>
      <View style={s.seg}>
        {([11, 15, 21] as const).map((p) => (
          <Pressable key={p} style={[s.segBtn, points === p && s.segOn]} onPress={() => setPoints(p)}>
            <Text style={[s.segText, points === p && s.segTextOn]}>{p}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.h}>Games to win</Text>
      <View style={s.seg}>
        {([[1, 1], [2, 3], [3, 5]] as const).map(([win, bo]) => (
          <Pressable key={bo} style={[s.segBtn, bestOf === bo && s.segOn]} onPress={() => setBestOf(bo)}>
            <Text style={[s.segText, bestOf === bo && s.segTextOn]}>{win}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.hint}>First to {Math.floor(bestOf / 2) + 1} {bestOf === 1 ? "game" : "games"} · best of {bestOf}</Text>

      <Text style={s.h}>First serve</Text>
      <Text style={s.hint}>Service always starts from the right court.</Text>
      <View style={s.clubRow}>
        {/* Doubles: only the right-court player of each team (slots 0 and 2)
            can serve first — the laws of badminton require the first serve
            of a game to come from the right service court. Use "Swap
            Team A/B" above to change who stands on the right before picking.
            Singles has no left/right player distinction, so both slots stay. */}
        {(doubles ? [0, 2] : Array.from({ length: needed }, (_, i) => i)).map((i) => (
          <Pressable
            key={i}
            style={[s.chip, firstServerIdx === i && s.chipOn]}
            onPress={() => setFirstServerIdx(i)}
          >
            <Text style={s.chipText}>
              {names[i].trim() || label(i)}
            </Text>
          </Pressable>
        ))}
      </View>

      {clubs.length > 0 && (
        <>
          <Text style={s.h}>Save to club (optional)</Text>
          <View style={s.clubRow}>
            <Pressable style={[s.chip, clubId === null && s.chipOn]} onPress={() => setClubId(null)}>
              <Text style={s.chipText}>None</Text>
            </Pressable>
            {clubs.map((c) => (
              <Pressable key={c.id} style={[s.chip, clubId === c.id && s.chipOn]} onPress={() => setClubId(c.id)}>
                <Text style={s.chipText}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <BusyButton busy={starting} disabled={!filled} style={[s.cta, !filled && { opacity: 0.5 }]} onPress={start}>
        <Text style={s.ctaText}>Start scoring</Text>
      </BusyButton>
    </FormScreen>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  seg: { flexDirection: "row", backgroundColor: C.card, borderRadius: 12, padding: 4, gap: 4 },
  segBtn: { flex: 1, borderRadius: 9, minHeight: 44, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: C.red },
  segText: { color: C.text2, fontSize: 16, fontWeight: "600" },
  segTextOn: { color: C.text },
  input: {
    backgroundColor: C.card, color: C.text, borderRadius: 12, borderWidth: 1,
    borderColor: C.line, padding: 14, fontSize: 16,
  },
  h: { color: C.text, fontSize: 16, fontWeight: "700" },
  hint: { color: C.text2, fontSize: 13, marginTop: -4 },
  previewWrap: { height: 150 },
  swapRow: { flexDirection: "row", gap: 8 },
  swapBtn: {
    flex: 1, flexDirection: "row", gap: 5, backgroundColor: C.card, borderRadius: 10, minHeight: 44,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line,
  },
  swapSides: { backgroundColor: C.cardHi },
  swapText: { color: C.text, fontSize: 14, fontWeight: "700" },
  clubRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  chipOn: { backgroundColor: C.red },
  chipText: { color: C.text, fontSize: 14, fontWeight: "600" },
  cta: { backgroundColor: C.red, borderRadius: 14, minHeight: 56, alignItems: "center", justifyContent: "center", marginTop: 8 },
  ctaText: { color: C.text, fontSize: 18, fontWeight: "800" },
});
