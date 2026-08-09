import { notificationRoute } from "../src/lib/notificationRoute";

test("routes a friend request to the friends screen", () => {
  expect(notificationRoute({ type: "friend_request" })).toBe("/(app)/profile/friends");
});

test("routes a join request to that club's request queue", () => {
  expect(notificationRoute({ type: "join_request", clubId: "club-9" })).toBe(
    "/(app)/clubs/requests/club-9",
  );
});

test("routes a session reminder to the session", () => {
  expect(notificationRoute({ type: "session", sessionId: "s-3" })).toBe(
    "/(app)/sessions/s-3",
  );
});

test("returns null when a required id is missing", () => {
  // The payload crosses a process boundary and arrives untyped. A missing id
  // must not produce a route to `/undefined`.
  expect(notificationRoute({ type: "join_request" })).toBeNull();
  expect(notificationRoute({ type: "session" })).toBeNull();
  expect(notificationRoute({ type: "join_request", clubId: 7 })).toBeNull();
});

test("returns null for unknown, empty and malformed payloads", () => {
  expect(notificationRoute({ type: "something_else" })).toBeNull();
  expect(notificationRoute({})).toBeNull();
  expect(notificationRoute(null)).toBeNull();
  expect(notificationRoute(undefined)).toBeNull();
  expect(notificationRoute("friend_request")).toBeNull();
});
