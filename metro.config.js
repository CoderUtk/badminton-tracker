const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

/**
 * Packages Metro drags into the bundle that this app never uses. Each is
 * reached only through an unconditional re-export in a dependency's entry
 * point, so neither Metro nor Hermes can drop it on its own — the import is
 * real, it is just never called.
 *
 * Measured on the Android bundle (`npx expo export -p android`), by summing
 * sourcesContent per package from a --dump-sourcemap run:
 *
 *   css-tree (286 KB) + css-select (39 KB), and transitively entities (105 KB)
 *   and source-map (38 KB). react-native-svg's entry re-exports eight
 *   deprecated helpers from './deprecated' -> './css' -> css-tree
 *   (node_modules/react-native-svg/src/ReactNativeSVG.ts:54). This app imports
 *   only SVG primitives (Svg, Path, Rect, Circle, Line, G, Defs, Ellipse,
 *   Pattern, LinearGradient, Stop) across nine components, and
 *   react-native-qrcode-svg imports only primitives too. Every csstree and
 *   cssSelect reference in css.tsx sits inside a function body, so a stub is
 *   inert at import time.
 *
 *   @sentry-internal/replay (295 KB) and replay-canvas. Browser-only Session
 *   Replay, reached via @sentry/react-native -> @sentry/react ->
 *   `export * from '@sentry/browser'`, whose index.js re-exports them on lines
 *   24-25. Those are plain re-exports with no module-scope calls, and
 *   src/lib/observability.ts passes no `integrations` to Sentry.init, so
 *   nothing ever constructs them.
 *
 *   @sentry-internal/feedback (76 KB) looked like the same case and is NOT
 *   stubbable: @sentry/browser's feedbackSync.js and feedbackAsync.js call
 *   buildFeedbackIntegration() at module scope, so stubbing it threw during
 *   bundle evaluation and white-screened the web build. Caught by loading the
 *   exported web bundle in a browser; reading index.js alone did not show it.
 *   Verify by running, not by reading, before adding anything here.
 *
 * Deliberately NOT stubbed: @sentry/core, @sentry/browser and @sentry/react.
 * app/_layout.tsx renders Sentry.ErrorBoundary, which comes from @sentry/react
 * by way of @sentry/browser — stubbing those would take crash reporting with
 * them, which is the whole point of having Sentry here.
 *
 * If any of these features is ever genuinely adopted, delete its entry here.
 * The stub throws an error naming the package rather than failing silently.
 */
const STUBBED_MODULES = new Set([
  "css-tree",
  "css-select",
  "@sentry-internal/replay",
  "@sentry-internal/replay-canvas",
]);

const STUB = path.resolve(__dirname, "config/stub-module.js");

const config = getDefaultConfig(__dirname);

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (STUBBED_MODULES.has(moduleName)) {
    return { type: "sourceFile", filePath: STUB };
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
