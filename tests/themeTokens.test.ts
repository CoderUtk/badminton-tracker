import { contrastRatio } from "../src/lib/contrast";
import { C, danger, selected, space } from "../src/theme";

const AA = 4.5;
// Every surface body or secondary text can sit on.
const SURFACES = [C.bg, C.bgElev, C.card, C.cardHi] as const;

describe("text tokens meet WCAG AA on every surface", () => {
  for (const surface of SURFACES) {
    it(`text is AA on ${surface}`, () => {
      expect(contrastRatio(C.text, surface)).toBeGreaterThanOrEqual(AA);
    });
    it(`text2 is AA on ${surface}`, () => {
      expect(contrastRatio(C.text2, surface)).toBeGreaterThanOrEqual(AA);
    });
    it(`text3 is AA on ${surface}`, () => {
      expect(contrastRatio(C.text3, surface)).toBeGreaterThanOrEqual(AA);
    });
  }

  it("keeps text3 visibly dimmer than text2", () => {
    // Otherwise the third tier is decorative only and the hierarchy is a lie.
    expect(contrastRatio(C.text2, C.bg)).toBeGreaterThan(contrastRatio(C.text3, C.bg));
  });
});

describe("ghost is decorative only", () => {
  it("is the old failing text3 value, retained for non-text use", () => {
    expect(C.ghost).toBe("#5C6472");
  });
  it("does not meet AA, which is why it must never colour text", () => {
    expect(contrastRatio(C.ghost, C.bg)).toBeLessThan(AA);
  });
});

describe("spacing grid", () => {
  it("has every value divisible by 4", () => {
    for (const v of Object.values(space)) expect(v % 4).toBe(0);
  });
});

describe("danger recipe", () => {
  it("never fills — a red fill means primary action", () => {
    expect(danger.backgroundColor).toBe("transparent");
  });
  it("outlines in brand red", () => {
    expect(danger.borderColor).toBe(C.red);
  });
});

describe("selected recipe", () => {
  it("carries no hue", () => {
    // Cyan was rejected: it already means DRAFT, and at higher luminance than
    // red it would make passive selection louder than the primary action.
    expect(selected.backgroundColor).toBe(C.cardHi);
    expect(selected.borderColor).toBe(C.lineHi);
    expect(selected.backgroundColor).not.toBe(C.accent);
    expect(selected.backgroundColor).not.toBe(C.red);
  });
});
