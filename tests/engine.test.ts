import {
  defaultConfig,
  MatchEvent,
  MatchState,
  pointSituation,
  reduce,
  replay,
  serviceCourt,
  serverName,
  TeamId,
  undo,
} from "../src/engine";

const start = (overrides = {}): MatchEvent[] => [
  { type: "MATCH_STARTED", config: defaultConfig(overrides), at: 0 },
];

function rally(events: MatchEvent[], by: TeamId, times = 1): MatchEvent[] {
  let out = events;
  for (let i = 0; i < times; i++) {
    let s = replay(out);
    if (s.phase === "interval") out = [...out, { type: "INTERVAL_ENDED", at: 0 }];
    out = [...out, { type: "RALLY_WON", by, at: 0 }];
  }
  return out;
}

const state = (events: MatchEvent[]): MatchState => replay(events);

describe("basic scoring", () => {
  test("rally win increments only the winner's score", () => {
    const s = state(rally(start(), "A"));
    expect(s.score).toEqual({ A: 1, B: 0 });
  });

  test("game won at 21 with 2-point lead", () => {
    const s = state(rally(rally(start(), "B", 10), "A", 21));
    expect(s.phase).toBe("game_over");
    expect(s.gamesWon.A).toBe(1);
  });

  test("20-20 requires a 2-point lead (no win at 21-20)", () => {
    let e = start();
    for (let i = 0; i < 20; i++) e = rally(rally(e, "A"), "B");
    e = rally(e, "A"); // 21-20
    expect(state(e).phase).toBe("playing");
    e = rally(e, "A"); // 22-20
    expect(state(e).phase).toBe("game_over");
  });

  test("29-29 golden point: first to 30 wins", () => {
    let e = start();
    for (let i = 0; i < 29; i++) e = rally(rally(e, "A"), "B");
    expect(state(e).score).toEqual({ A: 29, B: 29 });
    e = rally(e, "B");
    const s = state(e);
    expect(s.score.B).toBe(30);
    expect(s.phase).toBe("game_over");
    expect(s.gamesWon.B).toBe(1);
  });
});

describe("intervals", () => {
  test("interval fires when first team reaches 11, once per game", () => {
    let e = rally(start(), "A", 11);
    expect(state(e).phase).toBe("interval");
    e = [...e, { type: "INTERVAL_ENDED", at: 0 }];
    e = rally(e, "B", 11); // B reaching 11 later must NOT re-trigger
    expect(state(e).phase).toBe("playing");
  });

  test("scoring during interval throws", () => {
    const e = rally(start(), "A", 11);
    expect(() => reduce(state(e), { type: "RALLY_WON", by: "A", at: 0 })).toThrow();
  });
});

describe("service, doubles rotation", () => {
  test("server serves from right at even score, left at odd", () => {
    let e = start(); // 0-0, A serving
    expect(serviceCourt(state(e))).toBe("right");
    e = rally(e, "A"); // 1-0
    expect(serviceCourt(state(e))).toBe("left");
  });

  test("serving side scores: same server, courts swap", () => {
    let e = start();
    const before = state(e);
    e = rally(e, "A");
    const after = state(e);
    expect(after.servingTeam).toBe("A");
    expect(after.servingPlayer).toBe(before.servingPlayer);
    expect(after.positions.A.right).toBe(before.positions.A.left);
    expect(after.positions.A.left).toBe(before.positions.A.right);
  });

  test("side-out: receivers don't move; new server matches score parity", () => {
    let e = start(); // A0 serving
    const before = state(e);
    e = rally(e, "B"); // 0-1, B serves; B score odd -> left-court player serves
    const s = state(e);
    expect(s.servingTeam).toBe("B");
    expect(s.positions.B).toEqual(before.positions.B);
    expect(s.servingPlayer).toBe(before.positions.B.left);
  });

  test("BWF example sequence keeps alternating servers correctly", () => {
    // A serves and wins 2, then B wins 1, then A wins 1.
    let e = rally(start(), "A", 2); // A0 served from R then L, A pair swapped twice
    e = rally(e, "B"); // side-out at B=1 (odd): left-court B player serves
    const s1 = state(e);
    expect(s1.servingTeam).toBe("B");
    e = rally(e, "A"); // side-out at A=3 (odd): left-court A player serves
    const s2 = state(e);
    expect(s2.servingTeam).toBe("A");
    expect(s2.servingPlayer).toBe(s2.positions.A.left);
    expect(serviceCourt(s2)).toBe("left");
  });

  test("singles: server is always player 0, court follows parity", () => {
    let e = start({
      matchType: "singles",
      teams: {
        A: [{ id: "a", name: "Asha" }],
        B: [{ id: "b", name: "Bela" }],
      },
    });
    e = rally(e, "B", 3);
    const s = state(e);
    expect(s.servingTeam).toBe("B");
    expect(s.servingPlayer).toBe(0);
    expect(serviceCourt(s)).toBe("left"); // B has 3, odd
    expect(serverName(s)).toBe("Bela");
  });
});

describe("games and match", () => {
  const winGame = (e: MatchEvent[], t: TeamId) => rally(e, t, 21);

  test("best of 3: winner of game serves first in the next game", () => {
    let e = winGame(start(), "B");
    e = [...e, { type: "GAME_STARTED", at: 0 }];
    const s = state(e);
    expect(s.game).toBe(2);
    expect(s.score).toEqual({ A: 0, B: 0 });
    expect(s.servingTeam).toBe("B");
    expect(s.phase).toBe("playing");
  });

  test("match over after two games; third game not playable", () => {
    let e = winGame(start(), "A");
    e = [...e, { type: "GAME_STARTED", at: 0 }];
    e = winGame(e, "A");
    const s = state(e);
    expect(s.phase).toBe("match_over");
    expect(s.winner).toBe("A");
    expect(s.gamesWon).toEqual({ A: 2, B: 0 });
    expect(() => reduce(s, { type: "GAME_STARTED", at: 0 })).toThrow();
  });

  test("forfeit ends match with the other team winning", () => {
    const e = [...rally(start(), "A", 5), { type: "MATCH_FORFEITED", by: "A", at: 0 } as MatchEvent];
    const s = state(e);
    expect(s.phase).toBe("match_over");
    expect(s.winner).toBe("B");
  });
});

describe("game point / match point detection", () => {
  test("20-x is game point in game 1", () => {
    const s = state(rally(rally(start(), "B", 5), "A", 20));
    expect(pointSituation(s)).toEqual({ team: "A", kind: "game" });
  });

  test("29-29 is game point for both sides — reports one", () => {
    let e = start();
    for (let i = 0; i < 29; i++) e = rally(rally(e, "A"), "B");
    expect(pointSituation(state(e))).not.toBeNull();
  });

  test("20-x in game 2 after winning game 1 is match point", () => {
    let e = rally(start(), "A", 21);
    e = [...e, { type: "GAME_STARTED", at: 0 }];
    e = rally(rally(e, "B", 5), "A", 20);
    expect(pointSituation(state(e))).toEqual({ team: "A", kind: "match" });
  });
});

describe("undo and replay determinism", () => {
  test("undo restores full state including positions and server", () => {
    const e1 = rally(start(), "A", 3);
    const e2 = rally(e1, "B");
    expect(replay(undo(e2))).toEqual(replay(e1));
  });

  test("undo never removes MATCH_STARTED", () => {
    const e = start();
    expect(undo(e)).toHaveLength(1);
  });

  test("replay is deterministic", () => {
    const e = rally(rally(rally(start(), "A", 7), "B", 4), "A", 2);
    expect(replay(e)).toEqual(replay(e));
    expect(replay(e).rallies).toHaveLength(13);
  });

  test("undo across a game boundary reopens the game", () => {
    const e = rally(start(), "A", 21);
    const s = replay(undo(e));
    expect(s.phase).toBe("playing");
    expect(s.score.A).toBe(20);
    expect(s.gamesWon.A).toBe(0);
  });
});
