/**
 * Whether re-tapping an already-focused tab should pop its nested stack back
 * to root. Audit P17: the Cups tab restored its previous deep stack (the
 * Bracket screen) on re-tap instead of returning to the tournament list —
 * the standard iOS/Android convention, and what the audit itself expected.
 */
export function shouldResetTabStack(nestedStackIndex: number | undefined): boolean {
  return (nestedStackIndex ?? 0) > 0;
}
