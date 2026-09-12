import {
  GUEST_RETENTION_DAYS, guestDaysLeft, isGuestExpiringSoon, shouldPromptUpgrade,
} from "../src/lib/guestRetention";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_760_000_000_000;

describe("guestDaysLeft", () => {
  it("gives a brand new match the full window", () => {
    expect(guestDaysLeft(NOW, NOW)).toBe(GUEST_RETENTION_DAYS);
  });

  it("rounds up, so a part-day still reads as a day", () => {
    // 29 days and 18 hours old: 6 hours left.
    expect(guestDaysLeft(NOW - (29 * DAY + 18 * 3600_000), NOW)).toBe(1);
  });

  it("returns 0 once the window has passed", () => {
    expect(guestDaysLeft(NOW - 30 * DAY, NOW)).toBe(0);
    expect(guestDaysLeft(NOW - 90 * DAY, NOW)).toBe(0);
  });
});

describe("isGuestExpiringSoon", () => {
  it("flags the last week", () => {
    expect(isGuestExpiringSoon(8)).toBe(false);
    expect(isGuestExpiringSoon(7)).toBe(true);
    expect(isGuestExpiringSoon(0)).toBe(true);
  });
});

describe("shouldPromptUpgrade", () => {
  it("stays quiet for the first two matches", () => {
    expect(shouldPromptUpgrade(0, 0)).toBe(false);
    expect(shouldPromptUpgrade(2, 0)).toBe(false);
  });

  it("asks on the third", () => {
    expect(shouldPromptUpgrade(3, 0)).toBe(true);
  });

  it("a dismissal buys three more matches of silence", () => {
    expect(shouldPromptUpgrade(4, 3)).toBe(false);
    expect(shouldPromptUpgrade(5, 3)).toBe(false);
    expect(shouldPromptUpgrade(6, 3)).toBe(true);
  });
});
