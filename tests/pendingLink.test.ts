import { setPendingLink, consumePendingLink } from "../src/lib/pendingLink";

beforeEach(() => { consumePendingLink(); });

test("returns null when nothing is pending", () => {
  expect(consumePendingLink()).toBeNull();
});

test("returns the stored path exactly once", () => {
  setPendingLink("join/club/abc");
  expect(consumePendingLink()).toBe("join/club/abc");
  expect(consumePendingLink()).toBeNull();
});

test("the newest path wins", () => {
  setPendingLink("join/club/first");
  setPendingLink("join/club/second");
  expect(consumePendingLink()).toBe("join/club/second");
});
