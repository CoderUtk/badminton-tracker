import { generateMatchups, type MatchPlayer } from "../src/matchmaking/generator";

const players: MatchPlayer[] = ["A", "B", "C", "D", "E", "F", "G", "H"].map((name) => ({ id: name, name }));

describe("generateMatchups", () => {
  test("uses only complete courts and keeps extras waiting", () => {
    const result = generateMatchups(players.slice(0, 6), 2);
    expect(result.matches).toHaveLength(1);
    expect(result.waiting.map((player) => player.id)).toEqual(["E", "F"]);
  });

  test("honours the number of available courts", () => {
    const result = generateMatchups(players, 1);
    expect(result.matches).toHaveLength(1);
    expect(new Set(result.matches.flatMap((match) => [...match.teamA, ...match.teamB]).map((p) => p.id)).size).toBe(4);
    expect(result.waiting).toHaveLength(4);
  });

  test("changes partnerships when given the prior round", () => {
    const first = generateMatchups(players.slice(0, 4), 1, [], 0).matches;
    const second = generateMatchups(players.slice(0, 4), 1, first, 1).matches;
    const firstPairs = first.flatMap((match) => [match.teamA, match.teamB]).map((team) => team.map((p) => p.id).sort().join(":"));
    const secondPairs = second.flatMap((match) => [match.teamA, match.teamB]).map((team) => team.map((p) => p.id).sort().join(":"));
    expect(secondPairs.some((pair) => firstPairs.includes(pair))).toBe(false);
  });

  test("is deterministic for the same inputs", () => {
    expect(generateMatchups(players, 2, [], 3)).toEqual(generateMatchups(players, 2, [], 3));
  });

  test("auto-selects singles when fewer than four players", () => {
    const result = generateMatchups(players.slice(0, 2), 2);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].mode).toBe("singles");
    expect(result.matches[0].teamA).toHaveLength(1);
    expect(result.matches[0].teamB).toHaveLength(1);
  });

  test("singles mode fills courts two players at a time", () => {
    const result = generateMatchups(players.slice(0, 6), 2, [], 0, "singles");
    expect(result.matches).toHaveLength(2);
    expect(result.waiting).toHaveLength(2);
    expect(result.matches.every((m) => m.mode === "singles")).toBe(true);
  });

  test("auto-selects doubles with four or more players", () => {
    expect(generateMatchups(players, 1).matches[0].mode).toBe("doubles");
  });
});
