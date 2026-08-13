import { SCOREBOARD_TYPE as T } from "../src/theme";

describe("scoreboard type scale", () => {
  it("makes the score the largest thing on the screen", () => {
    // Audit M8: the score was 32pt against a 26pt +1 label, so the buttons read
    // as the dominant element on a board meant to be read from across a court.
    expect(T.score).toBeGreaterThan(T.rail);
    expect(T.score).toBeGreaterThan(T.name);
    expect(T.score).toBeGreaterThan(T.timer);
    expect(T.score).toBeGreaterThan(T.divider);
  });

  it("puts real distance between the score and the +1 buttons", () => {
    // A few points of difference is not a hierarchy at arm's length.
    expect(T.score / T.rail).toBeGreaterThanOrEqual(2);
  });

  it("keeps the elapsed chip the quietest element", () => {
    expect(T.timer).toBeLessThanOrEqual(T.name);
  });

  it("keeps player names subordinate to the +1 labels", () => {
    expect(T.name).toBeLessThan(T.rail);
  });

  it("is whole points throughout", () => {
    for (const v of Object.values(T)) expect(Number.isInteger(v)).toBe(true);
  });
});
