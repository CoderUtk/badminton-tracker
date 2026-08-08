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
  created_at: number,
  overrides: Partial<Pick<MatchRecord, "config" | "session_id">> = {}
): MatchRecord {
  return {
    ...base,
    id,
    side_a: a.map((name) => ({ club_player_id: null, name })),
    side_b: b.map((name) => ({ club_player_id: null, name })),
    winner,
    score_summary: { games },
    created_at,
    ...overrides,
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

describe("playerAnalytics — new derived facts", () => {
  const day = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();

  test("earlyBird/nightOwl flag matches before 08:00 / at-or-after 20:00 local time", () => {
    const early = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 5, 7))],
      "Utkarsh"
    );
    expect(early.earlyBird).toBe(true);
    expect(early.nightOwl).toBe(false);

    const night = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 5, 20))],
      "Utkarsh"
    );
    expect(night.nightOwl).toBe(true);
    expect(night.earlyBird).toBe(false);

    const midday = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 5, 14))],
      "Utkarsh"
    );
    expect(midday.earlyBird).toBe(false);
    expect(midday.nightOwl).toBe(false);
  });

  test("weekendWarrior is true only when a Saturday and its Sunday both have a match", () => {
    // 2026-01-03 is a Saturday, 2026-01-04 is its Sunday.
    const both = playerAnalytics(
      [
        match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 3)),
        match("m2", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 4)),
      ],
      "Utkarsh"
    );
    expect(both.weekendWarrior).toBe(true);

    const satOnly = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 3))],
      "Utkarsh"
    );
    expect(satOnly.weekendWarrior).toBe(false);
  });

  test("dayStreak counts consecutive local days ending today or yesterday", () => {
    const now = day(2026, 0, 10, 18);
    const threeInARow = playerAnalytics(
      [
        match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 10, 9)),
        match("m2", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 9, 9)),
        match("m3", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 8, 9)),
      ],
      "Utkarsh",
      new Map(),
      now
    );
    expect(threeInARow.dayStreak).toBe(3);

    const gapBreaksIt = playerAnalytics(
      [
        match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 10, 9)),
        match("m2", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 7, 9)), // gap
      ],
      "Utkarsh",
      new Map(),
      now
    );
    expect(gapBreaksIt.dayStreak).toBe(1);

    const noMatchToday = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 9, 9))],
      "Utkarsh",
      new Map(),
      now // "now" is Jan 10, last match was Jan 9 (yesterday) — still counts
    );
    expect(noMatchToday.dayStreak).toBe(1);
  });

  test("maxMatchesInMonth and maxMatchesInDay track the busiest buckets", () => {
    const a = playerAnalytics(
      [
        match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 5, 9)),
        match("m2", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 5, 11)),
        match("m3", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 6, 9)),
        match("m4", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 1, 1, 9)),
      ],
      "Utkarsh"
    );
    expect(a.maxMatchesInDay).toBe(2); // Jan 5 had 2
    expect(a.maxMatchesInMonth).toBe(3); // January had 3
  });

  test("winStreak counts the current run from the most recent match, uncapped by the 8-entry form array", () => {
    const wins = Array.from({ length: 9 }, (_, i) =>
      match(`w${i}`, ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 20 - i))
    ); // 9 wins, newest first
    const a = playerAnalytics(wins, "Utkarsh");
    expect(a.form).toHaveLength(8); // display cap unchanged
    expect(a.winStreak).toBe(9); // full-history streak exceeds the cap

    const brokenAtFifth = [
      ...wins.slice(0, 4),
      match("loss", ["Utkarsh"], ["Bela"], "B", [{ A: 10, B: 21 }], day(2026, 0, 15)),
      ...wins.slice(5),
    ];
    const b = playerAnalytics(brokenAtFifth, "Utkarsh");
    expect(b.winStreak).toBe(4);
  });

  test("doublesPlayed counts only completed doubles matches", () => {
    const doublesConfig = { matchType: "doubles" } as import("../src/repos/matchRepo").MatchRecord["config"];
    const singlesConfig = { matchType: "singles" } as import("../src/repos/matchRepo").MatchRecord["config"];
    const a = playerAnalytics(
      [
        match("m1", ["Utkarsh", "Aarav"], ["Bela", "Soham"], "A", [{ A: 21, B: 10 }], day(2026, 0, 1), { config: doublesConfig }),
        match("m2", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 2), { config: singlesConfig }),
      ],
      "Utkarsh"
    );
    expect(a.doublesPlayed).toBe(1);
  });

  test("flawlessVictory: any won game where the loser scored under 5", () => {
    const cfg = { pointsToWin: 21 } as import("../src/repos/matchRepo").MatchRecord["config"];
    const a = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 4 }], day(2026, 0, 1), { config: cfg })],
      "Utkarsh"
    );
    expect(a.flawlessVictory).toBe(true);

    const b = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 5 }], day(2026, 0, 1), { config: cfg })],
      "Utkarsh"
    );
    expect(b.flawlessVictory).toBe(false);
  });

  test("nailBiter is relative to the match's own pointsToWin (deuce games)", () => {
    const cfg11 = { pointsToWin: 11 } as import("../src/repos/matchRepo").MatchRecord["config"];
    const deuceIn11 = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 13, B: 11 }], day(2026, 0, 1), { config: cfg11 })],
      "Utkarsh"
    );
    expect(deuceIn11.nailBiter).toBe(true);

    const normalIn11 = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 11, B: 6 }], day(2026, 0, 1), { config: cfg11 })],
      "Utkarsh"
    );
    expect(normalIn11.nailBiter).toBe(false);
  });

  test("comebackKid: won the match after losing the first game", () => {
    const a = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 15, B: 21 }, { A: 21, B: 18 }, { A: 21, B: 15 }], day(2026, 0, 1))],
      "Utkarsh"
    );
    expect(a.comebackKid).toBe(true);

    const b = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }, { A: 21, B: 15 }], day(2026, 0, 1))],
      "Utkarsh"
    );
    expect(b.comebackKid).toBe(false);
  });
});

describe("longestWinStreak", () => {
  const wl = (results: ("W" | "L")[]): MatchRecord[] =>
    // newest-first, matching how listAllMatches returns rows
    results.map((r, i) =>
      match(
        `x${i}`,
        ["Utkarsh"],
        ["Rival"],
        r === "W" ? "A" : "B",
        [{ A: 21, B: 10 }],
        1000 - i
      )
    );

  test("no matches -> 0", () => {
    expect(playerAnalytics([], "Utkarsh").longestWinStreak).toBe(0);
  });

  test("all losses -> 0", () => {
    expect(playerAnalytics(wl(["L", "L", "L"]), "Utkarsh").longestWinStreak).toBe(0);
  });

  test("finds the best run even when it is not the current one", () => {
    // newest-first: current run is 1, but there is a run of 3 further back
    const a = playerAnalytics(wl(["W", "L", "W", "W", "W", "L"]), "Utkarsh");
    expect(a.winStreak).toBe(1);
    expect(a.longestWinStreak).toBe(3);
  });

  test("equals winStreak when the best run is the current one", () => {
    const a = playerAnalytics(wl(["W", "W", "W", "W", "L", "W"]), "Utkarsh");
    expect(a.winStreak).toBe(4);
    expect(a.longestWinStreak).toBe(4);
  });

  test("ignores matches the player did not play in", () => {
    const mine = wl(["W", "W"]);
    const theirs = [match("o1", ["Soham"], ["Meera"], "A", [{ A: 21, B: 5 }], 500)];
    expect(playerAnalytics([...mine, ...theirs], "Utkarsh").longestWinStreak).toBe(2);
  });
});
