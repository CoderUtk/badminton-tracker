import { Platform } from "react-native";
import { headerInset } from "../src/lib/headerInset";

// The whole point of this helper is that a transparent, floating header leaves
// content unpadded unless someone supplies the gap. If it ever returns 0 for a
// pushed screen, every headered screen's first row lands under the title bar.
describe("headerInset", () => {
  it("clears the status bar plus the header bar on a pushed screen", () => {
    const bar = Platform.OS === "ios" ? 44 : 56;
    expect(headerInset(47)).toBe(47 + bar);
    expect(headerInset(0)).toBe(bar);
  });

  it("ignores the safe-area value for a modal", () => {
    // A sheet is already inset from the top of the display. Adding the status
    // bar height there pushes content roughly a status bar too far down — the
    // bug this branch exists to prevent.
    expect(headerInset(47, "modal")).toBe(headerInset(0, "modal"));
  });

  it("never returns a gap small enough to hide content under the header", () => {
    for (const top of [0, 20, 47, 59]) {
      expect(headerInset(top)).toBeGreaterThanOrEqual(44);
      expect(headerInset(top, "modal")).toBeGreaterThanOrEqual(44);
    }
  });

  it("defaults to a pushed screen", () => {
    expect(headerInset(47)).toBe(headerInset(47, "card"));
  });
});
