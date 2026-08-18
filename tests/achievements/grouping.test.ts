import { groupBadges, NEXT_UP_LIMIT } from "../../src/achievements/grouping";
import type { EarnedBadge } from "../../src/achievements/types";

const b = (id: string, earned: boolean, progress: number): EarnedBadge => ({
  id, title: id, description: `desc ${id}`, icon: "trophy", earned, progress,
});

test("every badge lands in exactly one group", () => {
  const input = [
    b("a", true, 1), b("b", false, 0.5), b("c", false, 0),
    b("d", true, 1), b("e", false, 0.9), b("f", false, 0),
  ];
  const g = groupBadges(input);
  const ids = [...g.earned, ...g.nextUp, ...g.locked].map((x) => x.id).sort();
  expect(ids).toEqual(["a", "b", "c", "d", "e", "f"]);
  expect(new Set(ids).size).toBe(input.length);
});

test("next up is sorted by progress descending and capped at the limit", () => {
  const input = [
    b("low", false, 0.1), b("high", false, 0.9),
    b("mid", false, 0.5), b("tiny", false, 0.05),
  ];
  const g = groupBadges(input);
  expect(g.nextUp).toHaveLength(NEXT_UP_LIMIT);
  expect(g.nextUp.map((x) => x.id)).toEqual(["high", "mid", "low"]);
});

test("an unearned badge with zero progress is locked, not next up", () => {
  const g = groupBadges([b("zero", false, 0)]);
  expect(g.nextUp).toEqual([]);
  expect(g.locked.map((x) => x.id)).toEqual(["zero"]);
});

test("an earned badge with partial progress is still earned", () => {
  const g = groupBadges([b("odd", true, 0.4)]);
  expect(g.earned.map((x) => x.id)).toEqual(["odd"]);
  expect(g.nextUp).toEqual([]);
  expect(g.locked).toEqual([]);
});

test("earned keeps definition order, not progress order", () => {
  const g = groupBadges([b("first", true, 1), b("second", true, 1), b("third", true, 1)]);
  expect(g.earned.map((x) => x.id)).toEqual(["first", "second", "third"]);
});

test("empty input yields three empty groups", () => {
  expect(groupBadges([])).toEqual({ earned: [], nextUp: [], locked: [] });
});

test("the input array is not mutated", () => {
  const input = [b("low", false, 0.1), b("high", false, 0.9)];
  groupBadges(input);
  expect(input.map((x) => x.id)).toEqual(["low", "high"]);
});
