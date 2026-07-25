import { playerAnalytics } from "../src/analytics/player";
import type { MatchRecord } from "../src/repos/matchRepo";

const base = {
  club_id: null,
  session_id: null,
  status: "completed" as const,
  config: {} as MatchRecord["config"],
};

function match(
  id: string,
  a: string[],
  b: string[],
  winner: "A" | "B" | null,
  games: { A: number; B: number }[],
  created_at: number
): MatchRecord {
  return {
    ...base,
    id,
    side_a: a.map((name) => ({ club_player_id: null, name })),
    side_b: b.map((name) => ({ club_player_id: null, name })),
    winner,
    score_summary: { games },
    created_at,
  };
}

describe("playerAnalytics", () => {
  const matches: MatchRecord[] = [
    // newest first
    match("m3", ["Utkarsh", "Aarav"], ["Soham", "Meera"], "B", [{ A: 18, B: 21 }, { A: 15, B: 21 }], 300),
    match("m2", ["Utkarsh", "Dhiraj"], ["Soham", "Meera"], "A", [{ A: 21, B: 12 }, { A: 21, B: 19 }], 200),
    match("m1", ["Utkarsh", "Dhiraj"], ["Aarav", "Meera"], "A", [{ A: 21, B: 17 }, { A: 19, B: 21 }, { A: 21, B: 15 }], 100),
  ];

  const a = playerAnalytics(matches, "Utkarsh");

  test("counts wins, losses and win%", () => {
    expect(a.played).toBe(3);
    expect(a.wins).toBe(2);
    expect(a.losses).toBe(1);
    expect(a.winPct).toBe(67);
  });

  test("form is newest-first", () => {
    expect(a.form).toEqual(["L", "W", "W"]);
  });

  test("best partner is the one with most wins alongside", () => {
    expect(a.bestPartner?.name).toBe("Dhiraj");
    expect(a.bestPartner?.wins).toBe(2);
  });

  test("toughest opponent is who they lost to", () => {
    // Utkarsh only lost m3 (vs Soham & Meera). Meera also beat/faced across others.
    expect(a.toughestOpponent?.losses).toBe(1);
    expect(["Soham", "Meera"]).toContain(a.toughestOpponent?.name);
  });

  test("tallies games and points from both sides' perspective", () => {
    expect(a.gamesWon).toBe(4); // m1: 2, m2: 2, m3: 0
    expect(a.gamesLost).toBe(3); // m1: 1, m2: 0, m3: 2
    expect(a.pointsFor).toBeGreaterThan(0);
  });

  test("ignores players not in the match", () => {
    const none = playerAnalytics(matches, "Nobody");
    expect(none.played).toBe(0);
    expect(none.bestPartner).toBeNull();
  });
});
