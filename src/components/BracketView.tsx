import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import Svg, { Line } from "react-native-svg";
import type { BracketMatch, Entrant } from "../tournament/types";
import Icon from "./Icon";
import { C, F } from "../theme";

const CELL_W = 150;
const CELL_H = 56;
const GAP_Y = 20;
const COL_GAP = 44;
const SLOT = CELL_H + GAP_Y;

type Centers = Map<string, number>; // `${round}:${index}` -> centerY

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

export default function BracketView({
  bracket,
  entrants,
  onCellPress,
}: {
  bracket: BracketMatch[];
  entrants: Entrant[];
  onCellPress?: (cell: BracketMatch) => void;
}) {
  if (bracket.length === 0) return null;
  const maxRound = Math.max(...bracket.map((m) => m.round));
  const centers = computeCenters(bracket, maxRound);
  const r1Count = bracket.filter((m) => m.round === 1).length;
  const totalW = maxRound * CELL_W + (maxRound - 1) * COL_GAP;
  const totalH = Math.max(1, r1Count) * SLOT;
  const nameOf = new Map(entrants.map((e) => [e.id, e.name]));
  const colX = (round: number) => (round - 1) * (CELL_W + COL_GAP);

  const champion =
    bracket.find((m) => m.round === maxRound && m.index === 0)?.winnerEntrant ?? null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <ScrollView showsVerticalScrollIndicator style={{ maxHeight: totalH + 8 }}>
        <View style={{ width: totalW, height: totalH }}>
          <Svg width={totalW} height={totalH} style={{ position: "absolute", left: 0, top: 0 }}>
            {bracket
              .filter((m) => m.round < maxRound)
              .map((m) => {
                const y1 = centers.get(`${m.round}:${m.index}`)!;
                const childIndex = Math.floor(m.index / 2);
                const y2 = centers.get(`${m.round + 1}:${childIndex}`)!;
                const x1 = colX(m.round) + CELL_W;
                const x2 = colX(m.round + 1);
                return (
                  <Line key={`l${m.id}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.line} strokeWidth={1.5} />
                );
              })}
          </Svg>
          {bracket.map((m) => {
            const cy = centers.get(`${m.round}:${m.index}`)!;
            const nameA = m.entrantA ? nameOf.get(m.entrantA) ?? "?" : "—";
            const nameB = m.entrantB ? nameOf.get(m.entrantB) ?? "?" : "—";
            const live = !!m.matchId && !m.winnerEntrant;
            const isChampCell = m.round === maxRound && !!m.winnerEntrant;
            return (
              <TouchableOpacity
                key={m.id}
                disabled={!onCellPress || (!m.entrantA && !m.entrantB)}
                onPress={() => onCellPress?.(m)}
                style={{
                  position: "absolute",
                  left: colX(m.round),
                  top: cy - CELL_H / 2,
                  width: CELL_W,
                  height: CELL_H,
                  backgroundColor: C.card,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: live ? C.accent : isChampCell ? C.red : C.line,
                  justifyContent: "center",
                  paddingHorizontal: 10,
                }}
              >
                {(["A", "B"] as const).map((side) => {
                  const eid = side === "A" ? m.entrantA : m.entrantB;
                  const label = side === "A" ? nameA : nameB;
                  const won = m.winnerEntrant && m.winnerEntrant === eid;
                  return (
                    <View key={side} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      {won && isChampCell ? <Icon name="trophy" color={C.red} size={12} /> : null}
                      <Text
                        numberOfLines={1}
                        style={{ color: won ? C.text : C.text2, fontFamily: won ? F.semibold : F.body, fontSize: 13 }}
                      >
                        {label}
                      </Text>
                    </View>
                  );
                })}
                {live ? (
                  <View style={{ position: "absolute", right: 8, top: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: C.red }} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </ScrollView>
  );
}
