import { buildMomentum, momentumHeadline } from "../src/lib/matchMomentum";
import type { MatchEvent, TeamId } from "../src/engine";

let at = 0;
const rallies = (s: string): MatchEvent[] =>
  s.split("").map((c) => ({ type: "RALLY_WON", by: c as TeamId, at: ++at }));
const gameBreak = (): MatchEvent => ({ type: "GAME_STARTED", at: ++at });

describe("buildMomentum", () => {
  it("tracks the running differential with a leading baseline sample", () => {
    const m = buildMomentum(rallies("AAB"), "A");
    expect(m.games).toHaveLength(1);
    expect(m.games[0].diff).toEqual([0, 1, 2, 1]);
  });

  it("resets the differential at a game break and numbers the games", () => {
    const m = buildMomentum([...rallies("AA"), gameBreak(), ...rallies("BB")], "A");
    expect(m.games.map((g) => g.game)).toEqual([1, 2]);
    expect(m.games[1].diff).toEqual([0, -1, -2]);
  });

  it("drops a game that opened but never had a rally", () => {
    const m = buildMomentum([...rallies("AA"), gameBreak()], "A");
    expect(m.games).toHaveLength(1);
  });

  it("reports the biggest lead and who held it", () => {
    const m = buildMomentum(rallies("BBBBAA"), "A");
    expect(m.biggestLead).toEqual({ side: "B", points: 4 });
  });

  it("measures the winner's deepest deficit within a single game", () => {
    const m = buildMomentum(rallies("BBBBBAAAAAA"), "A");
    expect(m.comebackFrom).toBe(5);
  });

  it("does not carry a deficit across a game break", () => {
    // 5 down in game 1, but A wins game 2 from level: no 5-point comeback.
    const m = buildMomentum([...rallies("BBBBB"), gameBreak(), ...rallies("AAA")], "A");
    expect(m.comebackFrom).toBe(5);
    const clean = buildMomentum([...rallies("AAAAA"), gameBreak(), ...rallies("AAA")], "A");
    expect(clean.comebackFrom).toBe(0);
  });

  it("leaves comebackFrom at zero when there is no winner yet", () => {
    expect(buildMomentum(rallies("BBBB"), null).comebackFrom).toBe(0);
  });

  it("carries a run across a game break", () => {
    const m = buildMomentum([...rallies("AAA"), gameBreak(), ...rallies("AA")], "A");
    expect(m.longestRun).toEqual({ side: "A", points: 5 });
  });

  it("returns empty structure for a match with no rallies", () => {
    const m = buildMomentum([], "A");
    expect(m).toEqual({ games: [], biggestLead: null, comebackFrom: 0, longestRun: null });
  });
});

describe("momentumHeadline", () => {
  const nameOf = (s: TeamId) => (s === "A" ? "Ana" : "Bo");

  it("leads with the comeback when the winner was 4+ down", () => {
    const m = buildMomentum(rallies("BBBBAAAAA"), "A");
    expect(momentumHeadline(m, nameOf)).toBe("Came back from 4 points down.");
  });

  it("falls back to a long run", () => {
    const m = buildMomentum(rallies("AAAAAAB"), "A");
    expect(momentumHeadline(m, nameOf)).toBe("Ana reeled off 6 straight.");
  });

  it("calls out a match that stayed tight", () => {
    const m = buildMomentum(rallies("ABABAB"), "A");
    expect(momentumHeadline(m, nameOf)).toBe("Never more than 3 points apart.");
  });

  it("says nothing about a routine match", () => {
    const m = buildMomentum(rallies("AABAABAAB"), "A");
    expect(momentumHeadline(m, nameOf)).toBeNull();
  });
});
