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

  test("groups similar-rated players onto the same court", () => {
    const rated: MatchPlayer[] = [
      { id: "A", name: "A", rating: 1000 },
      { id: "B", name: "B", rating: 1100 },
      { id: "C", name: "C", rating: 1200 },
      { id: "D", name: "D", rating: 1300 },
      { id: "E", name: "E", rating: 1900 },
      { id: "F", name: "F", rating: 2000 },
      { id: "G", name: "G", rating: 2100 },
      { id: "H", name: "H", rating: 2200 },
    ];
    const result = generateMatchups(rated, 2);
    for (const match of result.matches) {
      const ids = new Set([...match.teamA, ...match.teamB].map((p) => p.id));
      const allLow = ["A", "B", "C", "D"].every((id) => ids.has(id));
      const allHigh = ["E", "F", "G", "H"].every((id) => ids.has(id));
      expect(allLow || allHigh).toBe(true);
    }
  });

  test("splits a court's teams to minimise the rating gap", () => {
    const rated: MatchPlayer[] = [
      { id: "A", name: "A", rating: 1000 },
      { id: "B", name: "B", rating: 1000 },
      { id: "C", name: "C", rating: 2000 },
      { id: "D", name: "D", rating: 2000 },
    ];
    const result = generateMatchups(rated, 1);
    const teamAIds = result.matches[0].teamA.map((p) => p.id).sort();
    // Balanced splits are A+C vs B+D or A+D vs B+C (3000 vs 3000); the
    // unbalanced A+B vs C+D (2000 vs 4000) must not be chosen.
    expect(["A,C", "A,D"]).toContain(teamAIds.join(","));
  });

  test("missing ratings default to 1500 and leave rotation order unchanged", () => {
    const result = generateMatchups(players.slice(0, 6), 2);
    expect(result.waiting.map((player) => player.id)).toEqual(["E", "F"]);
  });

  test("does not crash when the prior round contains singles matches", () => {
    const singlesRound = generateMatchups(players.slice(0, 2), 1, [], 0, "singles").matches;
    expect(() => generateMatchups(players.slice(0, 4), 1, singlesRound, 1, "doubles")).not.toThrow();
  });
});
