import React, { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing, FadeInLeft, useAnimatedStyle, useReducedMotion, useSharedValue,
  withRepeat, withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import type { BracketMatch, Entrant } from "../tournament/types";
import { gamesWonBy } from "../tournament/score";
import {
  bracketCellLabel, elbowPath, isUpset, roundName, splitPairName, srcSlotLabel,
} from "../tournament/bracketLabel";
import CarvedCard from "./CarvedCard";
import Icon from "./Icon";
import { C, F, glow, radius, textGlow } from "../theme";

// Wide enough for a doubles pair on two lines beside a seed chip. At the old
// 150 a pair truncated to "Ana / B…" and the bracket read as a list of
// initials.
const CELL_W = 176;
const CELL_H = 88;
const GAP_Y = 20;
const COL_GAP = 44;
const SLOT = CELL_H + GAP_Y;
const HEADER_H = 30;
/** Per-round entrance offset. Columns arrive in the order play flows. */
const STAGGER_MS = 60;

/**
 * The live marker. A static dot said "this match exists"; a breathing one says
 * it is happening right now, which is the only thing on a bracket that changes
 * while you are looking at it.
 *
 * Opacity and scale only, so it stays on the compositor.
 */
function LiveDot({ reduced }: { reduced: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    p.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [reduced, p]);
  const pulse = useAnimatedStyle(() => ({
    opacity: 0.45 + p.value * 0.55,
    transform: [{ scale: 0.85 + p.value * 0.35 }],
  }));
  // Not the animated node with a frozen shared value: that would leave the dot
  // parked at the dim end of its own pulse for anyone who asked for less motion.
  if (reduced) return <View style={s.liveDot} />;
  return <Animated.View style={[s.liveDot, pulse]} />;
}

type Centers = Map<string, number>; // `${round}:${index}` -> centerY

export type BracketLiveScore = {
  status: string;
  scoreSummary: { games: { A: number; B: number }[]; current?: { A: number; B: number } } | null;
};

function computeCenters(bracket: BracketMatch[], maxRound: number): Centers {
  const centers: Centers = new Map();
  const r1 = bracket.filter((m) => m.round === 1).sort((a, b) => a.index - b.index);
  r1.forEach((m, i) => centers.set(`1:${m.index}`, SLOT * i + CELL_H / 2));
  for (let r = 2; r <= maxRound; r++) {
    const cells = bracket.filter((m) => m.round === r);
    for (const m of cells) {
      const a = centers.get(`${r - 1}:${m.index * 2}`);
      const b = centers.get(`${r - 1}:${m.index * 2 + 1}`);
      const y = a != null && b != null ? (a + b) / 2 : a ?? b ?? SLOT / 2;
      centers.set(`${r}:${m.index}`, y);
    }
  }
  return centers;
}

const colX = (round: number) => (round - 1) * (CELL_W + COL_GAP);

type CellProps = {
  cell: BracketMatch;
  nameA: string;
  nameB: string;
  seedA?: number;
  seedB?: number;
  top: number;
  left: number;
  maxRound: number;
  liveScore: BracketLiveScore | undefined;
  reduced: boolean;
  onPress?: (cell: BracketMatch) => void;
};

/**
 * The name half of a side: one line for singles, two for a doubles pair.
 *
 * Two lines rather than a joined-and-truncated string because "Ana / Bo" at
 * this width loses the second player entirely, and the second player is half
 * the team.
 */
function SideName({ name, won, champ }: { name: string; won: boolean; champ: boolean }) {
  const parts = splitPairName(name);
  const tone = [
    won ? s.sideNameWon : s.sideNameLost,
    won && champ ? s.sideNameChamp : null,
  ];
  if (parts.length === 1) {
    return <Text numberOfLines={1} style={[s.sideName, ...tone]}>{name}</Text>;
  }
  return (
    <View style={s.pairCol}>
      {parts.map((p, i) => (
        // Deliberately not s.sideName: its flex:1 is for claiming width in the
        // row. Inside this column that same flex makes both lines try to fill
        // the column's height, and they render on top of each other.
        <Text key={i} numberOfLines={1} style={[s.pairLine, ...tone]}>{p}</Text>
      ))}
    </View>
  );
}

/**
 * One bracket cell. Extracted and memoised because the whole bracket used to
 * be a single inline .map with no memo boundary anywhere: opening a sheet or
 * toggling `refreshing` re-rendered every cell, and the 15s poll did the same
 * on a timer whether or not anything had changed.
 *
 * Colour follows the rule in theme.ts: C.accent is the earned thing, C.red is
 * the thing happening now. So the champion glows cyan and a live match is red,
 * matching the live dot that has always sat in the corner of it. This is the
 * reverse of what the cell used to do.
 */
const BracketCell = React.memo(function BracketCell({
  cell, nameA, nameB, seedA, seedB, top, left, maxRound, liveScore, reduced, onPress,
}: CellProps) {
  const live = !!cell.matchId && !cell.winnerEntrant;
  const isChampCell = cell.round === maxRound && !!cell.winnerEntrant;
  const empty = !cell.entrantA && !cell.entrantB;
  const games = liveScore?.scoreSummary?.games ?? [];
  const current = liveScore?.scoreSummary?.current;

  const winnerSeed = cell.winnerEntrant === cell.entrantA ? seedA
    : cell.winnerEntrant === cell.entrantB ? seedB : undefined;
  const loserSeed = cell.winnerEntrant === cell.entrantA ? seedB
    : cell.winnerEntrant === cell.entrantB ? seedA : undefined;
  // Only a contested match can be an upset, so a bye (one entrant, winner
  // already set) is excluded by requiring both sides.
  const upset = !!cell.entrantA && !!cell.entrantB && isUpset(winnerSeed, loserSeed);

  const courtDesc = cell.court ? `, Court ${cell.court}` : "";
  const cellLabel = `Round ${cell.round}${courtDesc}, ${bracketCellLabel(cell, nameA, nameB)}`;

  return (
    <Animated.View
      style={[s.cellWrap, { left, top }]}
      // Round 1 first, the final last: the bracket assembles in the direction
      // play runs rather than appearing all at once.
      entering={reduced ? undefined : FadeInLeft.delay((cell.round - 1) * STAGGER_MS).duration(220)}
    >
    <TouchableOpacity
      disabled={!onPress || (!cell.entrantA && !cell.entrantB)}
      onPress={() => onPress?.(cell)}
      accessibilityLabel={cellLabel}
      accessibilityRole={onPress && (cell.entrantA || cell.entrantB) ? "button" : undefined}
      style={s.cellTouch}
    >
      <CarvedCard
        r={radius.md}
        style={{
          ...s.cell,
          // The court chip is absolutely positioned over the top-left corner,
          // so a cell that has one needs its content pushed clear of it.
          ...(cell.court ? { paddingTop: 20 } : null),
          ...(empty ? s.cellEmpty : null),
          ...(live ? { borderColor: C.red } : null),
          ...(isChampCell ? { borderColor: C.accent, ...glow(C.accent, 12, 0.4) } : null),
        }}
      >
        {cell.court ? (
          <View style={s.courtChip}>
            <Text style={s.courtChipText}>C{cell.court}</Text>
          </View>
        ) : null}
        {(["A", "B"] as const).map((side) => {
          const eid = side === "A" ? cell.entrantA : cell.entrantB;
          const label = side === "A" ? nameA : nameB;
          const seed = side === "A" ? seedA : seedB;
          const won = !!cell.winnerEntrant && cell.winnerEntrant === eid;
          // Only recede once the match is decided. Dimming a side of an
          // undecided cell would read as "this one is losing".
          const lost = !!cell.winnerEntrant && !won;
          const wonGames = games.length ? gamesWonBy(games, side) : 0;
          if (!eid) {
            const src = side === "A" ? cell.srcA : cell.srcB;
            return (
              <View key={side} style={s.sideRow}>
                <Text style={s.tbd} numberOfLines={1}>{srcSlotLabel(src) ?? "TBD"}</Text>
              </View>
            );
          }
          return (
            <View key={side} style={[s.sideRow, lost && s.sideRowLost]}>
              {won && isChampCell ? <Icon name="trophy" color={C.accent} size={12} /> : null}
              {seed != null ? (
                // Amber only on the side that caused the upset: tinting both
                // would say the match was an upset without saying who did it.
                <Text style={[s.seedChip, upset && won && s.seedChipUpset]}>{seed}</Text>
              ) : null}
              <SideName name={label} won={won} champ={isChampCell} />
              {wonGames > 0 ? (
                <Text style={[s.gamesPill, won ? s.gamesPillWon : s.gamesPillLost]}>
                  {wonGames}
                </Text>
              ) : null}
            </View>
          );
        })}
        {live && current ? (
          <Text style={s.liveScore}>{current.A}-{current.B}</Text>
        ) : null}
        {!live && cell.winnerEntrant && games.length ? (
          <Text numberOfLines={1} style={s.finalScores}>
            {games.map((g) => `${g.A}-${g.B}`).join("  ")}
          </Text>
        ) : null}
        {live ? <LiveDot reduced={reduced} /> : null}
      </CarvedCard>
    </TouchableOpacity>
    </Animated.View>
  );
});

/**
 * Column heading: which round this is, and how much of it is settled. Without
 * one, a 16-entrant bracket is four scrolling columns of identical boxes with
 * nothing on screen saying which of them is the final.
 */
const RoundHeader = React.memo(function RoundHeader({
  round, maxRound, decided, total, hasLive,
}: { round: number; maxRound: number; decided: number; total: number; hasLive: boolean }) {
  return (
    <View style={s.headerCell}>
      <Text style={[s.headerName, hasLive && s.headerNameActive]} numberOfLines={1}>
        {roundName(round, maxRound)}
      </Text>
      <Text style={s.headerCount}>{decided}/{total}</Text>
    </View>
  );
});

export default function BracketView({
  bracket,
  entrants,
  onCellPress,
  liveScores,
}: {
  bracket: BracketMatch[];
  entrants: Entrant[];
  onCellPress?: (cell: BracketMatch) => void;
  liveScores?: Map<string, BracketLiveScore>;
}) {
  // Every hook runs before the empty-bracket early return below — a
  // conditional return placed above them would violate the rules of hooks.
  // Read once here rather than per cell: a 16-entrant bracket has 15 of them.
  const reduced = useReducedMotion();
  const maxRound = useMemo(
    () => (bracket.length ? Math.max(...bracket.map((m) => m.round)) : 0),
    [bracket]
  );
  const centers = useMemo(() => computeCenters(bracket, maxRound), [bracket, maxRound]);
  const nameOf = useMemo(() => new Map(entrants.map((e) => [e.id, e.name])), [entrants]);
  const seedOf = useMemo(() => new Map(entrants.map((e) => [e.id, e.seed])), [entrants]);
  const lines = useMemo(
    () => bracket.filter((m) => m.round < maxRound),
    [bracket, maxRound]
  );
  const rounds = useMemo(
    () =>
      Array.from({ length: maxRound }, (_, i) => {
        const cells = bracket.filter((m) => m.round === i + 1);
        return {
          round: i + 1,
          total: cells.length,
          decided: cells.filter((m) => m.winnerEntrant).length,
          hasLive: cells.some((m) => m.matchId && !m.winnerEntrant),
        };
      }),
    [bracket, maxRound]
  );
  const dims = useMemo(() => {
    const r1Count = bracket.filter((m) => m.round === 1).length;
    return {
      totalW: maxRound * CELL_W + (maxRound - 1) * COL_GAP,
      totalH: Math.max(1, r1Count) * SLOT,
    };
  }, [bracket, maxRound]);

  if (bracket.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      {/* The header rail sits inside the horizontal scroll but outside the
          vertical one, so it tracks the columns sideways and stays in place
          while the user scrolls down a tall bracket. */}
      <View>
        <View style={[s.headerRow, { width: dims.totalW }]}>
          {rounds.map((r) => (
            <RoundHeader key={r.round} maxRound={maxRound} {...r} />
          ))}
        </View>
        {/* nestedScrollEnabled: Android only, but harmless elsewhere. Needed
            because groups_knockout now renders this inside TournamentView's
            own vertical ScrollView — a same-direction nesting that swallows
            gestures on Android without it. The maxHeight above already
            bounds this ScrollView so it never fights the parent for space. */}
        <ScrollView showsVerticalScrollIndicator nestedScrollEnabled style={{ maxHeight: dims.totalH + 8 }}>
          <View style={{ width: dims.totalW, height: dims.totalH }}>
            <Svg
              width={dims.totalW}
              height={dims.totalH}
              style={StyleSheet.absoluteFill}
            >
              {lines.map((m) => {
                const y1 = centers.get(`${m.round}:${m.index}`)!;
                const childIndex = Math.floor(m.index / 2);
                const y2 = centers.get(`${m.round + 1}:${childIndex}`)!;
                const d = elbowPath(colX(m.round) + CELL_W, y1, colX(m.round + 1), y2);
                // An edge lights only once somebody has actually advanced along it.
                const lit = !!m.winnerEntrant;
                return (
                  <React.Fragment key={`l${m.id}`}>
                    {lit ? (
                      // SVG has no cheap shadow primitive, so the bloom is a
                      // wide faint stroke drawn under the real one.
                      <Path d={d} stroke={C.accent} strokeWidth={6} strokeOpacity={0.12} fill="none" />
                    ) : null}
                    <Path
                      d={d}
                      stroke={lit ? C.accent : C.line}
                      strokeWidth={lit ? 2 : 1.5}
                      fill="none"
                    />
                  </React.Fragment>
                );
              })}
            </Svg>
            {bracket.map((m) => (
              <BracketCell
                key={m.id}
                cell={m}
                nameA={m.entrantA ? nameOf.get(m.entrantA) ?? "?" : "—"}
                nameB={m.entrantB ? nameOf.get(m.entrantB) ?? "?" : "—"}
                seedA={m.entrantA ? seedOf.get(m.entrantA) : undefined}
                seedB={m.entrantB ? seedOf.get(m.entrantB) : undefined}
                left={colX(m.round)}
                top={centers.get(`${m.round}:${m.index}`)! - CELL_H / 2}
                maxRound={maxRound}
                liveScore={m.matchId ? liveScores?.get(m.matchId) : undefined}
                reduced={reduced}
                onPress={onCellPress}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  headerRow: { flexDirection: "row", height: HEADER_H },
  headerCell: { width: CELL_W, marginRight: COL_GAP, justifyContent: "center" },
  headerName: { color: C.text3, fontFamily: F.display, fontSize: 11, letterSpacing: 1 },
  headerNameActive: { color: C.text },
  headerCount: { color: C.ghost, fontFamily: F.medium, fontSize: 9, marginTop: 1 },
  cellWrap: { position: "absolute", width: CELL_W, height: CELL_H },
  cellTouch: { flex: 1 },
  cell: {
    flex: 1,
    justifyContent: "center", paddingHorizontal: 10, paddingVertical: 8, gap: 2,
  },
  // A slot nobody can reach yet reads as pending rather than as a card that
  // failed to load.
  cellEmpty: { borderStyle: "dashed", borderColor: C.line },
  courtChip: {
    position: "absolute", left: 8, top: 6, backgroundColor: C.cardHi,
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1,
  },
  courtChipText: { color: C.text2, fontSize: 9, fontFamily: F.semibold },
  sideRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  // The loser recedes, so the winner reads as the row rather than as a
  // slightly brighter grey next to a slightly duller one.
  sideRowLost: { opacity: 0.45 },
  sideName: { flex: 1, fontSize: 13 },
  pairCol: { flex: 1 },
  // Two names in the space one used to take, so the pair has to give up two
  // points of size and all of its line leading.
  pairLine: { fontSize: 11, lineHeight: 13 },
  seedChip: {
    color: C.text3, fontSize: 9, fontFamily: F.semibold, minWidth: 14,
    textAlign: "center", borderRadius: radius.sm, paddingHorizontal: 3,
    backgroundColor: C.cardHi,
  },
  seedChipUpset: { color: C.bg, backgroundColor: C.amber },
  tbd: {
    flex: 1, color: C.ghost, fontSize: 11, fontFamily: F.medium, letterSpacing: 1,
  },
  sideNameWon: { color: C.text, fontFamily: F.semibold },
  sideNameLost: { color: C.text2, fontFamily: F.body },
  sideNameChamp: { color: C.accent, ...textGlow(C.accent, 10) },
  gamesPill: {
    color: C.bg, fontSize: 9, fontFamily: F.semibold, minWidth: 14,
    textAlign: "center", borderRadius: 7, paddingHorizontal: 3,
  },
  gamesPillWon: { backgroundColor: C.accent },
  gamesPillLost: { backgroundColor: C.text2 },
  liveScore: { color: C.red, fontSize: 12, fontFamily: F.semibold, marginTop: 2 },
  finalScores: { color: C.text2, fontSize: 10, marginTop: 2 },
  liveDot: {
    position: "absolute", right: 8, top: 6,
    width: 7, height: 7, borderRadius: 4, backgroundColor: C.red,
  },
});
