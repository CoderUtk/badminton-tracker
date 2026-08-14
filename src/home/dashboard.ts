/**
 * Pure logic for the home dashboard. No React, no database — everything here
 * takes plain data and returns plain data so it can be unit-tested, since this
 * repo has no component-render test infrastructure.
 */
import type { ClubSession } from "../repos/sessionRepo";
import type { Club, ClubPlayer } from "../repos/clubRepo";
import type { PlayerAnalytics } from "../analytics/player";
import { formatWinRate, MIN_MATCHES_FOR_RATES } from "../lib/winRate";

// Re-export for backward compatibility with existing tests.
export { MIN_MATCHES_FOR_RATES };


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

/**
 * Title for the next-session card: the name of the club the session belongs
 * to, resolved against the clubs already loaded on this screen. Returns null
 * — never a generic fallback — when there is no session or its club is not
 * among the loaded clubs, so the render gate that checks this stays honest.
 */
export function resolveNextSessionTitle(clubs: Club[], next: ClubSession | null): string | null {
  if (!next) return null;
  return clubs.find((c) => c.id === next.club_id)?.name ?? null;
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
    winRate: formatWinRate(played, analytics?.winPct ?? 0),
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

/**
 * The account has nothing yet: no completed match and no club. Home swaps its
 * dashboard blocks — which would all be empty — for content that names the
 * next step.
 *
 * The threshold is zero, not MIN_MATCHES_FOR_RATES: one club or one match
 * gives the account a shape, and the dashboard is true for it from then on.
 *
 * `loaded` is the caller's "the first cache read has resolved" flag. Without
 * it, analytics starting as null would render the first-run state for a frame
 * on every focus, for every user.
 */
export function isFirstRun(
  analytics: PlayerAnalytics | null,
  clubs: Club[],
  loaded: boolean
): boolean {
  return loaded && (analytics?.played ?? 0) === 0 && clubs.length === 0;
}
