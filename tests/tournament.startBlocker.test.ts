import { startBlocker } from "../src/tournament/draw";

test("knockout keeps today's minimums exactly", () => {
  expect(startBlocker(3, "singles", "single_elim")).toMatch(/at least 4/);
  expect(startBlocker(4, "singles", "single_elim")).toBeNull();
  expect(startBlocker(5, "doubles", "single_elim")).toMatch(/at least 6/);
  expect(startBlocker(6, "doubles", "single_elim")).toBeNull();
});

test("round-robin runs with three", () => {
  expect(startBlocker(3, "singles", "round_robin")).toBeNull();
  expect(startBlocker(2, "singles", "round_robin")).toMatch(/at least 3/);
});

test("groups need enough entrants to make groups", () => {
  expect(startBlocker(5, "singles", "groups_knockout")).toMatch(/at least 6/);
  expect(startBlocker(6, "singles", "groups_knockout")).toBeNull();
});

test("pairing and the 64-entrant ceiling still apply to every format", () => {
  expect(startBlocker(7, "doubles", "round_robin")).toMatch(/Pair every player/);
  expect(startBlocker(130, "singles", "round_robin")).toMatch(/at most 64/);
});

test("an unknown format falls back to knockout rather than crashing", () => {
  expect(startBlocker(4, "singles", "nonsense" as never)).toBeNull();
});
