import type { MatchState, TeamId } from "../engine";
import { serviceCourt } from "../engine";

export type CourtRow = "top" | "bottom";

/** One of the four service boxes drawn by <Court />. */
export type CourtZone = {
  team: TeamId;
  row: CourtRow;
  /** Index into state.config.teams[team], or null when nobody stands here. */
  playerIdx: number | null;
  /** True when this box is that team's RIGHT service court. */
  isRightCourt: boolean;
};

const other = (row: CourtRow): CourtRow => (row === "top" ? "bottom" : "top");

/**
 * Which stacked row is a team's right service court. Team A occupies the left
 * half and faces right, so its right court is the BOTTOM box; team B faces
 * left, so its right court is the TOP box.
 */
export function rightRow(team: TeamId): CourtRow {
  return team === "A" ? "bottom" : "top";
}

/** The four boxes, in reading order: A-top, A-bottom, B-top, B-bottom. */
export function courtZones(state: MatchState): CourtZone[] {
  const singles = state.config.matchType === "singles";

  return (["A", "B"] as const).flatMap((team) => {
    const right = rightRow(team);
    let topIdx: number | null;
    let bottomIdx: number | null;

    if (singles) {
      // Both players' courts are governed by the SERVER's score parity: the
      // server serves from the right when even, and the receiver stands
      // diagonally opposite, which carries the same left/right label. So each
      // half has exactly one occupied box and they switch together.
      const row = serviceCourt(state) === "right" ? right : other(right);
      topIdx = row === "top" ? 0 : null;
      bottomIdx = row === "bottom" ? 0 : null;
    } else {
      const pos = state.positions[team];
      topIdx = team === "A" ? pos.left : pos.right;
      bottomIdx = team === "A" ? pos.right : pos.left;
    }

    return (["top", "bottom"] as const).map<CourtZone>((row) => ({
      team,
      row,
      playerIdx: row === "top" ? topIdx : bottomIdx,
      isRightCourt: row === right,
    }));
  });
}
