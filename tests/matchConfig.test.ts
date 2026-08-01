import { buildTournamentConfig } from "../src/tournament/matchConfig";

test("doubles config puts two players on each side", () => {
  const cfg = buildTournamentConfig(
    [{ id: "a1", name: "A1" }, { id: "a2", name: "A2" }],
    [{ id: "b1", name: "B1" }, { id: "b2", name: "B2" }],
    "doubles", 3,
  );
  expect(cfg.matchType).toBe("doubles");
  expect(cfg.teams.A).toHaveLength(2);
  expect(cfg.teams.B).toHaveLength(2);
  expect(cfg.bestOf).toBe(3);
});

test("singles config puts one player on each side", () => {
  const cfg = buildTournamentConfig([{ id: "a", name: "A" }], [{ id: "b", name: "B" }], "singles", 5);
  expect(cfg.matchType).toBe("singles");
  expect(cfg.teams.A).toHaveLength(1);
  expect(cfg.bestOf).toBe(5);
});
