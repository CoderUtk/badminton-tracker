import { buildClubJoinPath, buildTournamentScorerJoinPath, parseJoinTarget } from "../src/lib/joinLink";

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
