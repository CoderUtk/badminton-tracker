/**
 * The one win-rate-display rule, shared by Home and Profile.
 *
 * Audit P2: Home showed "—" below MIN_MATCHES_FOR_RATES completed matches
 * (win rate is meaningless on a handful of games), Profile showed "0%" for
 * the same condition — "0%" reads as "you lose every game," not "not
 * enough data yet." One rule, applied to both (spec section 5).
 */
export const MIN_MATCHES_FOR_RATES = 5;

export function formatWinRate(played: number, winPct: number): string {
  return played < MIN_MATCHES_FOR_RATES ? "—" : `${winPct}%`;
}
