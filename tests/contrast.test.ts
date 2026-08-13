import { contrastRatio, relativeLuminance } from "../src/lib/contrast";

describe("relativeLuminance", () => {
  it("returns 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("is case-insensitive", () => {
    expect(relativeLuminance("#ff3b30")).toBeCloseTo(relativeLuminance("#FF3B30"), 10);
  });
});

describe("contrastRatio", () => {
  it("returns 21 for black against white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 2);
  });

  it("returns 1 for a colour against itself", () => {
    expect(contrastRatio("#5C6472", "#5C6472")).toBeCloseTo(1, 5);
  });

  it("is order-independent", () => {
    expect(contrastRatio("#0C0E12", "#838B9D")).toBeCloseTo(
      contrastRatio("#838B9D", "#0C0E12"), 10
    );
  });

  it("measures the audit's failing text3 against the app background", () => {
    // A8: #5C6472 on #0C0E12 is the low-contrast secondary text the audit flagged.
    expect(contrastRatio("#5C6472", "#0C0E12")).toBeCloseTo(3.24, 1);
  });

  it("throws on malformed input rather than returning a plausible number", () => {
    expect(() => contrastRatio("5C6472", "#0C0E12")).toThrow();
    expect(() => contrastRatio("#5C647", "#0C0E12")).toThrow();
  });
});
