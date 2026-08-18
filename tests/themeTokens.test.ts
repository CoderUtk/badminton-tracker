import { contrastRatio, relativeLuminance } from "../src/lib/contrast";
import { BLOOM, C, CARD_TYPE, GRAD, GRAIN_OPACITY, carved, carvedFill, danger, selected, space } from "../src/theme";

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

describe("share card type scale", () => {
  const ORDER = ["hero", "title", "subtitle", "body", "label", "caption"] as const;

  it("is strictly descending", () => {
    const sizes = ORDER.map((k) => CARD_TYPE[k]);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeLessThan(sizes[i - 1]);
    }
  });

  it("keeps the hero clearly dominant over the card headline", () => {
    // Below ~2x the headline the hero stops reading as the one thing that matters.
    expect(CARD_TYPE.hero / CARD_TYPE.title).toBeGreaterThanOrEqual(2);
  });

  it("never drops below the 18pt floor for a 1080-wide capture", () => {
    // 18pt at 1080 is ~6pt on a phone-sized preview. Anything smaller is
    // unreadable once Instagram recompresses the image.
    for (const k of ORDER) expect(CARD_TYPE[k]).toBeGreaterThanOrEqual(18);
  });
});

/** Flattens `rgba(255,255,255,a)` over an opaque hex ground to a hex value. */
function composite(overlay: string, ground: string): string {
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(overlay);
  if (!m) throw new Error(`Expected an rgba() overlay, got "${overlay}"`);
  const [r, g, b, a] = [+m[1], +m[2], +m[3], +m[4]];
  const base = [1, 3, 5].map((i) => parseInt(ground.slice(i, i + 2), 16));
  const mix = [r, g, b].map((c, i) => Math.round(c * a + base[i] * (1 - a)));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

describe("carved surface", () => {
  // The whole effect: fill falls off downward, top edge brighter than the rest.
  it("falls off downward", () => {
    const alpha = (c: string) => Number(/([\d.]+)\)$/.exec(c)![1]);
    expect(alpha(carvedFill[0])).toBeGreaterThan(alpha(carvedFill[1]));
  });

  it("lights the top edge brighter than the frame", () => {
    expect(carved.borderTopColor).toBe(C.lineHi);
    expect(carved.borderColor).toBe(C.line);
    expect(carved.borderTopColor).not.toBe(carved.borderColor);
  });

  // A translucent card means C.card is no longer the literal surface under
  // body text, so the AA guarantees above have to be re-proved against what
  // the carved fill actually composites to — on the darkest screen stop, which
  // is the worst case (a card at the unlit bottom of a long scroll).
  const darkest = GRAD.screen.reduce((a, b) => (a < b ? a : b));
  const surface = composite(carvedFill[1], darkest);

  for (const [name, token] of [["text", C.text], ["text2", C.text2], ["text3", C.text3]] as const) {
    it(`${name} is still AA on a carved card (${surface})`, () => {
      expect(contrastRatio(token, surface)).toBeGreaterThanOrEqual(AA);
    });
  }

  it("never composites lighter than cardHi, which would outrank a selected card", () => {
    // selected = C.cardHi. If a resting carved card were lighter, selection
    // would read as the lower state.
    const lit = composite(carvedFill[0], GRAD.screen[0]);
    expect(relativeLuminance(lit)).toBeLessThan(relativeLuminance(C.cardHi));
  });
});

describe("ambient blooms", () => {
  it("stay below the level where the screen reads tinted, not lit", () => {
    for (const b of BLOOM) expect(b.opacity).toBeLessThan(0.2);
  });

  it("uses brand hues only", () => {
    for (const b of BLOOM) expect([C.accent, C.red]).toContain(b.color);
  });

  it("keeps grain subliminal", () => {
    // Above ~0.08 the noise is legible as texture and reads as a dirty screen.
    expect(GRAIN_OPACITY).toBeLessThan(0.08);
  });
});
