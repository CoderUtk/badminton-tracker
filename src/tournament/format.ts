/** finalsBestOf applies to the final and semifinal (the last two rounds); default elsewhere. */
export function pickBestOf(round: number, maxRound: number, bestOf: number, finalsBestOf: number): number {
  return round >= maxRound - 1 ? finalsBestOf : bestOf;
}
