import { fillEmptySlots } from "../src/lib/matchLineup";

describe("fillEmptySlots", () => {
  it("fills a slot that was never touched", () => {
    const result = fillEmptySlots(["", "", "", ""], [false, false, false, false], [
      { name: "Alice" }, { name: "Bob" }, { name: "Carol" }, { name: "Dan" },
    ]);
    expect(result).toEqual(["Alice", "Bob", "Carol", "Dan"]);
  });

  it("never overwrites a touched slot, even if the user cleared it back to empty", () => {
    // The trim-based guard this replaces could not distinguish "never typed
    // into" from "typed into, then deleted" — both look like "". Audit P12.
    const result = fillEmptySlots(["Ut", "", "", ""], [true, true, false, false], [
      { name: "Alice" }, { name: "Bob" }, { name: "Carol" }, { name: "Dan" },
    ]);
    expect(result).toEqual(["Ut", "", "Carol", "Dan"]);
  });

  it("leaves a slot with no roster player at that index empty", () => {
    const result = fillEmptySlots(["", ""], [false, false], [{ name: "Alice" }]);
    expect(result).toEqual(["Alice", ""]);
  });
});
