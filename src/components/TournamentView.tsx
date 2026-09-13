import React from "react";
import { StyleSheet, Text, View } from "react-native";
import BracketView, { type BracketLiveScore } from "./BracketView";
import StandingsTable from "./StandingsTable";
import { formatOrDefault } from "../tournament/formats";
import { groupLabel, groupOrder, splitDoubleElimRounds } from "../tournament/tournamentView";
import { C, F } from "../theme";
import type { BracketMatch, Entrant, FormatId } from "../tournament/types";

/**
 * Picks a renderer by format. BracketView stays a pure tree renderer and
 * gains no format knowledge — everything that is not a tree is handled here,
 * so adding a format later touches this file and not that one.
 */
export default function TournamentView({
  format,
  bracket,
  entrants,
  onCellPress,
  liveScores,
}: {
  format: FormatId;
  bracket: BracketMatch[];
  entrants: Entrant[];
  onCellPress?: (cell: BracketMatch) => void;
  liveScores?: Map<string, BracketLiveScore>;
}) {
  const mod = formatOrDefault(format);
  const tree = (rows: BracketMatch[]) => (
    <BracketView bracket={rows} entrants={entrants} onCellPress={onCellPress} liveScores={liveScores} />
  );

  if (format === "round_robin") {
    return <StandingsTable standings={mod.standings(bracket, entrants)} entrants={entrants} />;
  }

  if (format === "groups_knockout") {
    const knockout = bracket.filter((m) => m.groupIdx === null);
    return (
      <View>
        {groupOrder(bracket).map((g) => {
          const rows = bracket.filter((m) => m.groupIdx === g);
          const ids = new Set(rows.flatMap((m) => [m.entrantA, m.entrantB]));
          const inGroup = entrants.filter((e) => ids.has(e.id));
          return (
            <View key={g} style={s.section}>
              <Text accessibilityRole="header" style={s.heading}>{groupLabel(g)}</Text>
              <StandingsTable standings={mod.standings(rows, inGroup)} entrants={inGroup} />
            </View>
          );
        })}
        {knockout.length > 0 ? <View style={s.section}>{tree(knockout)}</View> : null}
      </View>
    );
  }

  if (format === "double_elim") {
    const { winners, losers } = splitDoubleElimRounds(bracket);
    return (
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={s.heading}>WINNERS</Text>
        <View style={s.bracketSlot}>{tree(winners)}</View>
        <Text accessibilityRole="header" style={s.heading}>LOSERS</Text>
        <View style={s.bracketSlot}>{tree(losers)}</View>
      </View>
    );
  }

  return tree(bracket);
}

const s = StyleSheet.create({
  section: { marginBottom: 16 },
  // Matches roundName's existing column-heading type rather than introducing
  // new typography for the same job.
  heading: {
    color: C.text3, fontFamily: F.display, fontSize: 11, letterSpacing: 1,
    marginBottom: 6,
  },
  bracketSlot: { flex: 1, marginBottom: 8 },
});
