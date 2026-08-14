import {
  buildRallyTimeline,
  formatMatchDate,
  formatMatchStatus,
  matchDurationMs,
} from "../src/lib/matchDetail";
import type { MatchConfig, MatchEvent } from "../src/engine";

describe("formatMatchDate", () => {
  it("formats a local calendar date without depending on ICU locale data", () => {
    // Noon UTC keeps this away from a midnight boundary in most timezones.
    const noonUtc = Date.UTC(2026, 7, 12, 12, 0, 0); // Aug 12, 2026
    expect(formatMatchDate(noonUtc)).toMatch(/^Aug 12, 2026$/);
  });
});

describe("formatMatchStatus", () => {
  it("capitalizes the raw enum value", () => {
    expect(formatMatchStatus("completed")).toBe("Completed");
    expect(formatMatchStatus("live")).toBe("Live");
    expect(formatMatchStatus("forfeited")).toBe("Forfeited");
  });
});

describe("matchDurationMs", () => {
  it("is the gap between the first and last event", () => {
    const events: MatchEvent[] = [
      { type: "MATCH_STARTED", config: {} as MatchConfig, at: 1_000 },
      { type: "RALLY_WON", by: "A", at: 5_000 },
      { type: "RALLY_WON", by: "B", at: 9_500 },
    ];
    expect(matchDurationMs(events)).toBe(8_500);
  });

  it("is zero for an empty event list", () => {
    expect(matchDurationMs([])).toBe(0);
  });

  it("never returns a negative value", () => {
    // Defensive against corrupted/out-of-order event logs, same posture as
    // elapsedMs in src/lib/elapsed.ts.
    const events: MatchEvent[] = [
      { type: "MATCH_STARTED", config: {} as MatchConfig, at: 9_000 },
      { type: "RALLY_WON", by: "A", at: 1_000 },
    ];
    expect(matchDurationMs(events)).toBe(0);
  });
});

describe("buildRallyTimeline", () => {
  it("groups rallies by game, starting from game 1", () => {
    const events: MatchEvent[] = [
      { type: "MATCH_STARTED", config: {} as MatchConfig, at: 0 },
      { type: "RALLY_WON", by: "A", at: 1 },
      { type: "RALLY_WON", by: "A", at: 2 },
      { type: "RALLY_WON", by: "B", at: 3 },
      { type: "GAME_STARTED", at: 4 },
      { type: "RALLY_WON", by: "B", at: 5 },
    ];
    expect(buildRallyTimeline(events)).toEqual([
      { game: 1, rallies: ["A", "A", "B"] },
      { game: 2, rallies: ["B"] },
    ]);
  });

  it("drops a trailing empty game (e.g. GAME_STARTED fired but no rally logged yet)", () => {
    const events: MatchEvent[] = [
      { type: "MATCH_STARTED", config: {} as MatchConfig, at: 0 },
      { type: "RALLY_WON", by: "A", at: 1 },
      { type: "GAME_STARTED", at: 2 },
    ];
    expect(buildRallyTimeline(events)).toEqual([{ game: 1, rallies: ["A"] }]);
  });

  it("returns an empty array for a match with no rallies yet", () => {
    const events: MatchEvent[] = [
      { type: "MATCH_STARTED", config: {} as MatchConfig, at: 0 },
    ];
    expect(buildRallyTimeline(events)).toEqual([]);
  });
});
