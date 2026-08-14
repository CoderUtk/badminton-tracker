import { formatWinRate, MIN_MATCHES_FOR_RATES } from "../src/lib/winRate";

describe("formatWinRate", () => {
  it("is an em dash below the minimum sample size", () => {
    // Audit P2: Home showed "—" and Profile showed "0%" for the same
    // zero-match condition. This is the one rule both must use.
    expect(formatWinRate(0, 0)).toBe("—");
  });

  it("is an em dash just below the threshold", () => {
    expect(formatWinRate(MIN_MATCHES_FOR_RATES - 1, 100)).toBe("—");
  });

  it("is a real percentage at the threshold", () => {
    expect(formatWinRate(MIN_MATCHES_FOR_RATES, 40)).toBe("40%");
  });

  it("is a real percentage well above the threshold", () => {
    expect(formatWinRate(50, 0)).toBe("0%");
  });
});
