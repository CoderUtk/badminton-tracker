import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { MatchState, TeamId } from "../engine";
import { serviceCourt } from "../engine";
import { courtZones, type CourtZone } from "../lib/courtZones";
import CourtBox, { type CourtBoxEdit } from "./CourtBox";
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
 * That rule lives in src/lib/courtZones.ts.
 *
 * Read-only by default. The new-match screen passes `edit` to turn the court
 * into the setup surface: names edit in place, tapping a box picks the first
 * server, and the swap buttons sit on the court's own dividers.
 */
const LINE = "rgba(255,255,255,0.45)";

export type CourtEdit = {
  /** Per-box interaction bundle; called once per zone on every render. */
  zoneEdit: (zone: CourtZone) => CourtBoxEdit;
  onSwapSides: () => void;
  onSwapTeam: (team: TeamId) => void;
  /** False in singles, where a team has only one player. */
  showTeamSwap: boolean;
};

function Half({
  state, team, zones, edit,
}: {
  state: MatchState;
  team: TeamId;
  zones: CourtZone[];
  edit?: CourtEdit;
}) {
  const serving = state.servingTeam === team;
  const color = team === "A" ? C.red : C.blue;
  // Use the SERVING team's color for serve highlights so neither team has a visual advantage.
  const servingColor = state.servingTeam === "A" ? C.red : C.blue;

  // Server's occupied row (only the serving team draws a highlighted box).
  const serveRow = serving
    ? zones.find((z) => z.isRightCourt === (serviceCourt(state) === "right"))!.row
    : null;

  return (
    <View style={s.half}>
      {zones.map((zone) => (
        <CourtBox
          key={zone.row}
          zone={zone}
          name={zone.playerIdx !== null ? state.config.teams[team][zone.playerIdx].name : null}
          color={color}
          isServer={serveRow === zone.row}
          servingColor={servingColor}
          showDivider={zone.row === "top"}
          edit={edit?.zoneEdit(zone)}
        />
      ))}

      {edit?.showTeamSwap && (
        <Pressable
          style={s.teamSwap}
          onPress={() => edit.onSwapTeam(team)}
          hitSlop={8}
          accessibilityLabel={`Swap team ${team} players`}
        >
          <Icon name="swap-vertical" color={C.text} size={16} />
        </Pressable>
      )}
    </View>
  );
}

export default function Court({ state, edit }: { state: MatchState; edit?: CourtEdit }) {
  const zones = courtZones(state);
  const half = (team: TeamId) => zones.filter((z) => z.team === team);

  return (
    <View style={s.court}>
      <Half state={state} team="A" zones={half("A")} edit={edit} />
      <View style={s.net}>
        <NetDivider />
        {edit && (
          <Pressable
            style={s.sideSwap}
            onPress={edit.onSwapSides}
            hitSlop={8}
            accessibilityLabel="Swap sides"
          >
            <Icon name="swap-horizontal" color={C.text} size={18} />
          </Pressable>
        )}
      </View>
      <Half state={state} team="B" zones={half("B")} edit={edit} />
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
  net: { justifyContent: "center", zIndex: 2 },
  sideSwap: {
    position: "absolute", alignSelf: "center",
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(20,24,28,0.92)",
    borderWidth: 1, borderColor: LINE,
  },
  teamSwap: {
    position: "absolute", top: "50%", marginTop: -16, alignSelf: "center",
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(20,24,28,0.92)",
    borderWidth: 1, borderColor: LINE,
    zIndex: 2,
  },
});
