import { isGuestAllowedSegments } from "../src/lib/gateRedirect";

test("guest shell and its sub-routes are allowed", () => {
  expect(isGuestAllowedSegments(["guest"])).toBe(true);
  expect(isGuestAllowedSegments(["guest", "spectate"])).toBe(true);
  expect(isGuestAllowedSegments(["guest", "matches"])).toBe(true);
});

test("quick match screens are allowed", () => {
  expect(isGuestAllowedSegments(["new-match"])).toBe(true);
  expect(isGuestAllowedSegments(["score", "[matchId]"])).toBe(true);
});

test("only the spectator join route is allowed, not player or scorer", () => {
  expect(isGuestAllowedSegments(["join", "tournament", "t-1", "spectator"])).toBe(true);
  expect(isGuestAllowedSegments(["join", "tournament", "t-1"])).toBe(false);
  expect(isGuestAllowedSegments(["join", "tournament", "t-1", "scorer"])).toBe(false);
  expect(isGuestAllowedSegments(["join", "club", "c-1"])).toBe(false);
});

test("app tabs and auth screens are not allowed", () => {
  expect(isGuestAllowedSegments(["(app)"])).toBe(false);
  expect(isGuestAllowedSegments(["(auth)"])).toBe(false);
  expect(isGuestAllowedSegments(["welcome"])).toBe(false);
  expect(isGuestAllowedSegments([])).toBe(false);
});
