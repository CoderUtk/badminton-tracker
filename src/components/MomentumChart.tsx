import React from "react";
import { StyleSheet, View } from "react-native";
import { C } from "../theme";
import type { MomentumGame } from "../lib/matchMomentum";

const HEIGHT = 44;

/**
 * Point-differential sparkline for one game: a bar per rally, above the
 * baseline while A leads and below it while B leads.
 *
 * Plain Views rather than SVG — the app ships no charting dependency and a
 * signed bar chart is two absolutely-positioned rectangles per column. Bars
 * flex to fill the row, so a 40-rally game and a 12-rally game both span the
 * same width and read as comparable shapes.
 *
 * `scale` is passed in rather than derived per game so every game in a match
 * shares one vertical scale; scaling each independently would make a 2-point
 * game look as dramatic as an 11-point blowout.
 */
export default function MomentumChart({ game, scale }: { game: MomentumGame; scale: number }) {
  const max = Math.max(1, scale);
  return (
    <View
      style={s.row}
      // The chart is decoration for the numbers stated beside it; announcing
      // 40 unlabelled bars would bury them.
      importantForAccessibility="no-hide-descendants"
      accessible={false}
    >
      <View style={s.baseline} />
      {game.diff.slice(1).map((d, i) => {
        const h = (Math.abs(d) / max) * (HEIGHT / 2);
        if (d === 0) return <View key={i} style={s.col} />;
        return (
          <View key={i} style={s.col}>
            <View
              style={[
                s.bar,
                { height: Math.max(1, h), backgroundColor: d > 0 ? C.red : C.blue },
                d > 0 ? { bottom: HEIGHT / 2 } : { top: HEIGHT / 2 },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", height: HEIGHT, alignItems: "stretch", gap: 1 },
  baseline: {
    position: "absolute", left: 0, right: 0, top: HEIGHT / 2,
    height: StyleSheet.hairlineWidth, backgroundColor: C.line,
  },
  col: { flex: 1, minWidth: 2 },
  bar: { position: "absolute", left: 0, right: 0, borderRadius: 1 },
});
