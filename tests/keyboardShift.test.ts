import { keyboardShift } from "../src/lib/keyboardShift";

// Realistic geometry from the audit device (realme NARZO 80 Lite, 360x800dp):
// IME ~270dp, the format-row/hint/CTA block ~180dp, gesture nav inset ~24dp,
// and the Doubles/Singles row ~56dp is all we are willing to push off-screen.
const DEVICE = { belowContentHeight: 180, bottomInset: 24, maxShift: 56 };

describe("keyboardShift", () => {
  it("is zero when the keyboard is closed", () => {
    expect(keyboardShift({ keyboardHeight: 0, ...DEVICE })).toBe(0);
  });

  it("is zero when the content below the field already absorbs the keyboard", () => {
    // A 150dp keyboard fits inside the 180dp block; nothing needs to move.
    expect(keyboardShift({ keyboardHeight: 150, ...DEVICE })).toBe(0);
  });

  it("lifts by the uncovered remainder", () => {
    // 270 - 180 - 24 = 66, clamped to maxShift 56.
    expect(keyboardShift({ keyboardHeight: 270, ...DEVICE })).toBe(56);
  });

  it("lifts partially when the remainder is under maxShift", () => {
    // 240 - 180 - 24 = 36, which is under 56, so it lifts exactly 36.
    expect(keyboardShift({ keyboardHeight: 240, ...DEVICE })).toBe(36);
  });

  it("never returns a negative shift", () => {
    expect(keyboardShift({ keyboardHeight: 10, ...DEVICE })).toBe(0);
  });

  it("never exceeds maxShift, however tall the keyboard", () => {
    expect(keyboardShift({ keyboardHeight: 900, ...DEVICE })).toBe(56);
  });

  it("degrades to no shift when the layout has not been measured yet", () => {
    // belowContentHeight is 0 before onLayout fires; maxShift 0 means the
    // screen simply behaves as it does today rather than jumping.
    expect(keyboardShift({ keyboardHeight: 270, belowContentHeight: 0, bottomInset: 0, maxShift: 0 })).toBe(0);
  });
});
