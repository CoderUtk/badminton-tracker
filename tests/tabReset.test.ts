import { shouldResetTabStack } from "../src/lib/tabReset";

describe("shouldResetTabStack", () => {
  it("does not reset a stack already at its root", () => {
    expect(shouldResetTabStack(0)).toBe(false);
  });

  it("resets a stack that is anywhere deeper than root", () => {
    expect(shouldResetTabStack(1)).toBe(true);
    expect(shouldResetTabStack(3)).toBe(true);
  });

  it("does not reset a tab that has never been navigated into", () => {
    // expo-router's nested Stack state is undefined before the tab's first
    // visit — that is root, not "unknown, so reset defensively".
    expect(shouldResetTabStack(undefined)).toBe(false);
  });
});
