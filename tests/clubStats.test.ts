const listMatchesForClub = jest.fn();
jest.mock("../src/repos/matchRepo", () => ({
  listMatchesForClub: (...a: unknown[]) => listMatchesForClub(...a),
}));

import { getClubStats } from "../src/repos/sessionRepo";
import type { MatchRecord } from "../src/repos/matchRepo";

beforeEach(() => {
  listMatchesForClub.mockReset();
});

test("a club with members but zero completed matches reports an empty players array", async () => {
  // This is audit H5's exact shape: SessionStats.players is derived from
  // completed matches with a recorded winner, not from club membership. A
  // 3-member club with no finished matches legitimately has players: [].
  // The UI must not read this array for a roster-size stat — it must read
  // the club's player roster instead (see clubs/[id].tsx).
  listMatchesForClub.mockResolvedValue([]);

  const stats = await getClubStats("club-1");

  expect(stats.matchCount).toBe(0);
  expect(stats.gameCount).toBe(0);
  expect(stats.players).toEqual([]);
});

test("matchCount and gameCount count every completed match regardless of winner", async () => {
  const matches: MatchRecord[] = [
    {
      id: "m1", club_id: "club-1", session_id: null, config: {} as MatchRecord["config"],
      side_a: [{ club_player_id: null, name: "A" }], side_b: [{ club_player_id: null, name: "B" }],
      status: "completed", winner: "A", score_summary: { games: [{ A: 21, B: 10 }, { A: 21, B: 15 }] }, created_at: 1,
    },
    {
      id: "m2", club_id: "club-1", session_id: null, config: {} as MatchRecord["config"],
      side_a: [{ club_player_id: null, name: "A" }], side_b: [{ club_player_id: null, name: "B" }],
      status: "live", winner: null, score_summary: null, created_at: 2,
    },
  ];
  listMatchesForClub.mockResolvedValue(matches);

  const stats = await getClubStats("club-1");

  // Only the completed match counts; the live one is excluded, matching the
  // header's "matches" and "games" tiles.
  expect(stats.matchCount).toBe(1);
  expect(stats.gameCount).toBe(2);
});
