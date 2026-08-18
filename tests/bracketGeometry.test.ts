import { elbowPath, isUpset, roundName, splitPairName } from "../src/tournament/bracketLabel";

test("round names come from rounds remaining, not the round number", () => {
  expect(roundName(3, 3)).toBe("FINAL");
  expect(roundName(2, 3)).toBe("SEMIS");
  expect(roundName(1, 3)).toBe("QUARTERS");
  // Same round number, different bracket size, different name.
  expect(roundName(3, 4)).toBe("SEMIS");
  expect(roundName(1, 6)).toBe("ROUND 1");
});

test("a flat run emits a straight line, never a curve", () => {
  expect(elbowPath(0, 50, 40, 50)).toBe("M0 50 H40");
});

test("an elbow curves once in each direction", () => {
  const p = elbowPath(0, 0, 40, 100);
  expect(p.match(/Q/g)).toHaveLength(2);
  expect(p.startsWith("M0 0")).toBe(true);
  expect(p.endsWith("H40")).toBe(true);
});

test("corner radius shrinks so the two corners cannot cross on a short run", () => {
  // 4px of vertical travel with the default 6px radius would overrun.
  const p = elbowPath(0, 0, 40, 4, 6);
  expect(p).toContain("Q20 0 20 2");
  expect(p).toContain("V2");
});

test("a doubles name splits into its two players", () => {
  expect(splitPairName("Ana / Bo")).toEqual(["Ana", "Bo"]);
});

test("a singles name stays one line", () => {
  expect(splitPairName("Ana")).toEqual(["Ana"]);
});

test("a name that merely contains a slash is not split", () => {
  expect(splitPairName("Ana/Bo")).toEqual(["Ana/Bo"]);
});

test("upset is seeding-inverted, and a bye is never one", () => {
  expect(isUpset(8, 1)).toBe(true);
  expect(isUpset(1, 8)).toBe(false);
  expect(isUpset(3, 3)).toBe(false);
  expect(isUpset(8, undefined)).toBe(false);
});
