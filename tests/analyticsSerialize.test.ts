import { serializeAnalytics, deserializeAnalytics } from "../src/analytics/serialize";
import { playerAnalytics } from "../src/analytics/player";
import type { MatchRecord } from "../src/repos/matchRepo";

const match = (over: Partial<MatchRecord> = {}): MatchRecord => ({
  id: "m1", club_id: "c1", session_id: "s1",
  config: { matchType: "singles", pointsToWin: 21, bestOf: 3 } as MatchRecord["config"],
  side_a: [{ club_player_id: "p1", name: "Ana" }],
  side_b: [{ club_player_id: "p2", name: "Bo" }],
  status: "completed", winner: "A",
  score_summary: { games: [{ A: 21, B: 15 }, { A: 21, B: 18 }] },
  created_at: Date.UTC(2026, 7, 1, 12, 0), ...over,
});

test("round-trips venues as a Set, not an empty object", () => {
  const a = playerAnalytics([match()], "Ana", new Map([["s1", "Main Hall"]]));
  expect(a.venues.has("Main Hall")).toBe(true);
  const back = deserializeAnalytics(serializeAnalytics(a));
  expect(back).not.toBeNull();
  expect(back!.venues).toBeInstanceOf(Set);
  expect(back!.venues.has("Main Hall")).toBe(true);
});

test("naive JSON.stringify would have lost venues", () => {
  // Documents exactly why this module exists.
  const a = playerAnalytics([match()], "Ana", new Map([["s1", "Main Hall"]]));
  expect(JSON.parse(JSON.stringify(a)).venues).toEqual({});
});

test("preserves every scalar and array field", () => {
  const a = playerAnalytics([match()], "Ana", new Map());
  const back = deserializeAnalytics(serializeAnalytics(a))!;
  expect(back.played).toBe(a.played);
  expect(back.wins).toBe(a.wins);
  expect(back.winPct).toBe(a.winPct);
  expect(back.form).toEqual(a.form);
  expect(back.recent).toEqual(a.recent);
  expect(back.bestPartner).toEqual(a.bestPartner);
  expect(back.longestWinStreak).toBe(a.longestWinStreak);
  expect(back.flawlessVictory).toBe(a.flawlessVictory);
});

test("returns null on corrupt JSON rather than throwing", () => {
  expect(deserializeAnalytics("{not json")).toBeNull();
});

test("returns null when the payload is missing required fields", () => {
  expect(deserializeAnalytics('{"played":3}')).toBeNull();
});
