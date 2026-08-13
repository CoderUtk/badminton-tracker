/**
 * The scoring screen's orientation contract, as data.
 *
 * Deliberately free of expo-screen-orientation: that module is native, and
 * keeping this pure is what lets the node-env Jest suite pin the contract
 * (spec section 10). MatchScreen translates these targets into lockAsync calls.
 *
 * Audit H6: the screen restored with unlockAsync() on unmount, which releases
 * orientation to the device sensors rather than forcing portrait. Leaving a
 * match sideways therefore left Home, Matches and the tab bar rendering in
 * landscape, where they clip content and run the CTA under system chrome.
 */
export type OrientationMode = "auto" | "portrait" | "landscape";

export type LockTarget = "LANDSCAPE" | "PORTRAIT_UP" | "UNLOCK";

/** What the scoring screen locks to while focused, per picker mode. */
export function lockForMode(mode: OrientationMode): LockTarget {
  switch (mode) {
    case "landscape":
      return "LANDSCAPE";
    case "portrait":
      return "PORTRAIT_UP";
    case "auto":
      return "UNLOCK";
  }
}

/**
 * What a blur restores, whatever the match was being scored in. A constant and
 * not a function, because unmount, the back gesture, pause, a deep link and
 * crash recovery must all restore identically (spec section 4).
 */
export const RESTORE_ON_BLUR: LockTarget = "PORTRAIT_UP";

/**
 * The mode the scoring screen starts in. Landscape gives the court the most
 * room; the picker can still override to portrait or auto mid-match, which is
 * why the picker is kept rather than replaced by a hard lock (spec 4a).
 */
export const DEFAULT_SCORING_MODE: OrientationMode = "landscape";
