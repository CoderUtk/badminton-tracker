import { drawSizeFor, startBlocker } from "../src/tournament/draw";

test("exact powers of two pass through unchanged", () => {
  expect(drawSizeFor(4)).toBe(4);
  expect(drawSizeFor(8)).toBe(8);
  expect(drawSizeFor(64)).toBe(64);
});

test("rounds up to the next power of two, leaving byes", () => {
  expect(drawSizeFor(5)).toBe(8);
  expect(drawSizeFor(6)).toBe(8);
  expect(drawSizeFor(9)).toBe(16);
  expect(drawSizeFor(33)).toBe(64);
});

test("floors at 4 because BracketSize has no 2", () => {
  expect(drawSizeFor(1)).toBe(4);
  expect(drawSizeFor(2)).toBe(4);
  expect(drawSizeFor(3)).toBe(4);
});

test("singles needs four players", () => {
  expect(startBlocker(3, "singles")).toBe("Add at least 4 players to start");
  expect(startBlocker(4, "singles")).toBeNull();
});

test("doubles needs six players, since four is a single final", () => {
  expect(startBlocker(4, "doubles")).toBe("Add at least 6 players to start");
  expect(startBlocker(5, "doubles")).toBe("Add at least 6 players to start");
  expect(startBlocker(6, "doubles")).toBeNull();
});

test("doubles requires complete pairs", () => {
  expect(startBlocker(7, "doubles")).toBe("Pair every player to start");
});

test("rejects more entrants than the largest draw", () => {
  // 64 is the largest BracketSize; silently capping would drop players who
  // had already joined.
  expect(startBlocker(65, "singles")).toBe("A tournament holds at most 64 entrants");
  expect(startBlocker(130, "doubles")).toBe("A tournament holds at most 64 entrants");
  expect(startBlocker(128, "doubles")).toBeNull();
});
