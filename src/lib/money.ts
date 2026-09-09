/**
 * Money helpers for the session cost split.
 *
 * Amounts are stored in minor units (paise/cents) and rendered WITHOUT a
 * currency symbol. That is a decision, not an oversight: there is no currency
 * field anywhere in the schema, and inferring a symbol from the device locale
 * would print a rupee sign for a club in Singapore whose members happen to have
 * Indian phones. The club knows what it charges in. Add a currency column the
 * day a real club needs one.
 */

/** Minor units to a grouped display string: 80000 -> "800", 125050 -> "1,250.50". */
export function formatMoney(cents: number): string {
  const units = Math.round(cents) / 100;
  return units.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(units) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Parse typed major units into minor units. Tolerates grouping separators and
 * stray symbols ("₹1,250.50" -> 125050). Returns null when the text is not a
 * usable non-negative amount, so callers can reject rather than silently
 * recording a zero.
 */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
