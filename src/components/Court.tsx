import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MatchState, TeamId } from "../engine";
import { serviceCourt } from "../engine";
import Icon from "./Icon";
import NetDivider from "./NetDivider";
import { C } from "../theme";

/**
 * Horizontal court: team A occupies the left half, team B the right, with a
 * vertical net divider. Each half is always two stacked service boxes (right +
 * left court) so the layout reads like a real court in both singles and doubles.
 *
 * Orientation: the left team faces right, so their right service court is the
 * BOTTOM box; the right team faces left, so their right court is the TOP box.
 */
const LINE = "rgba(255,255,255,0.45)";

/** Which stacked row is a team's right service court, given the half it sits in. */
function rightRow(left: boolean): "top" | "bottom" {
  return left ? "bottom" : "top";
}

function Half({ state, team }: { state: MatchState; team: TeamId }) {
  const serving = state.servingTeam === team;
  const singles = state.config.matchType === "singles";
  const left = team === "A";
  const color = left ? C.red : C.blue;
  // Use the SERVING team's color for serve highlights so neither team has a visual advantage.
  const servingColor = state.servingTeam === "A" ? C.red : C.blue;

  // The row (top/bottom) of this team's right vs left service court.
  const rowOf = (court: "right" | "left"): "top" | "bottom" =>
    court === "right" ? rightRow(left) : rightRow(left) === "top" ? "bottom" : "top";

  // Server's occupied row (only the serving team draws a highlighted box).
  const serveRow = serving ? rowOf(serviceCourt(state)) : null;

  // Compute the player index (or null) standing in each row.
  let topIdx: number | null;
  let bottomIdx: number | null;
  if (singles) {
    // Singles: both players' courts are governed by the SERVER's score parity
    // (server serves from right when even, left when odd); the receiver stands
    // diagonally opposite, which carries the same left/right label. So both
    // switch sides together whenever the server's point changes.
    const row = rowOf(serviceCourt(state));
    topIdx = row === "top" ? 0 : null;
    bottomIdx = row === "bottom" ? 0 : null;
  } else {
    const pos = state.positions[team];
    topIdx = left ? pos.left : pos.right;
    bottomIdx = left ? pos.right : pos.left;
  }

  return (
    <View style={s.half}>
      {(["top", "bottom"] as const).map((row) => {
        const idx = row === "top" ? topIdx : bottomIdx;
        const isServer = serveRow === row;
        return (
          <View
            key={row}
            style={[
              s.box,
              row === "top" && s.boxDivider,
              isServer && [
                s.boxServing,
                {
                  borderColor: servingColor,
                  backgroundColor: servingColor === C.red
                    ? "rgba(255,59,48,0.12)"
                    : "rgba(59,130,246,0.12)",
                },
              ],
            ]}
          >
            {isServer && <View style={[s.dot, { backgroundColor: servingColor, shadowColor: servingColor }]} />}
            {idx !== null && (
              <View style={s.player}>
                <Icon name="person" color={color} size={15} />
                <Text style={[s.name, { color }]} numberOfLines={1}>
                  {state.config.teams[team][idx].name}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function Court({ state }: { state: MatchState }) {
  return (
    <View style={s.court}>
      <Half state={state} team="A" />
      <NetDivider />
      <Half state={state} team="B" />
    </View>
  );
}

const s = StyleSheet.create({
  court: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#20262B",
    borderWidth: 1.5,
    borderColor: LINE,
    borderRadius: 10,
    overflow: "hidden",
  },
  half: { flex: 1 },
  box: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  boxDivider: { borderBottomWidth: 1, borderColor: LINE },
  boxServing: {
    borderWidth: 1.5,
    // borderColor and backgroundColor are overridden dynamically per serving team
    // Emil: subtle glow for state emphasis without overwhelming the court
  },
  dot: {
    position: "absolute", top: 10, right: 10,
    width: 14, height: 14, borderRadius: 7,
    // backgroundColor and shadowColor are overridden dynamically per serving team
    shadowOpacity: 0.9, shadowRadius: 6, elevation: 4,
  },
  player: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 6 },
  name: { fontSize: 16, fontWeight: "700", flexShrink: 1 },
});
