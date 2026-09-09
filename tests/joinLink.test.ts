import { buildClubJoinPath, buildSessionJoinPath, buildTournamentScorerJoinPath, buildTournamentSpectatorJoinPath, joinRouteFor, parseJoinTarget } from "../src/lib/joinLink";

test("builds a club join path without a scheme", () => {
  expect(buildClubJoinPath("abc-123")).toBe("join/club/abc-123");
});

test("a tournament link without a role segment means player", () => {
  expect(parseJoinTarget("badminton://join/tournament/t-1"))
    .toEqual({ kind: "tournament", id: "t-1", role: "player" });
});

test("parses the scorer role segment", () => {
  expect(parseJoinTarget("badminton://join/tournament/t-1/scorer"))
    .toEqual({ kind: "tournament", id: "t-1", role: "scorer" });
  expect(parseJoinTarget("https://join.example.com/tournament/t-1/scorer"))
    .toEqual({ kind: "tournament", id: "t-1", role: "scorer" });
});

test("an unknown trailing segment is not a role", () => {
  expect(parseJoinTarget("badminton://join/tournament/t-1/bogus"))
    .toEqual({ kind: "tournament", id: "t-1", role: "player" });
});

test("club links carry the player role", () => {
  expect(parseJoinTarget("badminton://join/club/abc-123"))
    .toEqual({ kind: "club", id: "abc-123", role: "player" });
});

test("builds a scorer path", () => {
  expect(buildTournamentScorerJoinPath("t-1")).toBe("join/tournament/t-1/scorer");
});

test("parses a custom-scheme deep link", () => {
  expect(parseJoinTarget("badminton://join/club/abc-123")).toEqual({ kind: "club", id: "abc-123", role: "player" });
});

test("parses an https link and a bare path", () => {
  expect(parseJoinTarget("https://example.com/join/club/xyz")).toEqual({ kind: "club", id: "xyz", role: "player" });
  expect(parseJoinTarget("join/club/xyz")).toEqual({ kind: "club", id: "xyz", role: "player" });
});

test("ignores query strings and trailing slashes", () => {
  expect(parseJoinTarget("badminton://join/club/xyz/?ref=share")).toEqual({ kind: "club", id: "xyz", role: "player" });
});

test("returns null for unrelated or malformed links", () => {
  expect(parseJoinTarget("badminton://score/123")).toBeNull();
  expect(parseJoinTarget("badminton://join/club/")).toBeNull();
  expect(parseJoinTarget("badminton://join/tournament/")).toBeNull();
  expect(parseJoinTarget("")).toBeNull();
});

test("parses a tournament join link", () => {
  expect(parseJoinTarget("badminton://join/tournament/t-1")).toEqual({ kind: "tournament", id: "t-1", role: "player" });
  expect(parseJoinTarget("https://join.example.com/tournament/t-1")).toEqual({ kind: "tournament", id: "t-1", role: "player" });
  expect(parseJoinTarget("join/tournament/[id]")).toBeNull();
});

test("parses an https link served from a join subdomain", () => {
  expect(parseJoinTarget("https://join.example.com/club/abc-123")).toEqual({ kind: "club", id: "abc-123", role: "player" });
});

test("parses an https link where the path also contains join", () => {
  expect(parseJoinTarget("https://join.example.com/join/club/abc-123")).toEqual({ kind: "club", id: "abc-123", role: "player" });
});

test("rejects an unresolved route segment placeholder", () => {
  expect(parseJoinTarget("join/club/[id]")).toBeNull();
  expect(parseJoinTarget("badminton://join/club/[id]")).toBeNull();
});

test("accepts a leading-slash resolved pathname", () => {
  expect(parseJoinTarget("/join/club/abc-123")).toEqual({ kind: "club", id: "abc-123", role: "player" });
});

test("builds a tournament spectator path", () => {
  expect(buildTournamentSpectatorJoinPath("t-1")).toBe("join/tournament/t-1/spectator");
});

test("parses the spectator role segment", () => {
  expect(parseJoinTarget("badminton://join/tournament/t-1/spectator"))
    .toEqual({ kind: "tournament", id: "t-1", role: "spectator" });
  expect(parseJoinTarget("https://join.example.com/tournament/t-1/spectator"))
    .toEqual({ kind: "tournament", id: "t-1", role: "spectator" });
});

test("a bare tournament UUID with no join/ prefix resolves to a tournament target", () => {
  expect(parseJoinTarget("3fa85f64-5717-4562-b3fc-2c963f66afa6"))
    .toEqual({ kind: "tournament", id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", role: "player" });
});

test("a bare non-UUID word is not a join target", () => {
  expect(parseJoinTarget("smash-cup-2026")).toBeNull();
  expect(parseJoinTarget("hello")).toBeNull();
});

test("joinRouteFor builds the in-app route for each role", () => {
  expect(joinRouteFor({ kind: "tournament", id: "t-1", role: "player" })).toBe("/join/tournament/t-1");
  expect(joinRouteFor({ kind: "tournament", id: "t-1", role: "scorer" })).toBe("/join/tournament/t-1/scorer");
  expect(joinRouteFor({ kind: "tournament", id: "t-1", role: "spectator" })).toBe("/join/tournament/t-1/spectator");
  expect(joinRouteFor({ kind: "club", id: "c-1", role: "player" })).toBe("/join/club/c-1");
});

test("builds a session join path without a scheme", () => {
  expect(buildSessionJoinPath("s-1")).toBe("join/session/s-1");
});

test("parses a session link", () => {
  expect(parseJoinTarget("badminton://join/session/s-1"))
    .toEqual({ kind: "session", id: "s-1", role: "player" });
  expect(parseJoinTarget("https://courtside-links.vercel.app/join/session/s-1"))
    .toEqual({ kind: "session", id: "s-1", role: "player" });
});

test("a session link ignores any trailing role segment", () => {
  expect(parseJoinTarget("badminton://join/session/s-1/scorer"))
    .toEqual({ kind: "session", id: "s-1", role: "player" });
});

test("routes a session target to its join screen", () => {
  expect(joinRouteFor({ kind: "session", id: "s-1", role: "player" }))
    .toBe("/join/session/s-1");
});

test("a bare uuid still means tournament, not session", () => {
  expect(parseJoinTarget("11111111-2222-3333-4444-555555555555"))
    .toEqual({ kind: "tournament", id: "11111111-2222-3333-4444-555555555555", role: "player" });
});

test("rejects a session link with an unresolved route placeholder", () => {
  expect(parseJoinTarget("badminton://join/session/[id]")).toBeNull();
});
