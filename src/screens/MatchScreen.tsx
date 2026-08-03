import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as ScreenOrientation from "expo-screen-orientation";
import { useKeepAwake } from "expo-keep-awake";
import { useRouter } from "expo-router";
import { MatchState, pointSituation, serverName, TeamId } from "../engine";
import type { MatchRecord } from "../repos/matchRepo";
import { useMatchStore } from "../stores/matchStore";
import Court from "../components/Court";
import Icon from "../components/Icon";
import PressableScale from "../components/PressableScale";
import { C, F, glow, textGlow } from "../theme";

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
  const { width, height } = useWindowDimensions();
  const portrait = height >= width;
  useEffect(() => {
    // Allow the player to score in either orientation; landscape gives the court
    // the most room, portrait puts big +1 buttons under the court.
    ScreenOrientation.unlockAsync().catch(() => {});
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
  // Tick wall-clock; elapsed is derived from the match's start timestamp so it
  // survives pausing/leaving and resuming (no reset to 0).
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
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
  const startedAt = events[0]?.type === "MATCH_STARTED" ? events[0].at : record.created_at;
  const seconds = Math.max(0, Math.floor((nowTs - startedAt) / 1000));
  const fmt = (n: number) => String(n).padStart(2, "0");
  const timer = `${fmt(Math.floor(seconds / 3600))}:${fmt(Math.floor(seconds / 60) % 60)}:${fmt(seconds % 60)}`;

  const banner =
    state.phase === "match_over"
      ? `${teamName(state.winner!)} win the match`
      : state.phase === "game_over"
      ? `Game to ${teamName(state.gameHistory.at(-1)!.winner)} — tap to start game ${state.game + 1}`
      : null;

  const playing = !banner;

  const centerBlock = (
    <View style={s.center}>
      {playing && (
        <View style={[s.bubble, { backgroundColor: state.servingTeam === "A" ? C.red : C.blue }]} pointerEvents="none">
          <Text style={s.bubbleText}>{announcement(state)}</Text>
        </View>
      )}
      {banner ? (
        <Pressable
          style={s.banner}
          onPress={() => {
            if (state.phase === "game_over") dispatch({ type: "GAME_STARTED", at: Date.now() });
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
  );

  const railA = (
    <PressableScale
      style={[portrait ? s.railWide : s.rail, { borderColor: C.red }, playing && glow(C.red, 16, 0.4), !playing && s.railDisabled]}
      disabled={!playing}
      scaleTo={0.97}
      onPress={() => score("A")}
      accessibilityLabel={`Point to ${teamName("A")}`}
    >
      {portrait && <Text style={[s.railTeam, { color: C.red }]} numberOfLines={1}>{teamName("A")}</Text>}
      <Text style={s.railText}>+1</Text>
    </PressableScale>
  );
  const railB = (
    <PressableScale
      style={[portrait ? s.railWide : s.rail, { borderColor: C.blue }, playing && glow(C.blue, 16, 0.4), !playing && s.railDisabled]}
      disabled={!playing}
      scaleTo={0.97}
      onPress={() => score("B")}
      accessibilityLabel={`Point to ${teamName("B")}`}
    >
      {portrait && <Text style={[s.railTeam, { color: C.blue }]} numberOfLines={1}>{teamName("B")}</Text>}
      <Text style={s.railText}>+1</Text>
    </PressableScale>
  );

  const leftGroup = (
    <View style={s.group}>
      <PressableScale style={[s.iconBtn, events.length < 2 && s.iconDisabled]} onPress={undo} accessibilityLabel="Undo last rally">
        <Icon name="arrow-undo" color={C.text} size={18} />
      </PressableScale>
      <PressableScale style={[s.iconBtn, redoStack.length === 0 && s.iconDisabled]} onPress={redo} accessibilityLabel="Redo rally">
        <Icon name="arrow-redo" color={C.text} size={18} />
      </PressableScale>
    </View>
  );
  const rightGroup = (
    <View style={s.group}>
      <PressableScale style={s.iconBtn} onPress={() => router.back()} hitSlop={10} accessibilityLabel="Pause and leave (match stays live)">
        <Icon name="pause" color={C.text} size={20} />
      </PressableScale>
      <PressableScale style={s.endBtn} onPress={confirmEnd} accessibilityLabel="End match">
        <Icon name="flag" color={C.text} size={15} />
        <Text style={s.endText}>End</Text>
      </PressableScale>
    </View>
  );
  const scoreBlock = (
    <View style={s.scoreWrap}>
      <View style={s.timerChip}>
        <Icon name="time-outline" color={C.text2} size={12} />
        <Text style={s.timerText}>{timer}</Text>
      </View>
      <View style={s.scoreRibbon}>
        <View style={[s.ribbonTeam, s.ribbonTeamA]}>
          <View style={s.serveSlot}>{state.servingTeam === "A" && <View style={[s.serveDot, { backgroundColor: C.red }]} />}</View>
          <Text style={[s.ribbonName, { color: C.red }]} numberOfLines={1}>{teamName("A")}</Text>
        </View>
        <Text style={[s.ribbonScore, { color: C.red }, textGlow(C.red, 16)]}>{state.score.A}</Text>
        <Text style={s.scoreDivider}>—</Text>
        <Text style={[s.ribbonScore, { color: C.blue }, textGlow(C.blue, 16)]}>{state.score.B}</Text>
        <View style={[s.ribbonTeam, s.ribbonTeamB]}>
          <Text style={[s.ribbonName, { color: C.blue }]} numberOfLines={1}>{teamName("B")}</Text>
          <View style={s.serveSlot}>{state.servingTeam === "B" && <View style={[s.serveDot, { backgroundColor: C.blue }]} />}</View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      {/* Landscape: controls flank the centered score in one full-width row (no
          empty top corners). Portrait: controls row above the score. */}
      {portrait ? (
        <View style={s.top}>
          <View style={s.controls}>{leftGroup}{rightGroup}</View>
          {scoreBlock}
        </View>
      ) : (
        <View style={s.topRow}>
          {leftGroup}
          <View style={s.scoreFill}>{scoreBlock}</View>
          {rightGroup}
        </View>
      )}

      {/* body: side rails (landscape) or court over a +1 row (portrait) */}
      <View style={[s.body, portrait && s.bodyPortrait]}>
        {portrait ? (
          <>
            {centerBlock}
            <View style={s.railsRow}>{railA}{railB}</View>
          </>
        ) : (
          <>
            {railA}
            {centerBlock}
            {railB}
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 8, gap: 6 },
  top: { gap: 6 },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  scoreFill: { flex: 1, alignItems: "center" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  group: { flexDirection: "row", gap: 8 },
  iconBtn: {
    backgroundColor: C.card, borderRadius: 10, width: 46, height: 40,
    alignItems: "center", justifyContent: "center",
  },
  iconDisabled: { opacity: 0.35 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  endBtn: {
    flexDirection: "row", gap: 6, backgroundColor: C.red, borderRadius: 10, height: 40, paddingHorizontal: 14,
    alignItems: "center", justifyContent: "center",
  },
  endText: { color: C.text, fontSize: 15, fontFamily: F.bold },
  scoreWrap: { alignSelf: "center", alignItems: "center", gap: 3, width: "100%", maxWidth: 520 },
  timerChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2,
    borderWidth: 1, borderColor: C.line,
  },
  timerText: { color: C.text2, fontSize: 12, fontFamily: F.body, fontVariant: ["tabular-nums"] },
  scoreRibbon: {
    alignSelf: "stretch", minHeight: 46, flexDirection: "row", alignItems: "center",
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.lineHi,
    overflow: "hidden",
  },
  ribbonTeam: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12 },
  ribbonTeamA: { borderLeftWidth: 4, borderLeftColor: C.red },
  ribbonTeamB: { justifyContent: "flex-end", borderRightWidth: 4, borderRightColor: C.blue },
  ribbonName: { flexShrink: 1, fontSize: 15, fontFamily: F.semibold, letterSpacing: 0.3 },
  // Fixed-width slot so the serve dot appearing/disappearing never reflows names.
  serveSlot: { width: 8, alignItems: "center", flexShrink: 0 },
  serveDot: { width: 8, height: 8, borderRadius: 4 },
  ribbonScore: { minWidth: 42, color: C.text, fontSize: 32, fontFamily: F.display, textAlign: "center", fontVariant: ["tabular-nums"] },
  scoreDivider: { color: C.text3, fontSize: 20, marginHorizontal: 2 },
  body: { flex: 1, flexDirection: "row", gap: 8 },
  bodyPortrait: { flexDirection: "column" },
  rail: {
    width: 78, backgroundColor: C.card, borderRadius: 14, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  railsRow: { flexDirection: "row", gap: 8, height: 96 },
  railWide: {
    flex: 1, backgroundColor: C.card, borderRadius: 12, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", gap: 2,
  },
  railTeam: { fontSize: 14, fontFamily: F.semibold },
  railDisabled: { opacity: 0.3 },
  railText: { color: C.text, fontSize: 26, fontFamily: F.display, ...textGlow(C.text, 8) },
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
