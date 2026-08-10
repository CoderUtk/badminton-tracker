import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MatchState, TeamId } from "../engine";
import { serviceCourt } from "../engine";
import { courtZones, type CourtZone } from "../lib/courtZones";
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

function Half({ state, team, zones }: { state: MatchState; team: TeamId; zones: CourtZone[] }) {
  const serving = state.servingTeam === team;
  const left = team === "A";
  const color = left ? C.red : C.blue;
  // Use the SERVING team's color for serve highlights so neither team has a visual advantage.
  const servingColor = state.servingTeam === "A" ? C.red : C.blue;

  // Server's occupied row (only the serving team draws a highlighted box).
  const serveRow = serving
    ? zones.find((z) => z.isRightCourt === (serviceCourt(state) === "right"))!.row
    : null;

  return (
    <View style={s.half}>
      {zones.map((zone) => {
        const isServer = serveRow === zone.row;
        return (
          <View
            key={zone.row}
            style={[
              s.box,
              zone.row === "top" && s.boxDivider,
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
            {zone.playerIdx !== null && (
              <View style={s.player}>
                <Icon name="person" color={color} size={15} />
                <Text style={[s.name, { color }]} numberOfLines={1}>
                  {state.config.teams[team][zone.playerIdx].name}
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
  const zones = courtZones(state);
  const half = (team: TeamId) => zones.filter((z) => z.team === team);
  return (
    <View style={s.court}>
      <Half state={state} team="A" zones={half("A")} />
      <NetDivider />
      <Half state={state} team="B" zones={half("B")} />
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
