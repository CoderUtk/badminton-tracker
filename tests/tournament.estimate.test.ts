import {
  estimateMinutes, formatEstimate, formatDuration, LONG_THRESHOLD_MINUTES,
} from "../src/tournament/estimate";
import { FORMATS } from "../src/tournament/formats";

test("match counts match hand-computed values", () => {
  expect(FORMATS.round_robin.matchCount(6)).toBe(15);
  expect(FORMATS.double_elim.matchCount(8)).toBe(14);
  expect(FORMATS.single_elim.matchCount(8)).toBe(7);
  expect(FORMATS.single_elim.matchCount(5)).toBe(7); // 8-draw with byes
});

test("more courts finish sooner", () => {
  expect(estimateMinutes(28, 3, 4)).toBeLessThan(estimateMinutes(28, 3, 2));
});

test("best-of-5 takes longer than best-of-3", () => {
  expect(estimateMinutes(10, 5, 4)).toBeGreaterThan(estimateMinutes(10, 3, 4));
});

test("zero matches takes zero minutes, and courts never divide by zero", () => {
  expect(estimateMinutes(0, 3, 4)).toBe(0);
  expect(estimateMinutes(10, 3, 0)).toBeGreaterThan(0);
});

test("a long round-robin is flagged, a knockout of the same size is not", () => {
  const rr = formatEstimate(FORMATS.round_robin, 16, 3, 4);
  const ko = formatEstimate(FORMATS.single_elim, 16, 3, 4);
  expect(rr.matches).toBe(120);
  expect(rr.long).toBe(true);
  expect(ko.long).toBe(false);
  expect(rr.minutes).toBeGreaterThan(LONG_THRESHOLD_MINUTES);
});

test("durations read the way a human would say them", () => {
  expect(formatDuration(50)).toBe("~50m");
  expect(formatDuration(100)).toBe("~1h40");
  expect(formatDuration(120)).toBe("~2h");
  expect(formatDuration(0)).toBe("~0m");
});
