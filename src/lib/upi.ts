/**
 * UPI deep links for the session cost split.
 *
 * The app builds a `upi://pay` intent and hands it to the OS; the user's
 * banking app takes it from there. Nothing here moves money, holds funds, or
 * sees a transaction — that is deliberate, and it is what keeps settle-up a
 * small feature rather than a payments product.
 *
 * UPI is India-only and INR-only, which is why `cu` is hard-coded while
 * money.ts refuses to guess a currency symbol: a UPI handle IS the declaration
 * that this club settles in rupees. A club with no handle sees no pay button.
 */

/** Mirrors the CHECK constraint on payee_handles.upi_id (0051). */
const VPA = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.]{1,63}$/;

export function isValidUpiId(upiId: string): boolean {
  return VPA.test(upiId.trim());
}

/**
 * @param cents the share in minor units, as splitCost computes it.
 * @returns the deep link, or null when the inputs could not produce a payable
 *   one — an invalid handle or a zero amount. Callers hide the control rather
 *   than opening a link that lands the user in a bank app with an error.
 */
export function buildUpiLink(input: {
  upiId: string;
  payeeName: string;
  cents: number;
  note?: string;
}): string | null {
  const upiId = input.upiId.trim();
  if (!isValidUpiId(upiId)) return null;
  const cents = Math.round(input.cents);
  if (!Number.isFinite(cents) || cents <= 0) return null;

  const params = new URLSearchParams({
    pa: upiId,
    pn: input.payeeName.trim() || "CourtSide",
    // Always two decimals: several UPI apps reject a bare integer amount.
    am: (cents / 100).toFixed(2),
    cu: "INR",
  });
  // Truncated because some apps silently drop an over-long note, taking the
  // rest of the query string with it.
  if (input.note) params.set("tn", input.note.slice(0, 50));

  // URLSearchParams encodes a space as "+", which UPI apps read literally in
  // the payee name and note. %20 is understood everywhere.
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}
