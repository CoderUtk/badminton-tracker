/**
 * Stand-in for packages Metro pulls into the bundle that this app never calls.
 * Wired up in metro.config.js — see there for which packages and why.
 *
 * The shape has to satisfy any import form without knowing the real module's
 * API, because it stands in for several unrelated packages:
 *
 *   import csstree, { List } from 'css-tree';   // default + named
 *   import cssSelect from 'css-select';         // callable default
 *   export { replayIntegration } from '...';    // re-exported name
 *
 * So every property resolves to a function that throws only when *called*.
 * Importing, destructuring, and re-exporting all stay silent; the moment real
 * code actually reaches one of these we get a named error naming the package
 * rather than an "undefined is not a function" ten frames away.
 *
 * `__esModule: true` matters: Babel's interop reads it to decide whether
 * `default` is the module itself or a property of it, and the re-export form
 * above goes through that path.
 */
/**
 * Properties the runtime (or a test framework) reads and *calls on its own*,
 * without any library asking it to. Each must read as absent, because turning
 * one into a throwing function means an ordinary console.log, JSON.stringify
 * or promise resolution crashes — a dead import becoming a live bug, which is
 * the opposite of the point. Symbols and anything a function already owns are
 * handled separately in the trap below.
 */
const IMPLICITLY_INVOKED = new Set([
  "then", // promise resolution / await import(...)
  "catch",
  "finally",
  "toJSON", // JSON.stringify
  "$$typeof", // React element check
  "nodeType", // React/DOM shape checks
  "asymmetricMatch", // jest matchers
  "_isMockFunction",
]);

function stub(name) {
  return new Proxy(
    function stubbed() {
      throw new Error(
        `${name} is stubbed out of this bundle (see metro.config.js) but was called. ` +
          `If this feature is now in use, drop it from STUBBED_MODULES.`
      );
    },
    {
      get(target, prop) {
        if (prop === "__esModule") return true;
        if (prop === "default") return target;
        if (IMPLICITLY_INVOKED.has(prop)) return undefined;
        // Anything a function already carries — toString, valueOf,
        // constructor, prototype, name, length, call/apply/bind — plus every
        // symbol (Symbol.toPrimitive, inspection) passes through untouched.
        // Shadowing these with a throwing function breaks string coercion and
        // logging, so merely console.logging a stubbed value would crash.
        if (typeof prop === "symbol" || prop in target) {
          return Reflect.get(target, prop);
        }
        return stub(`${name}.${String(prop)}`);
      },
    }
  );
}

module.exports = stub("stubbed module");
