import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import CarvedCard from "./CarvedCard";
import { C, F, radius } from "../theme";
import { standingRowLabel } from "../tournament/tournamentView";
import type { Standing } from "../tournament/formats/types";
import type { Entrant } from "../tournament/types";

/**
 * Round-robin / group standings. `standings` carries the total order every
 * device agrees on; a `tied` row is level with its neighbour on every
 * sporting tiebreak and the split came from seed or id — that split is not a
 * result, so it is marked "level" rather than silently rendered as an
 * ordinary rank gap.
 *
 * Renders only the rows `standings` provides — an entrant with no standing
 * row (e.g. a mid-tournament read before its group has any results) is
 * simply absent, not a crash.
 */
export default function StandingsTable({
  standings,
  entrants,
  onPressEntrant,
}: {
  standings: Standing[];
  entrants: Entrant[];
  onPressEntrant?: (entrantId: string) => void;
}) {
  const nameOf = useMemo(() => new Map(entrants.map((e) => [e.id, e.name])), [entrants]);

  return (
    <CarvedCard r={radius.md} style={s.card}>
      <View style={s.headerRow}>
        <Text style={[s.headCell, s.rankCol]}>#</Text>
        <Text style={[s.headCell, s.nameCol]}>PLAYER</Text>
        <Text style={[s.headCell, s.recordCol]}>{"W–L"}</Text>
      </View>
      {standings.map((row) => {
        const name = nameOf.get(row.entrantId) ?? "?";
        const Row = onPressEntrant ? Pressable : View;
        // Every row carries an explicit label, tied or not: undefined does
        // not clear the contentDescription an earlier render set, so a row
        // that stops being tied keeps announcing its stale one. See
        // standingRowLabel.
        const label = standingRowLabel(row, name);
        return (
          <Row
            key={row.entrantId}
            style={s.row}
            onPress={onPressEntrant ? () => onPressEntrant(row.entrantId) : undefined}
            accessibilityRole={onPressEntrant ? "button" : undefined}
            accessibilityLabel={label}
          >
            <Text style={[s.cell, s.rankCol]}>{row.rank}</Text>
            <View style={s.nameCol}>
              <Text numberOfLines={1} style={[s.cell, s.nameText]}>{name}</Text>
              {row.tied ? <Text style={s.levelTag}>LEVEL</Text> : null}
            </View>
            <Text style={[s.cell, s.recordCol]}>{row.wins}{"–"}{row.losses}</Text>
          </Row>
        );
      })}
    </CarvedCard>
  );
}

const s = StyleSheet.create({
  card: { paddingVertical: 4 },
  headerRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 6,
  },
  headCell: { color: C.text3, fontFamily: F.display, fontSize: 10, letterSpacing: 1 },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: C.line,
  },
  cell: { color: C.text, fontFamily: F.medium, fontSize: 13 },
  rankCol: { width: 24 },
  nameCol: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  nameText: { flexShrink: 1 },
  recordCol: { width: 48, textAlign: "right" },
  levelTag: {
    color: C.amber, fontFamily: F.semibold, fontSize: 9, letterSpacing: 0.5,
    backgroundColor: C.cardHi, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1,
  },
});
