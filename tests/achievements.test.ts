import { evaluateBadges } from "../src/achievements/rules";

const base = {
  played: 0, wins: 0, losses: 0, winPct: 0, gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0,
  form: [] as ("W" | "L")[], recent: [] as unknown[],
  dayStreak: 0, weekendWarrior: false, earlyBird: false, nightOwl: false,
  maxMatchesInMonth: 0, maxMatchesInDay: 0, winStreak: 0, doublesPlayed: 0,
  flawlessVictory: false, nailBiter: false, comebackKid: false, venues: new Set<string>(),
};
const noProfile = { age: null, hand: null, avatarUrl: null };

test("no play -> nothing earned, first-win at 0 progress", () => {
  const b = evaluateBadges(base as any, noProfile);
  expect(b.every((x) => !x.earned)).toBe(true);
  expect(b.find((x) => x.id === "first_win")!.progress).toBe(0);
});

test("first win earns first_win and shows partial toward 10-win badge", () => {
  const b = evaluateBadges({ ...base, played: 1, wins: 1, winPct: 100, form: ["W"] } as any, noProfile);
  expect(b.find((x) => x.id === "first_win")!.earned).toBe(true);
  expect(b.find((x) => x.id === "wins_10")!.earned).toBe(false);
  expect(b.find((x) => x.id === "wins_10")!.progress).toBeCloseTo(0.1, 5);
});

test("five-win streak earns the streak badge", () => {
  const b = evaluateBadges({ ...base, played: 6, wins: 5, form: ["W", "W", "W", "W", "W"] } as any, noProfile);
  expect(b.find((x) => x.id === "streak_5")!.earned).toBe(true);
});

test("streak counts from the most recent match (form is newest-first)", () => {
  const lost = evaluateBadges({ ...base, played: 6, wins: 5, form: ["L", "W", "W", "W", "W", "W"] } as any, noProfile);
  expect(lost.find((x) => x.id === "streak_5")!.earned).toBe(false);
  const hot = evaluateBadges({ ...base, played: 6, wins: 5, form: ["W", "W", "W", "W", "W", "L"] } as any, noProfile);
  expect(hot.find((x) => x.id === "streak_5")!.earned).toBe(true);
});

test("sharp badge progress respects the games-played gate, not just win rate", () => {
  const b = evaluateBadges({ ...base, played: 2, wins: 2, winPct: 100, form: ["W", "W"] } as any, noProfile);
  const sharp = b.find((x) => x.id === "sharp")!;
  expect(sharp.earned).toBe(false);
  expect(sharp.progress).toBeCloseTo(0.2, 5); // gated by played/10, not winPct/60
});

describe("new achievements", () => {
  test("boolean-rule badges (weekend warrior, early bird, night owl, flawless, comeback, nail biter)", () => {
    const b = evaluateBadges({
      ...base, weekendWarrior: true, earlyBird: true, nightOwl: true,
      flawlessVictory: true, comebackKid: true, nailBiter: true,
    } as any, noProfile);
    for (const id of ["weekend_warrior", "early_bird", "night_owl", "flawless", "comeback", "nail_biter"]) {
      expect(b.find((x) => x.id === id)!.earned).toBe(true);
    }
    const none = evaluateBadges(base as any, noProfile);
    for (const id of ["weekend_warrior", "early_bird", "night_owl", "flawless", "comeback", "nail_biter"]) {
      expect(none.find((x) => x.id === id)!.earned).toBe(false);
      expect(none.find((x) => x.id === id)!.progress).toBe(0);
    }
  });

  test("streak_7 (The Streak) earns at 7 consecutive days, progress before that", () => {
    const partial = evaluateBadges({ ...base, dayStreak: 3 } as any, noProfile);
    expect(partial.find((x) => x.id === "streak_7")!.earned).toBe(false);
    expect(partial.find((x) => x.id === "streak_7")!.progress).toBeCloseTo(3 / 7, 5);

    const full = evaluateBadges({ ...base, dayStreak: 7 } as any, noProfile);
    expect(full.find((x) => x.id === "streak_7")!.earned).toBe(true);
  });

  test("monthly_15 (Monthly Regular) earns at 15 matches in a month", () => {
    const b = evaluateBadges({ ...base, maxMatchesInMonth: 15 } as any, noProfile);
    expect(b.find((x) => x.id === "monthly_15")!.earned).toBe(true);
  });

  test("doubles_10 (Dynamic Duo) earns at 10 doubles matches", () => {
    const b = evaluateBadges({ ...base, doublesPlayed: 10 } as any, noProfile);
    expect(b.find((x) => x.id === "doubles_10")!.earned).toBe(true);
  });

  test("streak_10 (Unstoppable) uses winStreak, independent of streak_5's form-based check", () => {
    const b = evaluateBadges({ ...base, winStreak: 10, form: [] } as any, noProfile);
    expect(b.find((x) => x.id === "streak_10")!.earned).toBe(true);
  });

  test("played_100 (Centurion) and wins_100 (Court Legend)", () => {
    const b = evaluateBadges({ ...base, played: 100, wins: 100 } as any, noProfile);
    expect(b.find((x) => x.id === "played_100")!.earned).toBe(true);
    expect(b.find((x) => x.id === "wins_100")!.earned).toBe(true);
  });

  test("venues_3 (Explorer) earns at 3 distinct venues", () => {
    const b = evaluateBadges({ ...base, venues: new Set(["A", "B", "C"]) } as any, noProfile);
    expect(b.find((x) => x.id === "venues_3")!.earned).toBe(true);
    const partial = evaluateBadges({ ...base, venues: new Set(["A"]) } as any, noProfile);
    expect(partial.find((x) => x.id === "venues_3")!.progress).toBeCloseTo(1 / 3, 5);
  });

  test("iron_man earns at 5 matches in a single day", () => {
    const b = evaluateBadges({ ...base, maxMatchesInDay: 5 } as any, noProfile);
    expect(b.find((x) => x.id === "iron_man")!.earned).toBe(true);
  });

  test("scribe_20 (The Scribe) earns at 20 played matches", () => {
    const b = evaluateBadges({ ...base, played: 20 } as any, noProfile);
    expect(b.find((x) => x.id === "scribe_20")!.earned).toBe(true);
  });

  test("profile_complete (Setting Up Shop) requires photo, age, and handedness all set", () => {
    const missingAll = evaluateBadges(base as any, noProfile);
    expect(missingAll.find((x) => x.id === "profile_complete")!.earned).toBe(false);
    expect(missingAll.find((x) => x.id === "profile_complete")!.progress).toBe(0);

    const partial = evaluateBadges(base as any, { age: 30, hand: null, avatarUrl: "https://x/y.png" });
    expect(partial.find((x) => x.id === "profile_complete")!.earned).toBe(false);
    expect(partial.find((x) => x.id === "profile_complete")!.progress).toBeCloseTo(2 / 3, 5);

    const complete = evaluateBadges(base as any, { age: 30, hand: "right", avatarUrl: "https://x/y.png" });
    expect(complete.find((x) => x.id === "profile_complete")!.earned).toBe(true);
  });
});
