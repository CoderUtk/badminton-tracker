import { elapsedMs, formatElapsed } from "../src/lib/elapsed";

const START = 1_000_000;

describe("elapsedMs", () => {
  it("is the wall-clock gap when nothing has been paused", () => {
    expect(elapsedMs({ startedAt: START, now: START + 5_000, pausedMs: 0, pausedSince: null })).toBe(5_000);
  });

  it("is zero at the instant the match starts", () => {
    expect(elapsedMs({ startedAt: START, now: START, pausedMs: 0, pausedSince: null })).toBe(0);
  });

  it("subtracts completed paused spans", () => {
    // 10s of wall clock, 4s of it paused and already banked.
    expect(elapsedMs({ startedAt: START, now: START + 10_000, pausedMs: 4_000, pausedSince: null })).toBe(6_000);
  });

  it("freezes while currently paused", () => {
    // Paused at +6s. Two different nows must give the same answer.
    const base = { startedAt: START, pausedMs: 0, pausedSince: START + 6_000 };
    expect(elapsedMs({ ...base, now: START + 6_000 })).toBe(6_000);
    expect(elapsedMs({ ...base, now: START + 90_000 })).toBe(6_000);
  });

  it("subtracts banked spans and the open span together", () => {
    // 20s wall clock, 3s banked from an earlier pause, paused again at +15s.
    expect(elapsedMs({ startedAt: START, now: START + 20_000, pausedMs: 3_000, pausedSince: START + 15_000 })).toBe(12_000);
  });

  it("never returns a negative value when the clock jumps backwards", () => {
    // Device clock corrections and NTP steps both produce now < startedAt.
    expect(elapsedMs({ startedAt: START, now: START - 30_000, pausedMs: 0, pausedSince: null })).toBe(0);
  });
});

describe("formatElapsed", () => {
  it("zero-pads every field", () => {
    expect(formatElapsed(0)).toBe("00:00:00");
  });

  it("formats seconds", () => {
    expect(formatElapsed(9_000)).toBe("00:00:09");
  });

  it("rolls over to minutes at exactly 60 seconds", () => {
    expect(formatElapsed(60_000)).toBe("00:01:00");
  });

  it("rolls over to hours at exactly 60 minutes", () => {
    expect(formatElapsed(3_600_000)).toBe("01:00:00");
  });

  it("keeps minutes and seconds inside their own field past an hour", () => {
    // 1h 02m 03s — the case where a naive floor(ms/60000) leaks 62 into minutes.
    expect(formatElapsed(3_723_000)).toBe("01:02:03");
  });

  it("truncates sub-second remainders rather than rounding up", () => {
    // A timer that shows 00:00:01 before a full second has elapsed reads as wrong.
    expect(formatElapsed(1_999)).toBe("00:00:01");
  });
});
