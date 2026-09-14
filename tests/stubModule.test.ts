/**
 * The Metro stub (config/stub-module.js) stands in for packages that are
 * imported but never called — see metro.config.js for the list and the
 * reasoning. Its whole job is to be inert at import time and loud at call
 * time, so those are the two things worth pinning down: every import shape
 * those packages use must resolve silently, and any actual call must throw a
 * message that names what to do about it.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const stub = require("../config/stub-module.js");

describe("metro stub module", () => {
  it("looks like an ES module so Babel interop takes the right branch", () => {
    expect(stub.__esModule).toBe(true);
  });

  it("resolves a default import (css-select is imported that way)", () => {
    expect(stub.default).toBeDefined();
  });

  it("resolves named imports without throwing (`import csstree, { List }`)", () => {
    expect(() => {
      const { List, walk, generate } = stub;
      return [List, walk, generate];
    }).not.toThrow();
  });

  it("resolves a re-exported name (`export { replayIntegration } from ...`)", () => {
    expect(() => stub.replayIntegration).not.toThrow();
  });

  it("resolves nested property access without throwing", () => {
    expect(() => stub.lexer.matchProperty).not.toThrow();
  });

  it("throws a message naming the fix when actually called", () => {
    expect(() => stub.walk()).toThrow(/stubbed out of this bundle/);
    expect(() => stub.walk()).toThrow(/STUBBED_MODULES/);
  });

  it("throws when used as a constructor (`new List()`)", () => {
    expect(() => new stub.List()).toThrow(/stubbed out of this bundle/);
  });

  it("survives string coercion and logging rather than throwing", () => {
    // Shadowing toString/valueOf with a throwing function meant that merely
    // console.logging or interpolating a stubbed value crashed — which is how
    // a stub turns a dead import into a live bug.
    expect(() => String(stub.anything)).not.toThrow();
    expect(() => `${stub.anything}`).not.toThrow();
    expect(() => JSON.stringify({ v: stub.anything })).not.toThrow();
  });

  it("is not thenable, so `await import(...)` cannot hang on it", () => {
    expect(stub.then).toBeUndefined();
  });

  it("is not mistaken for a React element", () => {
    expect(stub.$$typeof).toBeUndefined();
  });
});
