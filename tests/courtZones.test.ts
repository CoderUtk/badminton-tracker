import { defaultConfig, MatchEvent, replay, TeamId } from "../src/engine";
import { courtZones, rightRow } from "../src/lib/courtZones";

const start = (overrides = {}): MatchEvent[] => [
  { type: "MATCH_STARTED", config: defaultConfig(overrides), at: 0 },
];

const rally = (events: MatchEvent[], by: TeamId): MatchEvent[] => [
  ...events,
  { type: "RALLY_WON", by, at: 0 },
];

const zone = (state: ReturnType<typeof replay>, team: TeamId, row: "top" | "bottom") =>
  courtZones(state).find((z) => z.team === team && z.row === row)!;

test("team A's right service court is the bottom box, team B's is the top box", () => {
  expect(rightRow("A")).toBe("bottom");
  expect(rightRow("B")).toBe("top");
});

test("returns four zones in reading order", () => {
  const zones = courtZones(replay(start()));
  expect(zones.map((z) => `${z.team}-${z.row}`)).toEqual([
    "A-top", "A-bottom", "B-top", "B-bottom",
  ]);
});

test("doubles: the first server stands in their team's right court", () => {
  const s = replay(start({ firstServer: { team: "A", playerIndex: 1 } }));
  expect(zone(s, "A", "bottom")).toMatchObject({ playerIdx: 1, isRightCourt: true });
  expect(zone(s, "A", "top")).toMatchObject({ playerIdx: 0, isRightCourt: false });
});

test("doubles: the receiving team starts with player 0 in their right court", () => {
  const s = replay(start({ firstServer: { team: "A", playerIndex: 1 } }));
  expect(zone(s, "B", "top")).toMatchObject({ playerIdx: 0, isRightCourt: true });
  expect(zone(s, "B", "bottom")).toMatchObject({ playerIdx: 1, isRightCourt: false });
});

test("doubles: serving from team B puts its first server in the top box", () => {
  const s = replay(start({ firstServer: { team: "B", playerIndex: 1 } }));
  expect(zone(s, "B", "top")).toMatchObject({ playerIdx: 1, isRightCourt: true });
  expect(zone(s, "A", "bottom")).toMatchObject({ playerIdx: 0, isRightCourt: true });
});

test("singles: at 0-0 both players stand in their right court, left boxes are empty", () => {
  const s = replay(start({ matchType: "singles" }));
  expect(zone(s, "A", "bottom").playerIdx).toBe(0);
  expect(zone(s, "A", "top").playerIdx).toBeNull();
  expect(zone(s, "B", "top").playerIdx).toBe(0);
  expect(zone(s, "B", "bottom").playerIdx).toBeNull();
});

test("singles: an odd server score moves both players to their left court", () => {
  const s = replay(rally(start({ matchType: "singles" }), "A"));
  expect(zone(s, "A", "top").playerIdx).toBe(0);
  expect(zone(s, "A", "bottom").playerIdx).toBeNull();
  expect(zone(s, "B", "bottom").playerIdx).toBe(0);
  expect(zone(s, "B", "top").playerIdx).toBeNull();
});
