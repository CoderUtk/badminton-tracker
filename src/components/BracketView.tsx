import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Line } from "react-native-svg";
import type { BracketMatch, Entrant } from "../tournament/types";
import { gamesWonBy } from "../tournament/score";
import Icon from "./Icon";
import { C, F } from "../theme";

const CELL_W = 150;
const CELL_H = 84;
const GAP_Y = 20;
const COL_GAP = 44;
const SLOT = CELL_H + GAP_Y;

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
  top: number;
  left: number;
  maxRound: number;
  liveScore: BracketLiveScore | undefined;
  onPress?: (cell: BracketMatch) => void;
};

/**
 * One bracket cell. Extracted and memoised because the whole bracket used to
 * be a single inline .map with no memo boundary anywhere: opening a sheet or
 * toggling `refreshing` re-rendered every cell, and the 15s poll did the same
 * on a timer whether or not anything had changed.
 */
const BracketCell = React.memo(function BracketCell({
  cell, nameA, nameB, top, left, maxRound, liveScore, onPress,
}: CellProps) {
  const live = !!cell.matchId && !cell.winnerEntrant;
  const isChampCell = cell.round === maxRound && !!cell.winnerEntrant;
  const games = liveScore?.scoreSummary?.games ?? [];
  const current = liveScore?.scoreSummary?.current;

  return (
    <TouchableOpacity
      disabled={!onPress || (!cell.entrantA && !cell.entrantB)}
      onPress={() => onPress?.(cell)}
      style={[
        s.cell,
        { left, top, borderColor: live ? C.accent : isChampCell ? C.red : C.line },
      ]}
    >
      {cell.court ? (
        <View style={s.courtChip}>
          <Text style={s.courtChipText}>C{cell.court}</Text>
        </View>
      ) : null}
      {(["A", "B"] as const).map((side) => {
        const eid = side === "A" ? cell.entrantA : cell.entrantB;
        const label = side === "A" ? nameA : nameB;
        const won = !!cell.winnerEntrant && cell.winnerEntrant === eid;
        const wonGames = games.length ? gamesWonBy(games, side) : 0;
        return (
          <View key={side} style={s.sideRow}>
            {won && isChampCell ? <Icon name="trophy" color={C.red} size={12} /> : null}
            <Text
              numberOfLines={1}
              style={[s.sideName, won ? s.sideNameWon : s.sideNameLost]}
            >
              {label}
            </Text>
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
      {live ? <View style={s.liveDot} /> : null}
    </TouchableOpacity>
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
  const maxRound = useMemo(
    () => (bracket.length ? Math.max(...bracket.map((m) => m.round)) : 0),
    [bracket]
  );
  const centers = useMemo(() => computeCenters(bracket, maxRound), [bracket, maxRound]);
  const nameOf = useMemo(() => new Map(entrants.map((e) => [e.id, e.name])), [entrants]);
  const lines = useMemo(
    () => bracket.filter((m) => m.round < maxRound),
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
      <ScrollView showsVerticalScrollIndicator style={{ maxHeight: dims.totalH + 8 }}>
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
              return (
                <Line
                  key={`l${m.id}`}
                  x1={colX(m.round) + CELL_W}
                  y1={y1}
                  x2={colX(m.round + 1)}
                  y2={y2}
                  stroke={C.line}
                  strokeWidth={1.5}
                />
              );
            })}
          </Svg>
          {bracket.map((m) => (
            <BracketCell
              key={m.id}
              cell={m}
              nameA={m.entrantA ? nameOf.get(m.entrantA) ?? "?" : "—"}
              nameB={m.entrantB ? nameOf.get(m.entrantB) ?? "?" : "—"}
              left={colX(m.round)}
              top={centers.get(`${m.round}:${m.index}`)! - CELL_H / 2}
              maxRound={maxRound}
              liveScore={m.matchId ? liveScores?.get(m.matchId) : undefined}
              onPress={onCellPress}
            />
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  cell: {
    position: "absolute", width: CELL_W, height: CELL_H,
    backgroundColor: C.card, borderRadius: 10, borderWidth: 1,
    justifyContent: "center", paddingHorizontal: 10, paddingVertical: 8, gap: 2,
  },
  courtChip: {
    position: "absolute", left: 8, top: 6, backgroundColor: C.cardHi,
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1,
  },
  courtChipText: { color: C.text2, fontSize: 9, fontFamily: F.semibold },
  sideRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  sideName: { flex: 1, fontSize: 13 },
  sideNameWon: { color: C.text, fontFamily: F.semibold },
  sideNameLost: { color: C.text2, fontFamily: F.body },
  gamesPill: {
    color: C.bg, fontSize: 9, fontFamily: F.semibold, minWidth: 14,
    textAlign: "center", borderRadius: 7, paddingHorizontal: 3,
  },
  gamesPillWon: { backgroundColor: C.red },
  gamesPillLost: { backgroundColor: C.text2 },
  liveScore: { color: C.accent, fontSize: 12, fontFamily: F.semibold, marginTop: 2 },
  finalScores: { color: C.text2, fontSize: 10, marginTop: 2 },
  liveDot: {
    position: "absolute", right: 8, top: 6,
    width: 7, height: 7, borderRadius: 4, backgroundColor: C.red,
  },
});
