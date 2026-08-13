import {
  DEFAULT_SCORING_MODE,
  lockForMode,
  RESTORE_ON_BLUR,
  type OrientationMode,
} from "../src/lib/orientationLock";

describe("lockForMode", () => {
  it("locks landscape for the landscape mode", () => {
    expect(lockForMode("landscape")).toBe("LANDSCAPE");
  });

  it("locks portrait-up for the portrait mode", () => {
    expect(lockForMode("portrait")).toBe("PORTRAIT_UP");
  });

  it("releases the lock for auto, which is what auto means", () => {
    expect(lockForMode("auto")).toBe("UNLOCK");
  });

  it("returns a target for every mode the picker can produce", () => {
    const modes: OrientationMode[] = ["auto", "portrait", "landscape"];
    for (const mode of modes) expect(lockForMode(mode)).toBeTruthy();
  });
});

describe("RESTORE_ON_BLUR", () => {
  it("forces portrait-up", () => {
    expect(RESTORE_ON_BLUR).toBe("PORTRAIT_UP");
  });

  it("is never an unlock", () => {
    // This is the entire bug in audit H6. MatchScreen restored with
    // unlockAsync(), which hands orientation to the sensors instead of forcing
    // portrait, so leaving a match sideways stranded every other screen in
    // landscape. If this assertion ever fails, H6 has regressed.
    expect(RESTORE_ON_BLUR).not.toBe("UNLOCK");
  });

  it("does not depend on which mode the match was being scored in", () => {
    // Unmount, back gesture, pause and crash-recovery must all restore the
    // same way (spec section 4), so the restore is a constant, not a function
    // of state.
    expect(typeof RESTORE_ON_BLUR).toBe("string");
  });
});

describe("DEFAULT_SCORING_MODE", () => {
  it("is landscape", () => {
    // Spec 4a: landscape is the default the scoring screen takes on focus,
    // replacing the old unlockAsync(). The picker can still override it.
    expect(DEFAULT_SCORING_MODE).toBe("landscape");
  });

  it("maps to an actual landscape lock", () => {
    expect(lockForMode(DEFAULT_SCORING_MODE)).toBe("LANDSCAPE");
  });
});
