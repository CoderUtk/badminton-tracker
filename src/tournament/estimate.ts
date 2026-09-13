import type { FormatId } from "./types";
import type { FormatModule } from "./formats/types";
import { FORMATS } from "./formats";

/** Rough minutes for one match. A best-of-3 to 21 runs about 25 minutes on a
 *  club court including the changeover; each extra game adds about 10. */
const BASE_MINUTES = 15;
const PER_GAME_MINUTES = 5;

/** Above this, the picker marks the option as long for one night. */
export const LONG_THRESHOLD_MINUTES = 180;

/**
 * Deliberately rough, and always presented with a '~'. Its job is not accuracy;
 * it is to make an unplayable choice visibly unplayable BEFORE the host commits,
 * rather than after they have started a 120-match round-robin.
 */
export function estimateMinutes(matches: number, bestOf: number, courts: number): number {
  if (matches <= 0) return 0;
  const perMatch = BASE_MINUTES + PER_GAME_MINUTES * bestOf;
  return Math.round((matches * perMatch) / Math.max(1, courts));
}

export function formatEstimate(
  format: FormatModule, entrants: number, bestOf: number, courts: number,
  o?: { groupSize?: number; advancePerGroup?: number },
): { matches: number; minutes: number; long: boolean } {
  const matches = entrants <= 0 ? 0 : format.matchCount(entrants, o);
  const minutes = estimateMinutes(matches, bestOf, courts);
  return { matches, minutes, long: minutes > LONG_THRESHOLD_MINUTES };
}

/** "1 court" / "4 courts", "1 match" / "7 matches" — both the estimate line
 *  and the long-format warning name a count, and courts=1 is a real,
 *  supported minimum (MIN_COURTS in the create screen), not a theoretical
 *  input. `pluralForm` covers irregular plurals ("match" -> "matches");
 *  it defaults to the regular `${singular}s`. */
function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `~${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `~${h}h` : `~${h}h${String(m).padStart(2, "0")}`;
}

export type FormatRow = {
  id: FormatId;
  label: string;
  blurb: string;
  matches: number;
  minutes: number;
  long: boolean;
  estimateText: string;
  warning: string | null;
};

/**
 * Pure per-row view model for the format picker — kept out of the .tsx
 * component (see bracketLabel.ts's header comment) so the decidable logic is
 * unit-testable under this project's Jest setup.
 *
 * A row flagged `long` names a cheaper non-long format by its own estimate,
 * so the host is pointed at a format that actually fits the night rather
 * than just told "this one doesn't". Every long row gets a warning — even
 * when no format fits, since that (64 entrants on 1 court, say) is the exact
 * situation this feature exists to surface, not one where it goes quiet.
 */
export function formatRows(
  entrants: number, bestOf: number, courts: number,
  o?: { groupSize?: number; advancePerGroup?: number },
): FormatRow[] {
  const rows = Object.values(FORMATS).map((mod) => {
    const { matches, minutes, long } = formatEstimate(mod, entrants, bestOf, courts, o);
    return { mod, matches, minutes, long };
  });

  const cheapest = rows.filter((r) => !r.long).sort((a, b) => a.minutes - b.minutes)[0] ?? null;
  const groupsKnockoutRow = rows.find((r) => r.mod.id === "groups_knockout") ?? null;

  return rows.map(({ mod, matches, minutes, long }) => {
    let warning: string | null = null;
    if (long) {
      // A round-robin host chose it to avoid a one-loss exit. Pointing them
      // straight at Knockout throws that away; Groups → knockout keeps it
      // while still fitting the night, so prefer it when it qualifies.
      const preferred =
        mod.id === "round_robin" && groupsKnockoutRow && !groupsKnockoutRow.long
          ? groupsKnockoutRow
          : cheapest;
      warning = preferred && preferred.mod.id !== mod.id
        ? `Long for one night — ${preferred.mod.label} finishes in ${formatDuration(preferred.minutes)}.`
        : `Long for one night — even the fastest format runs long on ${plural(courts, "court")}.`;
    }
    return {
      id: mod.id,
      label: mod.label,
      blurb: mod.blurb,
      matches,
      minutes,
      long,
      estimateText: `≈ ${plural(matches, "match", "matches")} · ${formatDuration(minutes)} on ${plural(courts, "court")}`,
      warning,
    };
  });
}
