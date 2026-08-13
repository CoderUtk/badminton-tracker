/**
 * How far a screen must lift so a focused field clears the IME.
 *
 * Pure so it can be tested in the node-env Jest suite; Court and new-match
 * feed it live values from useReanimatedKeyboardAnimation and onLayout.
 *
 * The model: content already sitting below the field absorbs the first part of
 * the keyboard for free, and so does the bottom safe-area inset the screen was
 * already padding. Only the remainder needs a translate, and it is capped at
 * maxShift so the lift never pushes the top of the screen out of reach.
 */
export type KeyboardShiftInput = {
  /** Live IME height in dp. 0 when closed. */
  keyboardHeight: number;
  /** Measured height of the content between the field and the screen bottom. */
  belowContentHeight: number;
  /** Bottom safe-area inset already applied by the screen. */
  bottomInset: number;
  /** Ceiling on the lift — how much of the top the screen may sacrifice. */
  maxShift: number;
};

export function keyboardShift({
  keyboardHeight, belowContentHeight, bottomInset, maxShift,
}: KeyboardShiftInput): number {
  const uncovered = keyboardHeight - belowContentHeight - bottomInset;
  if (uncovered <= 0) return 0;
  return Math.min(uncovered, maxShift);
}
