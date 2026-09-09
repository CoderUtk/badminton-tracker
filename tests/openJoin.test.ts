import { joinEligibility, type SessionOpenPreview } from "../src/session/openJoin";

const preview = (over: Partial<SessionOpenPreview> = {}): SessionOpenPreview => ({
  sessionId: "s-1",
  clubName: "Sunrise Badminton",
  location: "Court 3",
  startsAt: 1_760_000_000_000,
  status: "scheduled",
  checkedIn: 4,
  maxPlayers: 12,
  alreadyIn: false,
  ...over,
});

test("an open session with room accepts a join", () => {
  expect(joinEligibility(preview())).toEqual({ ok: true });
});

test("a session at capacity is full", () => {
  const result = joinEligibility(preview({ checkedIn: 12, maxPlayers: 12 }));
  expect(result).toEqual({ ok: false, reason: "full", message: "This session is full." });
});

test("capacity is a floor, not an equality — an over-filled session stays full", () => {
  // The organiser can lower max_players below the current count; that must not
  // wrap around into "there is room".
  expect(joinEligibility(preview({ checkedIn: 20, maxPlayers: 12 })).ok).toBe(false);
});

test("a null max means unlimited", () => {
  expect(joinEligibility(preview({ checkedIn: 500, maxPlayers: null }))).toEqual({ ok: true });
});

test("a finished or cancelled session cannot be joined", () => {
  expect(joinEligibility(preview({ status: "done" })).ok).toBe(false);
  expect(joinEligibility(preview({ status: "cancelled" })).ok).toBe(false);
});

test("a live session can still be joined — people arrive late", () => {
  expect(joinEligibility(preview({ status: "live" }))).toEqual({ ok: true });
});

test("already being in reports itself rather than an error", () => {
  const result = joinEligibility(preview({ alreadyIn: true }));
  expect(result).toEqual({ ok: false, reason: "already-in", message: "You are already in this session." });
});

test("already-in wins over full, so a joined player never sees a full message", () => {
  const result = joinEligibility(preview({ alreadyIn: true, checkedIn: 12, maxPlayers: 12 }));
  expect(result).toMatchObject({ reason: "already-in" });
});
