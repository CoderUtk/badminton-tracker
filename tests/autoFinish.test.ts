import { isStaleLive, AUTO_FINISH_HOURS } from "../src/session/autoFinish";

const HOUR = 60 * 60 * 1000;

test("not stale when status is not live", () => {
  expect(isStaleLive({ status: "scheduled", starts_at: 0 }, HOUR * 100)).toBe(false);
  expect(isStaleLive({ status: "done", starts_at: 0 }, HOUR * 100)).toBe(false);
});

test("not stale when live and within the window", () => {
  const now = 1000 * HOUR;
  expect(isStaleLive({ status: "live", starts_at: now - (AUTO_FINISH_HOURS - 1) * HOUR }, now)).toBe(false);
});

test("stale when live and older than the window", () => {
  const now = 1000 * HOUR;
  expect(isStaleLive({ status: "live", starts_at: now - (AUTO_FINISH_HOURS + 1) * HOUR }, now)).toBe(true);
});

test("exactly at the boundary is not yet stale", () => {
  const now = 1000 * HOUR;
  expect(isStaleLive({ status: "live", starts_at: now - AUTO_FINISH_HOURS * HOUR }, now)).toBe(false);
});
