import {
  isFirstRun,
  pickNextSession,
  sessionDateLabel,
  sessionMetaLabel,
  liveClubIds,
  resolveMyPlayerName,
  resolveNextSessionTitle,
  statTileValues,
  shouldShowFeatureCopy,
} from "../src/home/dashboard";
import { MIN_MATCHES_FOR_RATES } from "../src/lib/winRate";
import type { ClubSession, SessionStatus } from "../src/repos/sessionRepo";
import type { Club, ClubPlayer } from "../src/repos/clubRepo";
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
    cost_total_cents: 0,
    shuttles: 0,
    paid_by: null,
    open_join: false,
    max_players: null,
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

    // Verify it's NOT today
    expect(label).not.toMatch(/^Today/);

    // Shape assertion instead of recomputing the same toLocaleDateString call
    // the implementation uses: the day-of-month must appear, and the "·" the
    // same-day branch uses to join date and time must not. Locale-safe — no
    // hardcoded English month.
    expect(label).toContain("11");
    expect(label).not.toContain("·");
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
    { id: "p1", club_id: "c1", profile_id: "me", name: "Utkarsh", avatar_url: null, rating: 1500 },
    { id: "p2", club_id: "c2", profile_id: "other", name: "Soham", avatar_url: null, rating: 1500 },
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
    const blank: ClubPlayer[] = [{ id: "p9", club_id: "c1", profile_id: "me", name: "  ", avatar_url: null, rating: 1500 }];
    expect(resolveMyPlayerName(blank, "me", "Fallback")).toBe("Fallback");
  });

  test("multiple matching club players -> deterministically picks the first", () => {
    const multi: ClubPlayer[] = [
      { id: "p1", club_id: "c1", profile_id: "me", name: "Alpha", avatar_url: null, rating: 1500 },
      { id: "p2", club_id: "c2", profile_id: "me", name: "Beta", avatar_url: null, rating: 1500 },
    ];
    // listMyClubPlayers now orders by name, so callers can rely on array
    // order for determinism; resolveMyPlayerName just takes the first match.
    expect(resolveMyPlayerName(multi, "me", "Fallback")).toBe("Alpha");
    expect(resolveMyPlayerName([...multi].reverse(), "me", "Fallback")).toBe("Beta");
  });
});

describe("resolveNextSessionTitle", () => {
  const clubs: Club[] = [
    { id: "c1", name: "Riverside", invite_code: null, role: "member", personal: false },
    { id: "c2", name: "Downtown", invite_code: null, role: "member", personal: false },
  ];

  test("returns the matching club's name", () => {
    const next = session("a", NOW + HOUR, "scheduled", { club_id: "c2" });
    expect(resolveNextSessionTitle(clubs, next)).toBe("Downtown");
  });

  test("returns null when the session's club is not among the loaded clubs", () => {
    const next = session("a", NOW + HOUR, "scheduled", { club_id: "unknown" });
    expect(resolveNextSessionTitle(clubs, next)).toBeNull();
  });

  test("returns null when there is no session", () => {
    expect(resolveNextSessionTitle(clubs, null)).toBeNull();
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

describe("isFirstRun", () => {
  const club = { id: "club-1", name: "Smash Club" } as Club;

  test("no matches, no clubs, loaded -> true", () => {
    expect(isFirstRun(null, [], true)).toBe(true);
    expect(isFirstRun({ played: 0 } as PlayerAnalytics, [], true)).toBe(true);
  });

  test("a club is enough to leave the first-run state", () => {
    expect(isFirstRun(null, [club], true)).toBe(false);
  });

  test("a played match is enough to leave the first-run state", () => {
    expect(isFirstRun({ played: 1 } as PlayerAnalytics, [], true)).toBe(false);
  });

  test("false until the first load resolves, whatever the inputs", () => {
    expect(isFirstRun(null, [], false)).toBe(false);
    expect(isFirstRun({ played: 0 } as PlayerAnalytics, [], false)).toBe(false);
  });

  test("does not use the rate threshold -> a user with 4 matches is not first-run", () => {
    expect(isFirstRun({ played: 4 } as PlayerAnalytics, [], true)).toBe(false);
  });
});
