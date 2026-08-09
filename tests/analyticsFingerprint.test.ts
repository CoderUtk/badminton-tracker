import { fingerprintOf } from "../src/repos/analyticsCache";

test("changes when a match completes", () => {
  expect(fingerprintOf({ n: 10, newest: 1000, summaryLen: 500 }))
    .not.toBe(fingerprintOf({ n: 11, newest: 2000, summaryLen: 560 }));
});

test("is stable for identical inputs", () => {
  expect(fingerprintOf({ n: 10, newest: 1000, summaryLen: 500 }))
    .toBe(fingerprintOf({ n: 10, newest: 1000, summaryLen: 500 }));
});

test("catches a rewritten score summary that leaves count and max intact", () => {
  // The tripwire case: a backfill rewrites score_summary without adding rows,
  // so neither the count nor the max timestamp moves.
  expect(fingerprintOf({ n: 10, newest: 1000, summaryLen: 500 }))
    .not.toBe(fingerprintOf({ n: 10, newest: 1000, summaryLen: 610 }));
});

test("treats an empty table as a valid fingerprint", () => {
  expect(fingerprintOf({ n: 0, newest: 0, summaryLen: 0 })).toBeTruthy();
});
