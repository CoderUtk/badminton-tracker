import { playerStatId, aggregateForTest } from "../src/repos/sessionRepo";
import type { SidePlayer, MatchRecord } from "../src/repos/matchRepo";

function match(a: SidePlayer[], b: SidePlayer[], winner: "A" | "B"): MatchRecord {
  return {
    id: `m-${Math.random()}`,
    club_id: "c-1",
    session_id: "s-1",
    config: {} as MatchRecord["config"],
    side_a: a,
    side_b: b,
    status: "completed",
    winner,
    score_summary: { games: [{ A: 21, B: 15 }] },
    created_at: 1,
  };
}

test("playerStatId uses the club player id when the player is on a roster", () => {
  const p: SidePlayer = { club_player_id: "cp-1", name: "Rahul" };
  expect(playerStatId(p)).toBe("cp-1");
});

test("playerStatId falls back to a namespaced guest key when there is no roster id", () => {
  const p: SidePlayer = { club_player_id: null, name: "Rahul" };
  expect(playerStatId(p)).toBe("guest:Rahul");
});

test("a rostered player and a guest sharing a name get different ids", () => {
  expect(playerStatId({ club_player_id: "cp-1", name: "Rahul" }))
    .not.toBe(playerStatId({ club_player_id: null, name: "Rahul" }));
});

test("two guests sharing a name get the same id, which is the accepted limitation", () => {
  expect(playerStatId({ club_player_id: null, name: "Rahul" }))
    .toBe(playerStatId({ club_player_id: null, name: "Rahul" }));
});

const rahulOne: SidePlayer = { club_player_id: "cp-1", name: "Rahul" };
const rahulTwo: SidePlayer = { club_player_id: "cp-2", name: "Rahul" };
const sameer: SidePlayer = { club_player_id: "cp-3", name: "Sameer" };

test("two rostered players sharing a name stay separate rows", () => {
  const stats = aggregateForTest([
    match([rahulOne], [sameer], "A"),
    match([rahulTwo], [sameer], "B"),
  ]);
  const rahuls = stats.players.filter((p) => p.name === "Rahul");
  expect(rahuls).toHaveLength(2);
  expect(rahuls.map((p) => p.id).sort()).toEqual(["cp-1", "cp-2"]);
  expect(rahuls.find((p) => p.id === "cp-1")!.wins).toBe(1);
  expect(rahuls.find((p) => p.id === "cp-2")!.wins).toBe(0);
});

test("a rostered player and a same-named guest stay separate", () => {
  const guest: SidePlayer = { club_player_id: null, name: "Rahul" };
  const stats = aggregateForTest([match([rahulOne], [guest], "A")]);
  expect(stats.players.filter((p) => p.name === "Rahul")).toHaveLength(2);
});

test("two same-named guests still merge, the accepted limitation", () => {
  const guest: SidePlayer = { club_player_id: null, name: "Rahul" };
  const stats = aggregateForTest([
    match([guest], [sameer], "A"),
    match([guest], [sameer], "A"),
  ]);
  expect(stats.players.filter((p) => p.name === "Rahul")).toHaveLength(1);
  expect(stats.players.find((p) => p.name === "Rahul")!.wins).toBe(2);
});

test("every returned stat carries its id", () => {
  const stats = aggregateForTest([match([rahulOne], [sameer], "A")]);
  expect(stats.players.every((p) => typeof p.id === "string" && p.id.length > 0)).toBe(true);
});

test("sort order is deterministic for identical records and names", () => {
  const first = aggregateForTest([match([rahulOne], [rahulTwo], "A")]).players.map((p) => p.id);
  const second = aggregateForTest([match([rahulOne], [rahulTwo], "A")]).players.map((p) => p.id);
  expect(first).toEqual(second);
});
