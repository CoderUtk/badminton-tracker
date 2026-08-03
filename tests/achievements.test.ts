import { evaluateBadges } from "../src/achievements/rules";

const base = { played: 0, wins: 0, losses: 0, winPct: 0, gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0, form: [] as ("W" | "L")[], recent: [] as unknown[] };

test("no play -> nothing earned, first-win at 0 progress", () => {
  const b = evaluateBadges(base as any);
  expect(b.every((x) => !x.earned)).toBe(true);
  expect(b.find((x) => x.id === "first_win")!.progress).toBe(0);
});

test("first win earns first_win and shows partial toward 10-win badge", () => {
  const b = evaluateBadges({ ...base, played: 1, wins: 1, winPct: 100, form: ["W"] } as any);
  expect(b.find((x) => x.id === "first_win")!.earned).toBe(true);
  expect(b.find((x) => x.id === "wins_10")!.earned).toBe(false);
  expect(b.find((x) => x.id === "wins_10")!.progress).toBeCloseTo(0.1, 5);
});

test("five-win streak earns the streak badge", () => {
  const b = evaluateBadges({ ...base, played: 6, wins: 5, form: ["W", "W", "W", "W", "W"] } as any);
  expect(b.find((x) => x.id === "streak_5")!.earned).toBe(true);
});
