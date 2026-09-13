import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import CarvedCard from "./CarvedCard";
import { C, F, press, radius } from "../theme";
import { fixtureLabel, fixtureRounds } from "../tournament/fixtureList";
import type { BracketMatch, Entrant } from "../tournament/types";

/**
 * Round-robin / group-stage fixture list: every scheduled match, grouped by
 * round, tappable while unplayed. This is the "one tap through to the
 * fixture" StandingsTable alone can't provide — a standings table has no row
 * per match, only per entrant, so without this list a round-robin or a
 * groups → knockout group stage has nothing on screen a host can tap to
 * start scoring (see TournamentView, which renders this under each
 * standings table).
 *
 * Every tappable row calls the SAME onCellPress a bracket cell would, so it
 * flows through the existing start-match path with no duplicated logic.
 */
export default function FixtureList({
  matches,
  entrants,
  onCellPress,
}: {
  matches: BracketMatch[];
  entrants: Entrant[];
  onCellPress?: (cell: BracketMatch) => void;
}) {
  const nameOf = useMemo(() => new Map(entrants.map((e) => [e.id, e.name])), [entrants]);
  const rounds = useMemo(() => fixtureRounds(matches), [matches]);

  if (matches.length === 0) return null;

  return (
    <View>
      {rounds.map(({ round, matches: rowMatches }) => (
        <View key={round} style={s.roundBlock}>
          <Text accessibilityRole="header" style={s.roundHeading}>ROUND {round}</Text>
          <CarvedCard r={radius.md} style={s.card}>
            {rowMatches.map((m, i) => {
              const nameA = m.entrantA ? nameOf.get(m.entrantA) ?? "?" : "?";
              const nameB = m.entrantB ? nameOf.get(m.entrantB) ?? "?" : "?";
              const winnerName = m.winnerEntrant ? nameOf.get(m.winnerEntrant) ?? null : null;
              const label = fixtureLabel(nameA, nameB, winnerName);
              const rowStyle = [s.row, i === 0 && s.rowFirst];
              const content = (
                <>
                  <Text numberOfLines={1} style={s.names}>{nameA} vs {nameB}</Text>
                  {m.court ? <Text style={s.court}>C{m.court}</Text> : null}
                  <Text style={[s.result, winnerName && s.resultDone]} numberOfLines={1}>
                    {winnerName ?? "—"}
                  </Text>
                </>
              );
              if (!winnerName && onCellPress) {
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => onCellPress(m)}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    style={({ pressed }) => [...rowStyle, pressed && press]}
                  >
                    {content}
                  </Pressable>
                );
              }
              return (
                <View key={m.id} style={rowStyle} accessibilityLabel={label}>
                  {content}
                </View>
              );
            })}
          </CarvedCard>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  roundBlock: { marginBottom: 12 },
  roundHeading: {
    color: C.text3, fontFamily: F.display, fontSize: 11, letterSpacing: 1,
    marginBottom: 6,
  },
  card: { paddingVertical: 4 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 10, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: C.line,
  },
  rowFirst: { borderTopWidth: 0 },
  names: { flex: 1, color: C.text, fontFamily: F.medium, fontSize: 13 },
  court: { color: C.text2, fontFamily: F.semibold, fontSize: 10 },
  result: { color: C.ghost, fontFamily: F.medium, fontSize: 12, minWidth: 60, textAlign: "right" },
  resultDone: { color: C.text2 },
});
