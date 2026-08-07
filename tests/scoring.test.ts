import { applyPoint, deriveScoringConfig, GAME_FORMATS } from "../src/engine/scoring";

type Score = { A: number; B: number };

/** Replay a sequence of rally winners through applyPoint, returning the
 *  score/state/gameWinner after each step. */
function play(format: 11 | 15 | 21, winners: ("A" | "B")[]) {
  const cfg = GAME_FORMATS[format];
  let score: Score = { A: 0, B: 0 };
  const steps: { score: Score; state: string; gameWinner: string | null }[] = [];
  for (const w of winners) {
    const r = applyPoint(score, w, cfg);
    score = r.score;
    steps.push({ score: r.score, state: r.state, gameWinner: r.gameWinner });
  }
  return steps;
}

describe("GAME_FORMATS table", () => {
  test("matches the spec exactly", () => {
    expect(GAME_FORMATS[11]).toEqual({ targetScore: 11, maxScore: 15, deuceScore: 10, suddenDeathAt: 14 });
    expect(GAME_FORMATS[15]).toEqual({ targetScore: 15, maxScore: 20, deuceScore: 14, suddenDeathAt: 19 });
    expect(GAME_FORMATS[21]).toEqual({ targetScore: 21, maxScore: 30, deuceScore: 20, suddenDeathAt: 29 });
  });
});

describe("deriveScoringConfig", () => {
  test("deuceScore is targetScore - 1, suddenDeathAt is maxScore - 1", () => {
    expect(deriveScoringConfig(11, 15)).toEqual(GAME_FORMATS[11]);
    expect(deriveScoringConfig(15, 20)).toEqual(GAME_FORMATS[15]);
    expect(deriveScoringConfig(21, 30)).toEqual(GAME_FORMATS[21]);
  });
});

describe("normal game-winning rule", () => {
  test("11-point: 11-8 is a win, 10-9 is not", () => {
    const cfg = GAME_FORMATS[11];
    expect(applyPoint({ A: 10, B: 8 }, "A", cfg).gameWinner).toBe("A"); // 11-8
    expect(applyPoint({ A: 9, B: 9 }, "A", cfg).gameWinner).toBeNull(); // 10-9
  });
});

describe("11-point acceptance table", () => {
  // A wins every rally in this trace; scores below are cumulative.
  const winners: ("A" | "B")[] = [
    ..."A".repeat(10).split(""), // A: 0->10
    ..."B".repeat(9).split(""),  // B: 0->9   => 10-9
    "A",                          // 11-9      GAME WON
  ] as ("A" | "B")[];

  test("10-9 -> next point gives 11-9 -> GAME WON", () => {
    const steps = play(11, winners);
    const last = steps[steps.length - 1];
    expect(last.score).toEqual({ A: 11, B: 9 });
    expect(last.gameWinner).toBe("A");
    expect(last.state).toBe("GAME_OVER");
  });

  test("10-10 -> DEUCE, 11-10 -> ADVANTAGE, 11-11 -> DEUCE, 12-11 -> ADVANTAGE, 13-11 -> GAME WON", () => {
    const cfg = GAME_FORMATS[11];
    let score: Score = { A: 10, B: 9 };
    let r = applyPoint(score, "B", cfg); // 10-10
    expect(r.score).toEqual({ A: 10, B: 10 });
    expect(r.state).toBe("DEUCE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 11-10
    expect(r.state).toBe("ADVANTAGE");
    score = r.score;

    r = applyPoint(score, "B", cfg); // 11-11
    expect(r.state).toBe("DEUCE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 12-11
    expect(r.state).toBe("ADVANTAGE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 13-11
    expect(r.state).toBe("GAME_OVER");
    expect(r.gameWinner).toBe("A");
  });

  test("14-14 -> SUDDEN DEATH, 15-14 -> GAME WON, score never exceeds 15", () => {
    const cfg = GAME_FORMATS[11];
    let score: Score = { A: 13, B: 13 };
    let r = applyPoint(score, "A", cfg); // 14-13
    expect(r.state).toBe("ADVANTAGE");
    score = r.score;

    r = applyPoint(score, "B", cfg); // 14-14
    expect(r.score).toEqual({ A: 14, B: 14 });
    expect(r.state).toBe("SUDDEN_DEATH");
    expect(r.gameWinner).toBeNull();
    score = r.score;

    r = applyPoint(score, "A", cfg); // 15-14
    expect(r.score).toEqual({ A: 15, B: 14 });
    expect(r.state).toBe("GAME_OVER");
    expect(r.gameWinner).toBe("A");
    expect(r.score.A).toBeLessThanOrEqual(cfg.maxScore);
    expect(r.score.B).toBeLessThanOrEqual(cfg.maxScore);
  });
});

describe("15-point acceptance table", () => {
  test("14-13 -> 15-13 GAME WON", () => {
    const cfg = GAME_FORMATS[15];
    const r = applyPoint({ A: 14, B: 13 }, "A", cfg);
    expect(r.score).toEqual({ A: 15, B: 13 });
    expect(r.gameWinner).toBe("A");
  });

  test("14-14 DEUCE -> 15-14 ADVANTAGE -> 15-15 DEUCE -> 16-15 ADVANTAGE -> 17-15 GAME WON", () => {
    const cfg = GAME_FORMATS[15];
    let score: Score = { A: 13, B: 14 };
    let r = applyPoint(score, "A", cfg); // 14-14
    expect(r.state).toBe("DEUCE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 15-14
    expect(r.state).toBe("ADVANTAGE");
    score = r.score;

    r = applyPoint(score, "B", cfg); // 15-15
    expect(r.state).toBe("DEUCE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 16-15
    expect(r.state).toBe("ADVANTAGE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 17-15
    expect(r.state).toBe("GAME_OVER");
    expect(r.gameWinner).toBe("A");
  });

  test("19-19 -> SUDDEN DEATH, 20-19 -> GAME WON, score never exceeds 20", () => {
    const cfg = GAME_FORMATS[15];
    let score: Score = { A: 18, B: 19 };
    let r = applyPoint(score, "A", cfg); // 19-19
    expect(r.score).toEqual({ A: 19, B: 19 });
    expect(r.state).toBe("SUDDEN_DEATH");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 20-19
    expect(r.score).toEqual({ A: 20, B: 19 });
    expect(r.state).toBe("GAME_OVER");
    expect(r.gameWinner).toBe("A");
    expect(r.score.A).toBeLessThanOrEqual(cfg.maxScore);
  });
});

describe("21-point acceptance table", () => {
  test("20-19 -> 21-19 GAME WON", () => {
    const cfg = GAME_FORMATS[21];
    const r = applyPoint({ A: 20, B: 19 }, "A", cfg);
    expect(r.score).toEqual({ A: 21, B: 19 });
    expect(r.gameWinner).toBe("A");
  });

  test("20-20 DEUCE -> 21-20 ADVANTAGE -> 21-21 DEUCE -> 22-21 ADVANTAGE -> 23-21 GAME WON", () => {
    const cfg = GAME_FORMATS[21];
    let score: Score = { A: 19, B: 20 };
    let r = applyPoint(score, "A", cfg); // 20-20
    expect(r.state).toBe("DEUCE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 21-20
    expect(r.state).toBe("ADVANTAGE");
    score = r.score;

    r = applyPoint(score, "B", cfg); // 21-21
    expect(r.state).toBe("DEUCE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 22-21
    expect(r.state).toBe("ADVANTAGE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 23-21
    expect(r.state).toBe("GAME_OVER");
    expect(r.gameWinner).toBe("A");
  });

  test("29-29 -> SUDDEN DEATH, 30-29 -> GAME WON, score never exceeds 30", () => {
    const cfg = GAME_FORMATS[21];
    let score: Score = { A: 28, B: 29 };
    let r = applyPoint(score, "A", cfg); // 29-29
    expect(r.score).toEqual({ A: 29, B: 29 });
    expect(r.state).toBe("SUDDEN_DEATH");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 30-29
    expect(r.score).toEqual({ A: 30, B: 29 });
    expect(r.state).toBe("GAME_OVER");
    expect(r.gameWinner).toBe("A");
    expect(r.score.A).toBeLessThanOrEqual(cfg.maxScore);
  });
});

describe("determinism", () => {
  test("the same sequence always produces the same result", () => {
    const cfg = GAME_FORMATS[21];
    const winners: ("A" | "B")[] = ["A", "B", "A", "A", "B", "B", "A"];
    const run = () => {
      let score: Score = { A: 0, B: 0 };
      let last;
      for (const w of winners) {
        last = applyPoint(score, w, cfg);
        score = last.score;
      }
      return last;
    };
    expect(run()).toEqual(run());
  });
});
