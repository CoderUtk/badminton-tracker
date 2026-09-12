import { supabase } from "../lib/supabase";

export type RatingMoment = {
  /** Signed from this player's point of view: +12 means they gained 12. */
  delta: number;
  /** Rating after the match. */
  rating: number;
  /** 1-based position in the club, by rating. */
  rank: number;
  players: number;
  clubId: string;
  clubName: string;
  /** Carried through so the shareable rank card renders without a second
   *  profile fetch at capture time. */
  playerName: string;
  avatarUrl: string | null;
};

type MatchRow = {
  club_id: string | null;
  side_a: { club_player_id?: string | null }[] | null;
  side_b: { club_player_id?: string | null }[] | null;
  rating_delta: number | null;
};

/**
 * The rating change a completed match produced for the signed-in player.
 *
 * Live query rather than a read of the local match cache: rating_delta is
 * written by the matches_apply_rating trigger when the match reaches the
 * server (0049), so it does not exist at the moment the device finishes
 * scoring. Returns null until the match has synced — the caller renders
 * nothing rather than a placeholder, because a rating line that appears and
 * then changes is worse than one that appears late.
 *
 * Also null for every unrated match: quick matches, guest matches, and any
 * match with a player who has no club_players row (0047 sets rating_delta to
 * null in exactly those cases).
 */
export async function matchRatingMoment(matchId: string): Promise<RatingMoment | null> {
  if (!supabase) return null;
  try {
    const { getMyProfile } = await import("./profileRepo");
    const me = await getMyProfile();
    if (!me) return null;

    const { data: m } = await supabase
      .from("matches")
      .select("club_id, side_a, side_b, rating_delta")
      .eq("id", matchId)
      .maybeSingle();
    const match = m as MatchRow | null;
    if (!match || match.rating_delta == null || !match.club_id) return null;

    const { data: mine } = await supabase
      .from("club_players")
      .select("id, rating, clubs(name)")
      .eq("club_id", match.club_id)
      .eq("profile_id", me.id)
      .maybeSingle();
    const row = mine as { id: string; rating: number; clubs: { name: string } | { name: string }[] | null } | null;
    if (!row) return null;

    const onA = (match.side_a ?? []).some((p) => p.club_player_id === row.id);
    const onB = (match.side_b ?? []).some((p) => p.club_player_id === row.id);
    // A spectator or club admin opening someone else's match played in neither
    // side; there is no delta to attribute to them.
    if (!onA && !onB) return null;

    // Rank by count, not by pulling the whole roster: a club can hold 100+
    // players and only the position is needed. Ties share the better rank,
    // which is why this counts strictly-greater ratings.
    const [{ count: above }, { count: total }] = await Promise.all([
      supabase
        .from("club_players")
        .select("id", { count: "exact", head: true })
        .eq("club_id", match.club_id)
        .gt("rating", row.rating),
      supabase
        .from("club_players")
        .select("id", { count: "exact", head: true })
        .eq("club_id", match.club_id),
    ]);

    const club = Array.isArray(row.clubs) ? row.clubs[0] : row.clubs;
    return {
      delta: onA ? match.rating_delta : -match.rating_delta,
      rating: row.rating,
      rank: (above ?? 0) + 1,
      players: total ?? 0,
      clubId: match.club_id,
      clubName: club?.name ?? "your club",
      playerName: me.displayName || me.username || "You",
      avatarUrl: me.avatarUrl,
    };
  } catch {
    // Offline, or the match has not synced. Caller renders nothing.
    return null;
  }
}
