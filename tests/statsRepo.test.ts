const listMatches = jest.fn();
const getSessionLocations = jest.fn();
jest.mock("../src/repos/matchRepo", () => ({ listMatches: (...a: unknown[]) => listMatches(...a) }));
jest.mock("../src/repos/sessionRepo", () => ({ getSessionLocations: (...a: unknown[]) => getSessionLocations(...a) }));

import { getPlayerAnalytics } from "../src/repos/statsRepo";
import type { MatchRecord } from "../src/repos/matchRepo";

beforeEach(() => {
  listMatches.mockReset();
  getSessionLocations.mockReset();
});

test("looks up locations only for the distinct session ids the player's matches reference", async () => {
  const matches: MatchRecord[] = [
    {
      id: "m1", club_id: null, session_id: "s1", config: {} as MatchRecord["config"],
      side_a: [{ club_player_id: null, name: "Utkarsh" }], side_b: [{ club_player_id: null, name: "Bela" }],
      status: "completed", winner: "A", score_summary: { games: [{ A: 21, B: 10 }] }, created_at: 1,
    },
    {
      id: "m2", club_id: null, session_id: "s1", config: {} as MatchRecord["config"],
      side_a: [{ club_player_id: null, name: "Utkarsh" }], side_b: [{ club_player_id: null, name: "Bela" }],
      status: "completed", winner: "A", score_summary: { games: [{ A: 21, B: 10 }] }, created_at: 2,
    },
    {
      id: "m3", club_id: null, session_id: null, config: {} as MatchRecord["config"],
      side_a: [{ club_player_id: null, name: "Utkarsh" }], side_b: [{ club_player_id: null, name: "Bela" }],
      status: "completed", winner: "A", score_summary: { games: [{ A: 21, B: 10 }] }, created_at: 3,
    },
  ];
  listMatches.mockResolvedValue(matches);
  getSessionLocations.mockResolvedValue(new Map([["s1", "Court 5"]]));

  const a = await getPlayerAnalytics("Utkarsh");

  expect(getSessionLocations).toHaveBeenCalledWith(["s1"]);
  expect(a.venues).toEqual(new Set(["Court 5"]));
});
