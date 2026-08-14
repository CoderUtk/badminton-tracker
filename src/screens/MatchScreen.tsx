import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as ScreenOrientation from "expo-screen-orientation";
import { useKeepAwake } from "expo-keep-awake";
import { useFocusEffect, useRouter } from "expo-router";
import { gameScoreState, MatchState, pointSituation, serverName, TeamId } from "../engine";
import type { MatchRecord } from "../repos/matchRepo";
import { useMatchStore } from "../stores/matchStore";
import Court from "../components/Court";
import ElapsedChip from "../components/ElapsedChip";
import Icon, { type IconName } from "../components/Icon";
import PressableScale from "../components/PressableScale";
import MatchResultCard from "../components/share/MatchResultCard";
import { captureAndShare } from "../lib/share/captureAndShare";
import {
  DEFAULT_SCORING_MODE,
  lockForMode,
  RESTORE_ON_BLUR,
  type LockTarget,
  type OrientationMode,
} from "../lib/orientationLock";
import { C, F, glow, MIN_TOUCH, SCOREBOARD_TYPE, space, textGlow } from "../theme";

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

/** The single bridge from the pure contract to expo-screen-orientation. */
function applyLock(target: LockTarget): void {
  const p =
    target === "UNLOCK"
      ? ScreenOrientation.unlockAsync()
      : target === "LANDSCAPE"
      ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
      : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  // Rotation can legitimately fail (a foldable mid-fold, a policy-locked
  // device). Failing to rotate is survivable; crashing the scoring screen is
  // not.
  p.catch(() => {});
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
  const [orientationMode, setOrientationMode] = useState<OrientationMode>(DEFAULT_SCORING_MODE);
  const [orientationSheetOpen, setOrientationSheetOpen] = useState(false);

  // Local and non-persisted, deliberately. MatchEvent is reduced by the engine,
  // synced to Supabase and replayed by undo and autoFinish; a UI affordance must
  // not reach any of that (spec 4a). Pause means "stay on this screen", so it
  // does not need to survive unmount.
  const [pausedMs, setPausedMs] = useState(0);
  const [pausedSince, setPausedSince] = useState<number | null>(null);
  const paused = pausedSince !== null;

  const togglePause = useCallback(() => {
    const now = Date.now();
    if (pausedSince === null) {
      setPausedSince(now);
      return;
    }
    // Bank the span that just closed, then clear the open one. The functional
    // updater is used deliberately: it is pure and idempotent under React's
    // dev-mode double-invocation, and correct if several updates batch. Do NOT
    // rewrite this as setPausedMs(pausedMs + ...) — that closes over a stale
    // value and would be wrong under batching.
    setPausedMs((banked) => banked + (now - pausedSince));
    setPausedSince(null);
  }, [pausedSince]);

  // useFocusEffect, not useEffect: the cleanup has to run when this screen is
  // merely covered as well as when it unmounts, so the back gesture, a deep
  // link and a pause all restore identically (spec section 4).
  //
  // The cleanup is RESTORE_ON_BLUR and never unlockAsync(). That single line is
  // audit H6: unlocking hands orientation to the sensors, so leaving a match
  // sideways left every other screen — none of which has a landscape layout —
  // rendering in landscape.
  useFocusEffect(
    useCallback(() => {
      applyLock(lockForMode(orientationMode));
      return () => applyLock(RESTORE_ON_BLUR);
    }, [orientationMode])
  );

  const setOrientation = (mode: OrientationMode) => {
    setOrientationMode(mode);
    setOrientationSheetOpen(false);
    // No applyLock here: the focus effect re-runs on orientationMode and is the
    // only caller, so the lock has exactly one owner.
  };
  const orientationLabel = orientationMode === "auto" ? "Auto" : orientationMode === "portrait" ? "Portrait" : "Landscape";
  const ORIENTATION_OPTIONS: { mode: OrientationMode; icon: IconName; label: string }[] = [
    { mode: "auto", icon: "screen-rotation", label: "Auto" },
    { mode: "portrait", icon: "phone-portrait-outline", label: "Portrait" },
    { mode: "landscape", icon: "phone-landscape-outline", label: "Landscape" },
  ];
  const orientationIcon = ORIENTATION_OPTIONS.find((o) => o.mode === orientationMode)!.icon;

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

  const shareCardRef = useRef<View>(null);
  const lockedUntil = useRef(0);

  const score = useCallback((by: TeamId) => {
    // Enforcement lives here, not in the scrim. A screen reader activates a
    // node directly and never hit-tests, and Fabric does not honour
    // no-hide-descendants on the wrapper, so neither the overlay nor the
    // accessibility tree can be trusted to block a point.
    if (paused) return;
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
  }, [paused]);

  if (!state) return <View style={s.root} />;

  const teamName = (t: TeamId) => state.config.teams[t].map((p) => p.name).join(" / ");
  // Elapsed is derived from the match's start timestamp, not from a counter, so
  // it survives leaving and resuming without resetting to 0. The tick itself
  // lives in ElapsedChip — see the note there about audit A7.
  const startedAt = events[0]?.type === "MATCH_STARTED" ? events[0].at : record.created_at;

  const banner =
    state.phase === "match_over"
      ? `${teamName(state.winner!)} win the match`
      : state.phase === "game_over"
      ? `Game to ${teamName(state.gameHistory.at(-1)!.winner)} — tap to start game ${state.game + 1}`
      : null;

  const playing = !banner && !paused;

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
          disabled={paused}
          onPress={() => {
            if (state.phase === "game_over") dispatch({ type: "GAME_STARTED", at: Date.now() });
            else router.back();
          }}
        >
          <Text style={s.bannerText}>{banner}</Text>
          {state.phase === "match_over" && (
            <>
              <Text style={s.bannerSub}>Tap to close</Text>
              <PressableScale
                style={s.shareButton}
                onPress={(e) => { e.stopPropagation(); void captureAndShare(shareCardRef); }}
              >
                <Icon name="share-social-outline" size={20} color={C.text} />
                <Text style={s.shareButtonText}>Share to Story</Text>
              </PressableScale>
            </>
          )}
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
      <PressableScale style={[s.iconBtn, (paused || events.length < 2) && s.iconDisabled]} disabled={paused || events.length < 2} onPress={undo} accessibilityLabel="Undo last rally">
        <Icon name="arrow-undo" color={C.text} size={18} />
      </PressableScale>
      <PressableScale style={[s.iconBtn, (paused || redoStack.length === 0) && s.iconDisabled]} disabled={paused || redoStack.length === 0} onPress={redo} accessibilityLabel="Redo rally">
        <Icon name="arrow-redo" color={C.text} size={18} />
      </PressableScale>
      <View>
        <PressableScale
          style={[s.iconBtn, paused && s.iconDisabled]}
          disabled={paused}
          onPress={() => setOrientationSheetOpen((v) => !v)}
          accessibilityLabel={`Screen orientation: ${orientationLabel}. Tap to change.`}
        >
          <Icon name={orientationIcon} color={C.text} size={18} />
        </PressableScale>
        {orientationSheetOpen && (
          <View style={s.orientDropdown}>
            {ORIENTATION_OPTIONS.map((opt) => (
              <Pressable
                key={opt.mode}
                style={[s.orientOption, orientationMode === opt.mode && s.orientOptionOn]}
                onPress={() => setOrientation(opt.mode)}
                accessibilityLabel={opt.label}
              >
                <Icon name={opt.icon} color={orientationMode === opt.mode ? C.red : C.text} size={19} />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
  const rightGroup = (
    <View style={s.group}>
      <PressableScale
        style={[s.iconBtn, paused && s.iconBtnOn]}
        onPress={togglePause}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={paused ? "Resume match" : "Pause match"}
        accessibilityState={{ selected: paused }}
      >
        <Icon name={paused ? "play" : "pause"} color={C.text} size={20} />
      </PressableScale>
      <PressableScale
        style={[s.iconBtn, paused && s.iconDisabled]}
        disabled={paused}
        onPress={() => router.back()}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Leave match — it stays live and can be resumed from Matches"
      >
        <Icon name="chevron-back" color={C.text} size={20} />
      </PressableScale>
      <PressableScale
        style={[s.endBtn, paused && s.iconDisabled]}
        disabled={paused}
        onPress={confirmEnd}
        accessibilityLabel="End match"
      >
        <Icon name="flag" color={C.text} size={15} />
        <Text style={s.endText}>End</Text>
      </PressableScale>
    </View>
  );
  const scoreState = playing ? gameScoreState(state) : null;
  const statePillText =
    !scoreState || scoreState === "NORMAL" || scoreState === "GAME_OVER"
      ? null
      : scoreState === "ADVANTAGE"
      ? `ADVANTAGE — ${teamName(state.score.A > state.score.B ? "A" : "B")}`
      : scoreState === "SUDDEN_DEATH"
      ? "SUDDEN DEATH"
      : "DEUCE";

  const scoreBlock = (
    <View style={s.scoreWrap}>
      <ElapsedChip startedAt={startedAt} pausedMs={pausedMs} pausedSince={pausedSince} />
      <View style={s.scoreRibbon}>
        <View style={[s.ribbonTeam, s.ribbonTeamA]}>
          <View style={s.serveSlot}>{state.servingTeam === "A" && <View style={[s.serveDot, { backgroundColor: C.red }]} />}</View>
          <Text style={[s.ribbonName, { color: C.red }]} numberOfLines={1}>{teamName("A")}</Text>
        </View>
        <Text style={[s.ribbonScore, { color: C.red }, textGlow(C.red, 16)]} maxFontSizeMultiplier={1.2}>{state.score.A}</Text>
        <Text style={s.scoreDivider}>—</Text>
        <Text style={[s.ribbonScore, { color: C.blue }, textGlow(C.blue, 16)]} maxFontSizeMultiplier={1.2}>{state.score.B}</Text>
        <View style={[s.ribbonTeam, s.ribbonTeamB]}>
          <Text style={[s.ribbonName, { color: C.blue }]} numberOfLines={1}>{teamName("B")}</Text>
          <View style={s.serveSlot}>{state.servingTeam === "B" && <View style={[s.serveDot, { backgroundColor: C.blue }]} />}</View>
        </View>
      </View>
      {statePillText && (
        <View style={s.statePill}>
          <Text style={s.statePillText}>{statePillText}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={s.root}>
      <View
        style={s.fill}
        // The scrim blocks touches, but a screen reader activates a node
        // directly and never hit-tests, so without this a TalkBack user could
        // still End or Leave a match that is supposed to be paused.
        importantForAccessibility={paused ? "no-hide-descendants" : "auto"}
        accessibilityElementsHidden={paused}
      >
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

      {paused && (
        <Pressable
          style={s.pausedScrim}
          onPress={togglePause}
          accessibilityRole="button"
          accessibilityLabel="Match paused. Tap to resume."
          accessibilityViewIsModal
        >
          <View style={s.pausedCard}>
            <Icon name="pause" color={C.text} size={28} />
            <Text style={s.pausedTitle}>Paused</Text>
            <Text style={s.pausedHint}>The clock is stopped. Tap anywhere to resume.</Text>
          </View>
        </Pressable>
      )}

      {state.phase === "match_over" && (
        <View ref={shareCardRef} collapsable={false} style={s.offscreenCard}>
          <MatchResultCard record={record} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 8, gap: 6 },
  fill: { flex: 1, gap: 6 },
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
  iconBtnOn: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.lineHi },
  // absoluteFillObject rather than a sized box: the scrim has to cover the +1
  // rails in both the portrait and landscape layouts.
  pausedScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center", justifyContent: "center",
    zIndex: 30,
  },
  pausedCard: {
    alignItems: "center", gap: space.sm,
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.lineHi,
    paddingHorizontal: space.xl, paddingVertical: space.lg,
    minHeight: MIN_TOUCH,
  },
  pausedTitle: { color: C.text, fontFamily: F.display, fontSize: 22, letterSpacing: 0.5 },
  pausedHint: { color: C.text2, fontFamily: F.body, fontSize: 14, textAlign: "center" },
  orientDropdown: {
    position: "absolute", top: 46, left: 0, zIndex: 20,
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 5, gap: 4,
  },
  orientOption: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  orientOptionOn: { backgroundColor: C.cardHi },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  endBtn: {
    flexDirection: "row", gap: 6, backgroundColor: C.red, borderRadius: 10, height: 40, paddingHorizontal: 14,
    alignItems: "center", justifyContent: "center",
  },
  endText: { color: C.text, fontSize: 15, fontFamily: F.bold },
  scoreWrap: { alignSelf: "center", alignItems: "center", gap: 3, width: "100%", maxWidth: 520 },
  scoreRibbon: {
    alignSelf: "stretch", minHeight: 72, flexDirection: "row", alignItems: "center",
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.lineHi,
    overflow: "hidden",
  },
  ribbonTeam: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12 },
  ribbonTeamA: { borderLeftWidth: 4, borderLeftColor: C.red },
  ribbonTeamB: { justifyContent: "flex-end", borderRightWidth: 4, borderRightColor: C.blue },
  ribbonName: { flexShrink: 1, fontSize: SCOREBOARD_TYPE.name, fontFamily: F.semibold, letterSpacing: 0.3 },
  // Fixed-width slot so the serve dot appearing/disappearing never reflows names.
  serveSlot: { width: 8, alignItems: "center", flexShrink: 0 },
  serveDot: { width: 8, height: 8, borderRadius: 4 },
  // Russo One's zero closes at 56pt, making 1 - 0 read as numeral beside filled
  // block (audit M8). Measured on device: only the font fixed this, not glow.
  // Glow stays. Score digits alone move to bold; F.display in rail labels.
  ribbonScore: {
    minWidth: 72, color: C.text, fontSize: SCOREBOARD_TYPE.score, fontFamily: F.bold,
    textAlign: "center", fontVariant: ["tabular-nums"],
  },
  scoreDivider: { color: C.text3, fontSize: SCOREBOARD_TYPE.divider, marginHorizontal: 2 },
  statePill: {
    alignSelf: "center", backgroundColor: C.card, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: C.red,
  },
  statePillText: { color: C.red, fontSize: 12, fontFamily: F.bold, letterSpacing: 0.6 },
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
  railText: { color: C.text, fontSize: SCOREBOARD_TYPE.rail, fontFamily: F.display, ...textGlow(C.text, 8) },
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
  shareButton: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16,
    backgroundColor: C.cardHi, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10,
  },
  shareButtonText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
  offscreenCard: { position: "absolute", top: -3000, left: 0 },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  metaText: { color: C.text2, fontSize: 12 },
  dots: { flexDirection: "row", gap: 3 },
  rallyDot: { width: 8, height: 8, borderRadius: 4 },
});
