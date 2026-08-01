import { buildClubJoinPath, parseJoinTarget } from "../src/lib/joinLink";

test("builds a club join path without a scheme", () => {
  expect(buildClubJoinPath("abc-123")).toBe("join/club/abc-123");
});

test("parses a custom-scheme deep link", () => {
  expect(parseJoinTarget("badminton://join/club/abc-123")).toEqual({ kind: "club", id: "abc-123" });
});

test("parses an https link and a bare path", () => {
  expect(parseJoinTarget("https://example.com/join/club/xyz")).toEqual({ kind: "club", id: "xyz" });
  expect(parseJoinTarget("join/club/xyz")).toEqual({ kind: "club", id: "xyz" });
});

test("ignores query strings and trailing slashes", () => {
  expect(parseJoinTarget("badminton://join/club/xyz/?ref=share")).toEqual({ kind: "club", id: "xyz" });
});

test("returns null for unrelated or malformed links", () => {
  expect(parseJoinTarget("badminton://score/123")).toBeNull();
  expect(parseJoinTarget("badminton://join/club/")).toBeNull();
  expect(parseJoinTarget("badminton://join/tournament/1")).toBeNull();
  expect(parseJoinTarget("")).toBeNull();
});
