/**
 * Audit P6: the Cups list showed "{size}-player", where size is the drawn
 * bracket's power-of-two slot count (8 for 6 entrants, 0-player for an empty
 * draft) rather than how many people are actually in the tournament.
 */
export function formatEntrantLabel(count: number): string {
  return `${count} entrant${count === 1 ? "" : "s"}`;
}
