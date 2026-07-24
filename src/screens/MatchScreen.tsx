import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as ScreenOrientation from "expo-screen-orientation";
import { useKeepAwake } from "expo-keep-awake";
import { useRouter } from "expo-router";
import { MatchState, pointSituation, serverName, TeamId } from "../engine";
import type { MatchRecord } from "../repos/matchRepo";
import { useMatchStore } from "../stores/matchStore";
import Court from "../components/Court";
import { C } from "../theme";

const DEBOUNCE_MS = 500;

/** Umpire-style call: server's score first, "all" on ties, situation appended. */
function announcement(state: MatchState): string {
  const server = serverName(state);
  const { A, B } = { A: state.score.A, B: state.score.B };
  const mine = state.servingTeam === "A" ? A : B;
  const theirs = state.servingTeam === "A" ? B : A;
  let call: string;
  if (A === 0 && B === 0) call = "Love all. Play.";
  else if (A === B) call = `${A} all.`;
  else call = `${mine}–${theirs}.`;
  const sit = pointSituation(state);
  const extra =
    state.phase === "interval" ? " Interval."
    : sit ? (sit.kind === "match" ? " Match point." : " Game point.")
    : "";
  return `${server} to serve. ${call}${extra}`;
}

export default function MatchScreen({
  matchId,
  record,
}: {
  matchId: string;
  record: MatchRecord;
}) {
  useKeepAwake();
  const router = useRouter();
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, []);

  const { state, events, redoStack, open, dispatch, undo, redo, endEarly, close } = useMatchStore();

  const confirmEnd = useCallback(() => {
    Alert.alert(
      "End match?",
      "Finish now and save the current score to history.",
      [
        { text: "Keep playing", style: "cancel" },
        { text: "End match", style: "destructive", onPress: async () => { await endEarly(); router.back(); } },
      ]
    );
  }, [endEarly, router]);
  useEffect(() => {
    open(matchId).then(() => {
      const st = useMatchStore.getState();
      if (st.events.length === 0) {
        st.dispatch({ type: "MATCH_STARTED", config: record.config, at: Date.now() });
      }
    });
    return close;
  }, [matchId, open, close, record.config]);

  const lockedUntil = useRef(0);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const score = useCallback((by: TeamId) => {
    const s = useMatchStore.getState().state;
    if (!s) return;
    const now = Date.now();
    if (now < lockedUntil.current) return;
    if (s.phase === "interval") {
      useMatchStore.getState().dispatch({ type: "INTERVAL_ENDED", at: now });
    } else if (s.phase !== "playing") return;
    lockedUntil.current = now + DEBOUNCE_MS;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    useMatchStore.getState().dispatch({ type: "RALLY_WON", by, at: now });
  }, []);

  if (!state) return <View style={s.root} />;

  const teamName = (t: TeamId) => state.config.teams[t].map((p) => p.name).join(" / ");
  const fmt = (n: number) => String(n).padStart(2, "0");
  const timer = `${fmt(Math.floor(seconds / 3600))}:${fmt(Math.floor(seconds / 60) % 60)}:${fmt(seconds % 60)}`;

  const banner =
    state.phase === "match_over"
      ? `${teamName(state.winner!)} win the match`
      : state.phase === "game_over"
      ? `Game to ${teamName(state.gameHistory.at(-1)!.winner)} — tap to start game ${state.game + 1}`
      : null;

  const playing = !banner;

  return (
    <View style={s.root}>
      {/* score ribbon: teams bookend the score, leaving the court as the main surface */}
      <View style={s.top}>
        <Pressable style={s.pauseBtn} onPress={() => router.back()} hitSlop={10} accessibilityLabel="Pause and leave (match stays live)">
          <Text style={s.iconText}>❙❙</Text>
        </Pressable>

        <View style={s.scoreWrap}>
          <View style={s.timerChip}>
            <Text style={s.timerText}>⏱ {timer}</Text>
          </View>
          <View style={s.scoreRibbon}>
            <View style={[s.ribbonTeam, s.ribbonTeamA]}>
              {state.servingTeam === "A" && <View style={s.serveDot} />}
              <Text style={[s.ribbonName, { color: C.red }]} numberOfLines={1}>{teamName("A")}</Text>
            </View>
            <Text style={[s.ribbonScore, { color: C.red }]}>{state.score.A}</Text>
            <Text style={s.scoreDivider}>—</Text>
            <Text style={[s.ribbonScore, { color: C.blue }]}>{state.score.B}</Text>
            <View style={[s.ribbonTeam, s.ribbonTeamB]}>
              <Text style={[s.ribbonName, { color: C.blue }]} numberOfLines={1}>{teamName("B")}</Text>
              {state.servingTeam === "B" && <View style={s.serveDot} />}
            </View>
          </View>
        </View>

        <View style={s.topRight}>
          <Pressable
            style={[s.iconBtn, events.length < 2 && s.iconDisabled]}
            onPress={undo}
            accessibilityLabel="Undo last rally"
          >
            <Text style={s.iconText}>↶</Text>
          </Pressable>
          <Pressable
            style={[s.iconBtn, redoStack.length === 0 && s.iconDisabled]}
            onPress={redo}
            accessibilityLabel="Redo rally"
          >
            <Text style={s.iconText}>↷</Text>
          </Pressable>
          <Pressable style={s.endBtn} onPress={confirmEnd} accessibilityLabel="End match">
            <Text style={s.endText}>End</Text>
          </Pressable>
        </View>
      </View>

      {/* body: +1 rail · court · +1 rail */}
      <View style={s.body}>
        <Pressable
          style={[s.rail, { borderColor: C.red }, !playing && s.railDisabled]}
          disabled={!playing}
          onPress={() => score("A")}
          accessibilityLabel={`Point to ${teamName("A")}`}
        >
          <Text style={s.railText}>+1</Text>
        </Pressable>

        <View style={s.center}>
          {playing && (
            <View style={s.bubble} pointerEvents="none">
              <Text style={s.bubbleText}>{announcement(state)}</Text>
            </View>
          )}
          {banner ? (
            <Pressable
              style={s.banner}
              onPress={() => {
                if (state.phase === "game_over")
                  dispatch({ type: "GAME_STARTED", at: Date.now() });
                else router.back();
              }}
            >
              <Text style={s.bannerText}>{banner}</Text>
              {state.phase === "match_over" && <Text style={s.bannerSub}>Tap to close</Text>}
            </Pressable>
          ) : (
            <Court state={state} />
          )}
          <View style={s.meta}>
            <Text style={s.metaText}>Game {state.game} of {state.config.bestOf}</Text>
            <View style={s.dots}>
              {state.rallies.slice(-24).map((t, i) => (
                <View key={i} style={[s.rallyDot, { backgroundColor: t === "A" ? C.red : C.blue }]} />
              ))}
            </View>
          </View>
        </View>

        <Pressable
          style={[s.rail, { borderColor: C.blue }, !playing && s.railDisabled]}
          disabled={!playing}
          onPress={() => score("B")}
          accessibilityLabel={`Point to ${teamName("B")}`}
        >
          <Text style={s.railText}>+1</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 8, gap: 6 },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    backgroundColor: C.card, borderRadius: 10, width: 46, height: 40,
    alignItems: "center", justifyContent: "center",
  },
  pauseBtn: {
    backgroundColor: C.card, borderRadius: 10, width: 46, height: 40,
    alignItems: "center", justifyContent: "center",
  },
  iconDisabled: { opacity: 0.35 },
  iconText: { color: C.text, fontSize: 18 },
  endBtn: {
    backgroundColor: C.red, borderRadius: 10, height: 40, paddingHorizontal: 14,
    alignItems: "center", justifyContent: "center",
  },
  endText: { color: C.text, fontSize: 15, fontWeight: "800" },
  topRight: { flexDirection: "row", gap: 8 },
  scoreWrap: { flex: 1, alignItems: "center", gap: 2 },
  timerChip: {
    backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 1,
    borderWidth: 1, borderColor: C.line,
  },
  timerText: { color: C.text2, fontSize: 12, fontVariant: ["tabular-nums"] },
  scoreRibbon: {
    alignSelf: "stretch", minHeight: 44, flexDirection: "row", alignItems: "center",
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line,
    overflow: "hidden",
  },
  ribbonTeam: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12 },
  ribbonTeamA: { borderLeftWidth: 4, borderLeftColor: C.red },
  ribbonTeamB: { justifyContent: "flex-end", borderRightWidth: 4, borderRightColor: C.blue },
  ribbonName: { flexShrink: 1, fontSize: 16, fontWeight: "800" },
  serveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green, flexShrink: 0 },
  ribbonScore: { minWidth: 36, color: C.text, fontSize: 30, fontWeight: "900", textAlign: "center", fontVariant: ["tabular-nums"] },
  scoreDivider: { color: C.text2, fontSize: 22, marginHorizontal: 2, fontWeight: "400" },
  body: { flex: 1, flexDirection: "row", gap: 8 },
  rail: {
    width: 64, backgroundColor: C.card, borderRadius: 12, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  railDisabled: { opacity: 0.3 },
  railText: { color: C.text, fontSize: 24, fontWeight: "800" },
  center: { flex: 1, gap: 4 },
  bubble: {
    position: "absolute", top: 8, alignSelf: "center", zIndex: 2,
    backgroundColor: C.red, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6,
  },
  bubbleText: { color: C.text, fontSize: 14, fontWeight: "700" },
  banner: {
    flex: 1, backgroundColor: C.card, borderRadius: 10,
    alignItems: "center", justifyContent: "center", gap: 6,
  },
  bannerText: { color: C.text, fontSize: 20, fontWeight: "700", textAlign: "center", padding: 12 },
  bannerSub: { color: C.text2, fontSize: 13 },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  metaText: { color: C.text2, fontSize: 12 },
  dots: { flexDirection: "row", gap: 3 },
  rallyDot: { width: 8, height: 8, borderRadius: 4 },
});
