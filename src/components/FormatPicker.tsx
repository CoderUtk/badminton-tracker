import { Pressable, StyleSheet, Text, View } from "react-native";
import type { FormatId } from "../tournament/types";
import { formatRows } from "../tournament/estimate";
import { C, F, press, selected, selectedText } from "../theme";

const GROUP_SIZES = [3, 4, 5] as const;
const ADVANCE_OPTIONS = [1, 2] as const;

/**
 * One row per format: label, blurb, and a live "≈ N matches · ~Xh" computed
 * from the current entrant and court counts.
 *
 * The estimate is the anti-confusion mechanism. Four formats on one screen is
 * only safe if an unplayable choice LOOKS unplayable before the host commits —
 * otherwise they find out a 16-player round-robin is 120 matches after
 * starting it. All row copy is computed by formatRows (src/tournament/estimate.ts),
 * kept as a plain function so it is unit-tested; this component just renders it.
 */
export default function FormatPicker({
  value, onPick, entrants, bestOf, courts, groupSize, advancePerGroup, onGroupSize, onAdvance,
}: {
  value: FormatId;
  onPick: (id: FormatId) => void;
  entrants: number;
  bestOf: number;
  courts: number;
  groupSize: number;
  advancePerGroup: number;
  onGroupSize: (n: number) => void;
  onAdvance: (n: number) => void;
}) {
  const rows = formatRows(entrants, bestOf, courts, { groupSize, advancePerGroup });
  const groupCount = Math.max(1, Math.round(entrants / groupSize));

  return (
    <View style={{ gap: 8 }}>
      {rows.map((row) => {
        const on = value === row.id;
        return (
          <Pressable
            key={row.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${row.label}. ${row.blurb}. ${row.estimateText}${row.warning ? `. ${row.warning}` : ""}`}
            onPress={() => onPick(row.id)}
            style={({ pressed }) => [s.row, pressed && press, on && selected]}
          >
            <Text style={[s.label, on && selectedText]}>{row.label}</Text>
            <Text style={s.blurb}>{row.blurb}</Text>
            <Text style={[s.estimate, row.long && s.estimateLong]}>{row.estimateText}</Text>
            {row.warning ? <Text style={s.warning}>{row.warning}</Text> : null}
          </Pressable>
        );
      })}

      {value === "groups_knockout" ? (
        <View style={{ gap: 6 }}>
          <Text style={s.h}>Group size</Text>
          <View style={s.segRow}>
            {GROUP_SIZES.map((n) => (
              <Pressable
                key={n} accessibilityRole="radio"
                accessibilityState={{ selected: groupSize === n }}
                accessibilityLabel={`Group size ${n}`}
                onPress={() => onGroupSize(n)}
                style={({ pressed }) => [s.segBtn, pressed && press, groupSize === n && s.segOn]}
              >
                <Text style={[s.segText, groupSize === n && s.segTextOn]}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.h}>Advance per group</Text>
          <View style={s.segRow}>
            {ADVANCE_OPTIONS.map((n) => (
              <Pressable
                key={n} accessibilityRole="radio"
                accessibilityState={{ selected: advancePerGroup === n }}
                accessibilityLabel={`Top ${n} advance`}
                onPress={() => onAdvance(n)}
                style={({ pressed }) => [s.segBtn, pressed && press, advancePerGroup === n && s.segOn]}
              >
                <Text style={[s.segText, advancePerGroup === n && s.segTextOn]}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.blurb}>
            {`${groupCount} groups of ${groupSize}, top ${advancePerGroup} advance → ${groupCount * advancePerGroup} in the knockout`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 12, gap: 2 },
  h: { color: C.text, fontFamily: F.bold, fontSize: 14 },
  label: { color: C.text2, fontFamily: F.semibold, fontSize: 15 },
  blurb: { color: C.text2, fontFamily: F.body, fontSize: 13 },
  estimate: { color: C.text3, fontFamily: F.body, fontSize: 12.5 },
  estimateLong: { color: C.amber, fontFamily: F.semibold },
  warning: { color: C.amber, fontFamily: F.body, fontSize: 12.5 },
  segRow: { flexDirection: "row", gap: 8 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 11, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  segOn: selected,
  segText: { color: C.text2, fontFamily: F.semibold, fontSize: 15 },
  segTextOn: selectedText,
});
