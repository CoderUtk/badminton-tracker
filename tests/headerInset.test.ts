import { Platform } from "react-native";
import { headerInset } from "../src/lib/headerInset";

// The whole point of this helper is that a transparent, floating header leaves
// content unpadded unless someone supplies the gap. If it ever returns 0 for a
// pushed screen, every headered screen's first row lands under the title bar.
describe("headerInset", () => {
  afterEach(() => { Platform.OS = "ios"; });

  it("clears the status bar plus the header bar on a pushed screen", () => {
    const bar = Platform.OS === "ios" ? 44 : 56;
    expect(headerInset(47)).toBe(47 + bar);
    expect(headerInset(0)).toBe(bar);
  });

  it("ignores the safe-area value for an iOS modal", () => {
    // An iOS sheet is already inset from the top of the display. Adding the
    // status bar height there pushes content roughly a status bar too far
    // down — the bug this branch exists to prevent.
    Platform.OS = "ios";
    expect(headerInset(47, "modal")).toBe(headerInset(0, "modal"));
  });

  it("adds the safe-area value for an Android modal", () => {
    // Android's modal presentation is a full-screen transition, not an inset
    // sheet — its header sits flush under the status bar like a pushed
    // screen's, so skipping the inset here left the header overlapping the
    // first row of content on Android.
    Platform.OS = "android";
    expect(headerInset(47, "modal")).toBe(47 + 56);
    expect(headerInset(47, "modal")).toBeGreaterThan(headerInset(0, "modal"));
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
