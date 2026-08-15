import {
  totalRallies,
  longestStreak,
  leadChanges,
  formatShortDuration,
} from "../../src/lib/share/matchStats";
import type { MatchEvent, TeamId } from "../../src/engine";

/** Compact builder: "ABBA" -> four RALLY_WON events. "|" starts a new game. */
function ev(pattern: string): MatchEvent[] {
  const out: MatchEvent[] = [];
  let at = 1000;
  for (const ch of pattern) {
    at += 1000;
    if (ch === "|") out.push({ type: "GAME_STARTED", at });
    else out.push({ type: "RALLY_WON", by: ch as TeamId, at });
  }
  return out;
}

test("totalRallies counts nothing for an empty event list", () => {
  expect(totalRallies([])).toBe(0);
});

test("totalRallies counts rallies across games and ignores non-rally events", () => {
  expect(totalRallies(ev("AABB|ABA"))).toBe(7);
});

test("longestStreak is zero when the side never wins a rally", () => {
  expect(longestStreak(ev("BBBB"), "A")).toBe(0);
});

test("longestStreak finds a run at the start", () => {
  expect(longestStreak(ev("AAABAB"), "A")).toBe(3);
});

test("longestStreak finds a run at the end", () => {
  expect(longestStreak(ev("ABAAAA"), "A")).toBe(4);
});

test("longestStreak carries a run across a game boundary", () => {
  // Three at the end of game one, two at the start of game two: momentum
  // carries, so this is a run of five, not two runs of three and two.
  expect(longestStreak(ev("BAAA|AAB"), "A")).toBe(5);
});

test("leadChanges is zero for a blowout", () => {
  expect(leadChanges(ev("AAAAA"))).toBe(0);
});

test("leadChanges does not count a tie as a change", () => {
  // 1-0, 1-1, 2-1, 2-2: A leads or it is level, B never leads.
  expect(leadChanges(ev("ABAB"))).toBe(0);
});

test("leadChanges counts a genuine flip through a tie", () => {
  // 1-0 (A), 1-1 (tie), 1-2 (B) -> one change.
  expect(leadChanges(ev("ABB"))).toBe(1);
});

test("leadChanges counts several flips", () => {
  // 1-0 A, 1-1, 1-2 B(+1), 2-2, 3-2 A(+1) -> 2.
  expect(leadChanges(ev("ABBAA"))).toBe(2);
});

test("leadChanges resets at each game, so a new game's first lead is not a change", () => {
  // Game one ends with B ahead; game two opens with A ahead. Each game starts
  // level, so that is not a flip.
  expect(leadChanges(ev("BB|AA"))).toBe(0);
});

test("formatShortDuration renders sub-hour durations as whole minutes", () => {
  expect(formatShortDuration(42 * 60 * 1000)).toBe("42′");
});

test("formatShortDuration floors partial minutes", () => {
  expect(formatShortDuration(59 * 1000)).toBe("0′");
});

test("formatShortDuration renders an hour-plus duration with a zero-padded minute", () => {
  expect(formatShortDuration(61 * 60 * 1000)).toBe("1h 01′");
});

test("formatShortDuration treats a negative duration as zero", () => {
  expect(formatShortDuration(-5000)).toBe("0′");
});
