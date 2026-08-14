/**
 * Which player-name slots a club-roster switch is allowed to auto-fill.
 *
 * Audit P12: switching save-scope from Personal to a club silently
 * overwrote typed player names. The previous guard treated "empty after
 * trim" as "safe to fill," which cannot tell "the user never touched this
 * slot" apart from "the user typed here, then deleted it" — both are "".
 * `touched` makes that distinction explicit and permanent: once true for a
 * slot, no later roster switch may write to it.
 */
export function fillEmptySlots(
  prev: string[],
  touched: boolean[],
  players: { name: string }[]
): string[] {
  return prev.map((n, i) => (touched[i] ? n : players[i]?.name ?? n));
}
