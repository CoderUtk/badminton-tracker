import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import BracketView, { type BracketLiveScore } from "./BracketView";
import FixtureList from "./FixtureList";
import StandingsTable from "./StandingsTable";
import { formatOrDefault } from "../tournament/formats";
import { groupLabel, groupOrder, hasDoubleElimRouting, splitDoubleElimRounds } from "../tournament/tournamentView";
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

  // round_robin and groups_knockout render a standings table plus an
  // unbounded fixture list (and, for groups_knockout, a knockout tree after
  // it) — unlike the single_elim/double_elim branches below, none of that
  // carries its own scrolling, so it needs a ScrollView here. single_elim
  // and double_elim are deliberately left unwrapped: `tree()` is BracketView,
  // which already owns a two-axis ScrollView, and wrapping it again would
  // double-scroll and regress today's shipped behaviour.
  if (format === "round_robin") {
    return (
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator>
        <StandingsTable standings={mod.standings(bracket, entrants)} entrants={entrants} />
        <View style={s.section}>
          <FixtureList matches={bracket} entrants={entrants} onCellPress={onCellPress} />
        </View>
      </ScrollView>
    );
  }

  if (format === "groups_knockout") {
    const knockout = bracket.filter((m) => m.groupIdx === null);
    return (
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator>
        {groupOrder(bracket).map((g) => {
          const rows = bracket.filter((m) => m.groupIdx === g);
          const ids = new Set(rows.flatMap((m) => [m.entrantA, m.entrantB]));
          const inGroup = entrants.filter((e) => ids.has(e.id));
          return (
            <View key={g} style={s.section}>
              <Text accessibilityRole="header" style={s.heading}>{groupLabel(g)}</Text>
              <StandingsTable standings={mod.standings(rows, inGroup)} entrants={inGroup} />
              <FixtureList matches={rows} entrants={inGroup} onCellPress={onCellPress} />
            </View>
          );
        })}
        {/* BracketView (tree()) nests its own vertical ScrollView, bounded by
            maxHeight: dims.totalH + 8 in BracketView.tsx — it does not grow to
            fill this outer ScrollView, so this is a bounded-height child, not
            a flex:1 one. nestedScrollEnabled on that inner ScrollView (set in
            BracketView.tsx) is what keeps Android from swallowing the
            gesture at the boundary between the two same-direction scrolls. */}
        {knockout.length > 0 ? <View style={s.section}>{tree(knockout)}</View> : null}
      </ScrollView>
    );
  }

  if (format === "double_elim") {
    // Without the loss-routing edge (e.g. the spectator payload, which
    // doesn't select it) there is nothing to split winners from losers on,
    // and guessing a boundary would render the exact "visually wrong
    // bracket" this format-aware view exists to avoid — fall back to one
    // flat tree instead. See hasDoubleElimRouting's own comment for why a
    // bracket with the edge genuinely missing looks different from one that
    // simply has no losses yet.
    if (!hasDoubleElimRouting(bracket)) return tree(bracket);
    // The grand final is its own bucket, not the top of the losers bracket:
    // doubleElim.build gives it the same "nowhere left to go" shape as an
    // eliminated losers row (both winToMatchId and lossToMatchId null), so a
    // round-number split alone would file the tournament's deciding match
    // under LOSERS. See splitDoubleElimRounds's own comment.
    const { winners, grandFinal, losers } = splitDoubleElimRounds(bracket);
    return (
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={s.heading}>WINNERS</Text>
        <View style={s.bracketSlot}>{tree(winners)}</View>
        <Text accessibilityRole="header" style={s.heading}>LOSERS</Text>
        <View style={s.bracketSlot}>{tree(losers)}</View>
        <Text accessibilityRole="header" style={s.heading}>GRAND FINAL</Text>
        <View style={s.bracketSlot}>{tree(grandFinal)}</View>
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
