### Task 2: Pure home-dashboard logic module

Everything the home screen needs to decide *what* to show, with no React and no
database access, so it can be tested.

**Files:**
- Create: `src/home/dashboard.ts`
- Test: `tests/homeDashboard.test.ts`

**Interfaces:**
- Consumes: `PlayerAnalytics.longestWinStreak` (Task 1); `ClubSession` from `src/repos/sessionRepo`; `Club` and `ClubPlayer` from `src/repos/clubRepo`.
- Produces, all imported by Tasks 3–5:
  - `MIN_MATCHES_FOR_RATES: 5`
  - `pickNextSession(sessions: ClubSession[], now: number): ClubSession | null`
  - `sessionDateLabel(startsAt: number, now: number): string`
  - `sessionMetaLabel(session: ClubSession, now: number): string`
  - `liveClubIds(sessions: ClubSession[]): Set<string>`
  - `resolveMyPlayerName(clubPlayers: ClubPlayer[], profileId: string | null, displayName: string | null): string | null`
  - `statTileValues(analytics: PlayerAnalytics | null): { matches: string; winRate: string; streak: string; hasRates: boolean }`
  - `shouldShowFeatureCopy(analytics: PlayerAnalytics | null): boolean`

- [ ] **Step 1: Write the failing tests**

Create `tests/homeDashboard.test.ts`:

```ts
import {
  MIN_MATCHES_FOR_RATES,
  pickNextSession,
  sessionDateLabel,
  sessionMetaLabel,
  liveClubIds,
  resolveMyPlayerName,
  statTileValues,
  shouldShowFeatureCopy,
} from "../src/home/dashboard";
import type { ClubSession, SessionStatus } from "../src/repos/sessionRepo";
import type { ClubPlayer } from "../src/repos/clubRepo";
import type { PlayerAnalytics } from "../src/analytics/player";

const NOW = new Date("2026-08-08T12:00:00").getTime();
const HOUR = 3600_000;

function session(
  id: string,
  startsAt: number,
  status: SessionStatus = "scheduled",
  overrides: Partial<ClubSession> = {}
): ClubSession {
  return {
    id,
    club_id: "club-1",
    starts_at: startsAt,
    ends_at: null,
    location: null,
    courts: 2,
    status,
    created_at: 0,
    created_by: null,
    ...overrides,
  };
}

describe("pickNextSession", () => {
  test("no sessions -> null", () => {
    expect(pickNextSession([], NOW)).toBeNull();
  });

  test("all in the past -> null", () => {
    expect(pickNextSession([session("a", NOW - HOUR)], NOW)).toBeNull();
  });

  test("picks the earliest upcoming, not the first in the array", () => {
    // listSessions() returns starts_at DESC, so the soonest is last
    const rows = [
      session("far", NOW + 5 * HOUR),
      session("mid", NOW + 3 * HOUR),
      session("soon", NOW + HOUR),
    ];
    expect(pickNextSession(rows, NOW)!.id).toBe("soon");
  });

  test("skips cancelled and done sessions", () => {
    const rows = [
      session("ok", NOW + 4 * HOUR),
      session("dead", NOW + HOUR, "cancelled"),
      session("over", NOW + 2 * HOUR, "done"),
    ];
    expect(pickNextSession(rows, NOW)!.id).toBe("ok");
  });

  test("includes a live session that has not started yet by clock", () => {
    const rows = [session("live", NOW + HOUR, "live")];
    expect(pickNextSession(rows, NOW)!.id).toBe("live");
  });
});

describe("sessionDateLabel", () => {
  test("same calendar day reads Today", () => {
    const at = new Date("2026-08-08T18:30:00").getTime();
    expect(sessionDateLabel(at, NOW)).toMatch(/^Today · /);
  });

  test("a different day uses weekday, month and date", () => {
    const at = new Date("2026-08-11T18:30:00").getTime();
    const label = sessionDateLabel(at, NOW);
    expect(label).not.toMatch(/^Today/);
    expect(label).toContain("Aug");
  });
});

describe("sessionMetaLabel", () => {
  test("appends location when present", () => {
    const at = new Date("2026-08-08T18:30:00").getTime();
    const s = session("a", at, "scheduled", { location: "City Badminton Hub" });
    expect(sessionMetaLabel(s, NOW)).toContain("· City Badminton Hub");
  });

  test("falls back to court count when location is null", () => {
    const at = new Date("2026-08-08T18:30:00").getTime();
    const s = session("a", at, "scheduled", { location: null, courts: 3 });
    expect(sessionMetaLabel(s, NOW)).toContain("· 3 courts");
  });

  test("singular court reads '1 court'", () => {
    const at = new Date("2026-08-08T18:30:00").getTime();
    const s = session("a", at, "scheduled", { location: null, courts: 1 });
    expect(sessionMetaLabel(s, NOW)).toContain("· 1 court");
  });

  test("blank location is treated as absent", () => {
    const at = new Date("2026-08-08T18:30:00").getTime();
    const s = session("a", at, "scheduled", { location: "   ", courts: 2 });
    expect(sessionMetaLabel(s, NOW)).toContain("· 2 courts");
  });
});

describe("liveClubIds", () => {
  test("collects club ids of live sessions only", () => {
    const rows = [
      session("a", NOW, "live", { club_id: "c1" }),
      session("b", NOW, "scheduled", { club_id: "c2" }),
      session("c", NOW, "live", { club_id: "c3" }),
    ];
    const ids = liveClubIds(rows);
    expect([...ids].sort()).toEqual(["c1", "c3"]);
  });

  test("no live sessions -> empty set", () => {
    expect(liveClubIds([session("a", NOW, "done")]).size).toBe(0);
  });
});

describe("resolveMyPlayerName", () => {
  const players: ClubPlayer[] = [
    { id: "p1", club_id: "c1", profile_id: "me", name: "Utkarsh" },
    { id: "p2", club_id: "c2", profile_id: "other", name: "Soham" },
  ];

  test("prefers the club-player name matching my profile", () => {
    expect(resolveMyPlayerName(players, "me", "Utkarsh A.")).toBe("Utkarsh");
  });

  test("falls back to display name when no club player matches", () => {
    expect(resolveMyPlayerName(players, "nobody", "Utkarsh A.")).toBe("Utkarsh A.");
  });

  test("falls back to display name when profile id is null", () => {
    expect(resolveMyPlayerName(players, null, "Utkarsh A.")).toBe("Utkarsh A.");
  });

  test("returns null when nothing identifies the user", () => {
    expect(resolveMyPlayerName([], null, null)).toBeNull();
  });

  test("ignores club players with a blank name", () => {
    const blank: ClubPlayer[] = [{ id: "p9", club_id: "c1", profile_id: "me", name: "  " }];
    expect(resolveMyPlayerName(blank, "me", "Fallback")).toBe("Fallback");
  });
});

describe("statTileValues", () => {
  const analytics = (played: number, winPct: number, longest: number) =>
    ({ played, winPct, longestWinStreak: longest } as PlayerAnalytics);

  test("null analytics -> zero matches and dashes", () => {
    expect(statTileValues(null)).toEqual({
      matches: "0", winRate: "—", streak: "—", hasRates: false,
    });
  });

  test("below the threshold -> true match count, dashed rates", () => {
    expect(statTileValues(analytics(4, 75, 3))).toEqual({
      matches: "4", winRate: "—", streak: "—", hasRates: false,
    });
  });

  test("at the threshold -> real values", () => {
    expect(statTileValues(analytics(MIN_MATCHES_FOR_RATES, 78, 5))).toEqual({
      matches: "5", winRate: "78%", streak: "5", hasRates: true,
    });
  });

  test("a zero win rate above the threshold still shows 0%, not a dash", () => {
    expect(statTileValues(analytics(9, 0, 0))).toEqual({
      matches: "9", winRate: "0%", streak: "0", hasRates: true,
    });
  });
});

describe("shouldShowFeatureCopy", () => {
  test("shown for a user with no analytics at all", () => {
    expect(shouldShowFeatureCopy(null)).toBe(true);
  });

  test("shown below the threshold", () => {
    expect(shouldShowFeatureCopy({ played: 4 } as PlayerAnalytics)).toBe(true);
  });

  test("hidden at and above the threshold", () => {
    expect(shouldShowFeatureCopy({ played: 5 } as PlayerAnalytics)).toBe(false);
    expect(shouldShowFeatureCopy({ played: 40 } as PlayerAnalytics)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest tests/homeDashboard.test.ts
```

Expected: FAIL — `Cannot find module '../src/home/dashboard'`.

- [ ] **Step 3: Write the module**

Create `src/home/dashboard.ts`:

```ts
/**
 * Pure logic for the home dashboard. No React, no database — everything here
 * takes plain data and returns plain data so it can be unit-tested, since this
 * repo has no component-render test infrastructure.
 */
import type { ClubSession } from "../repos/sessionRepo";
import type { ClubPlayer } from "../repos/clubRepo";
import type { PlayerAnalytics } from "../analytics/player";

/**
 * Win rate and streak are meaningless on a handful of matches, and "0%" reads
 * as "you lose every game" rather than "not enough data". Below this many
 * completed matches those two tiles show an em dash, and the onboarding
 * feature copy under the CTA is still visible.
 */
export const MIN_MATCHES_FOR_RATES = 5;

/**
 * The soonest session that has not started yet. Note that listSessions()
 * returns rows ordered by starts_at DESC, so the next session is the *last*
 * candidate, not the first — this sorts ascending rather than taking [0].
 */
export function pickNextSession(sessions: ClubSession[], now: number): ClubSession | null {
  const upcoming = sessions
    .filter((s) => s.starts_at > now && s.status !== "cancelled" && s.status !== "done")
    .sort((a, b) => a.starts_at - b.starts_at);
  return upcoming[0] ?? null;
}

/** Matches the phrasing already used by the sessions list screen. */
export function sessionDateLabel(startsAt: number, now: number): string {
  const date = new Date(startsAt);
  const sameDay = date.toDateString() === new Date(now).toDateString();
  return sameDay
    ? `Today · ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** Date label plus venue, falling back to court count when there is no venue. */
export function sessionMetaLabel(session: ClubSession, now: number): string {
  const when = sessionDateLabel(session.starts_at, now);
  const venue = session.location?.trim();
  if (venue) return `${when} · ${venue}`;
  const courts = session.courts === 1 ? "1 court" : `${session.courts} courts`;
  return `${when} · ${courts}`;
}

/** Clubs with a session currently in progress, for the row's Live pill. */
export function liveClubIds(sessions: ClubSession[]): Set<string> {
  return new Set(sessions.filter((s) => s.status === "live").map((s) => s.club_id));
}

/**
 * Which name the user appears under in match records. Their club-player name is
 * the one match setup draws from, so it beats the profile display name; the
 * display name is only a fallback for someone with no club membership yet.
 */
export function resolveMyPlayerName(
  clubPlayers: ClubPlayer[],
  profileId: string | null,
  displayName: string | null
): string | null {
  if (profileId) {
    const mine = clubPlayers.find((p) => p.profile_id === profileId && p.name.trim());
    if (mine) return mine.name.trim();
  }
  const fallback = displayName?.trim();
  return fallback ? fallback : null;
}

export function statTileValues(analytics: PlayerAnalytics | null): {
  matches: string; winRate: string; streak: string; hasRates: boolean;
} {
  const played = analytics?.played ?? 0;
  const hasRates = played >= MIN_MATCHES_FOR_RATES;
  return {
    matches: String(played),
    winRate: hasRates ? `${analytics!.winPct}%` : "—",
    streak: hasRates ? String(analytics!.longestWinStreak) : "—",
    hasRates,
  };
}

/**
 * The feature copy under the CTA exists to tell a new player what the scoring
 * engine does. It retires itself at the same threshold as the rate tiles, so a
 * settled user is not paying permanent screen height for something they learned
 * in week one.
 */
export function shouldShowFeatureCopy(analytics: PlayerAnalytics | null): boolean {
  return (analytics?.played ?? 0) < MIN_MATCHES_FOR_RATES;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest tests/homeDashboard.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: silent.

- [ ] **Step 6: Commit**

```bash
git add src/home/dashboard.ts tests/homeDashboard.test.ts
git commit -m "feat(home): pure dashboard selectors for session, stats and identity"
```

---

