# PWA packaging for the CourtSide web build

**Date:** 2026-09-01
**Status:** Approved, not yet implemented
**Depends on:** `docs/superpowers/specs/2026-09-01-web-guest-match-storage-design.md` (shipped) — the web build is a functioning guest app; this makes it installable.

## Problem

`expo export -p web` produces a working guest app in `dist/`, and `wrangler.jsonc`
(`name: courtside`, `assets: ./dist`) can already publish it to Cloudflare. But
the export is a plain web page:

- No web app manifest — no "Add to Home Screen" identity, no standalone display,
  no icon on the home screen.
- No service worker — every launch is a cold network fetch of a 1.1 MB gzip
  bundle; opening the app with no connection shows the browser's offline error.
- No iOS install affordance — iOS Safari never prompts; a user who doesn't know
  the Share-sheet trick can't install it at all.

## Goals

1. The web build installs to the home screen on iOS Safari and Android Chrome
   with a proper name (`CourtSide`), icon, and standalone (chrome-less) display.
2. Repeat launches are instant (app shell served from cache) and a launch with
   no connection reaches the app shell rather than a browser error page.
3. iOS Safari users see a one-time, dismissible hint explaining the Share →
   "Add to Home Screen" step.
4. `npm run deploy:web` builds and publishes to Cloudflare in one command, with
   cache headers that let the service worker and HTML update immediately while
   the content-hashed bundle stays immutable.

## Non-goals

- Offline data. Web is online-only (per the guest-match spec). The service
  worker caches the **app shell** — HTML, JS, fonts, icons — and nothing from
  Supabase.
- A custom "Install app" button for Android/desktop. Those browsers fire their
  own `beforeinstallprompt` UI; we do not intercept it.
- Web push notifications.
- The score-screen header-nav observation from the guest-match E2E (buttons
  wrote data but didn't navigate in a headless browser) — tracked separately.
- The `MatchScreen` orientation-lock behaviour on web — tracked separately.
- CI auto-deploy. Deploy is the manual `npm run deploy:web` for now.

## Global constraints

- Expo SDK `^54.0.36`, `expo-router ~6.0.24`, React Native `0.81`, `react-native-web`.
- `expo export -p web` copies the repo-root `public/` directory verbatim into
  `dist/`. Every static PWA file lives under `public/` and is referenced by a
  root-absolute path (`/manifest.webmanifest`, `/sw.js`, `/icons/...`).
- **No new runtime dependencies.** The service worker is hand-written. Icon
  generation uses a one-off tool (`npx sharp-cli` or equivalent) at
  implementation time; the resulting PNGs are committed, the tool is not added
  to `package.json`.
- Brand colors from `src/theme.ts`: background / status-bar `#0C0E12`, accent
  `#FF3B30`, text `#F2F4F8`. The PWA `theme_color` and `background_color` are
  both `#0C0E12` (the app is dark end-to-end; a coloured status bar would seam).
- App identity: name `CourtSide`, short name `CourtSide`, URL scheme `badminton`
  (native only — irrelevant to the manifest), hosting = Cloudflare Workers
  static assets via the existing `wrangler.jsonc`.
- The iOS install hint renders only when ALL of: `Platform.OS === "web"`,
  the UA is iOS Safari (not Chrome/Firefox on iOS, not Android, not desktop),
  the app is not already running standalone, and the user has not dismissed it
  before.
- Shared-checkout commit rule: explicit pathspec always, never `git add -A` /
  `git add .` / `git commit -a`.

## Architecture

Five independent pieces:

| Unit | File(s) | Responsibility |
|---|---|---|
| **Manifest + icons** | `public/manifest.webmanifest`, `public/icons/*.png` | Static PWA identity. No logic. |
| **HTML shell injection** | `public/index.html` (new) | Plain HTML template (SPA `web.output: single` override) adding `<link rel="manifest">`, `apple-touch-icon`, `theme-color`, `apple-mobile-web-app-*` meta, and the inline service-worker registration script. |
| **Service worker** | `public/sw.js` | App-shell cache. On `install`: precache the stable-named shell files. On `fetch`: navigations → network-first with cached `/index.html` fallback; same-origin static assets → cache-first (bundle names are content-hashed = immutable). On `activate`: delete caches whose name ≠ current. |
| **iOS install hint** | `src/lib/pwa.ts` (predicate), `src/components/IosInstallHint.tsx` (UI), mount in `app/_layout.tsx` | `shouldShowIosInstallHint(env)` is a pure function of `{ua, standalone, dismissed}`. The component renders a dismissible bottom sheet when it returns true; dismissal writes `localStorage`. |
| **Deploy** | `scripts/stamp-sw.js` (new), `package.json` `deploy:web` script, `public/_headers` | `deploy:web` = `expo export -p web` → stamp a build id into `dist/sw.js` → `wrangler deploy`. `_headers` sets `Cache-Control` per path. |

### 1. Manifest + icons

`public/manifest.webmanifest`:

```json
{
  "id": "/",
  "name": "CourtSide",
  "short_name": "CourtSide",
  "description": "Score badminton matches. No account needed.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#0C0E12",
  "theme_color": "#0C0E12",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- `orientation: "any"` — `MatchScreen` locks orientation itself per scoring mode;
  the manifest must not fight it.
- `display: "standalone"` — chrome-less, keeps a back-affordance. Not
  `fullscreen` (would hide the iOS status-bar clock during a match).

Icons, derived once from `assets/icon.png` (the CourtSide shuttlecock mark),
committed under `public/icons/`:

| File | Size | Notes |
|---|---|---|
| `icon-192.png` | 192×192 | `purpose: any`. Transparent bg OK. |
| `icon-512.png` | 512×512 | `purpose: any`. |
| `icon-maskable-512.png` | 512×512 | Mark scaled to ~80% and centred on a solid `#0C0E12` field so Android's mask can't clip it. |
| `apple-touch-icon.png` | 180×180 | Solid `#0C0E12` background (iOS ignores transparency and fills black otherwise). |

Generation (implementation-time, not committed to deps), e.g.:
`npx --yes sharp-cli --input assets/icon.png --output public/icons/icon-512.png resize 512 512`
and a flatten step for the maskable / apple variants. The plan spells out exact
commands.

### 2. HTML shell — `public/index.html`

This project builds with `web.output: single`, so the shell is a plain HTML
template at `public/index.html` (Expo's SPA template override — `app/+html.tsx`
only applies to `web.output: static`/`server`). It is not a TSX component: it
uses `%WEB_TITLE%` / `%LANG_ISO_CODE%` placeholders, and `expo export -p web`
injects the favicon `<link>` and the entry `<script>`. The `<head>` carries all
PWA metadata plus the inline service-worker registration. Equivalent content:

```tsx
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Web-only HTML shell. Expo Router uses this in place of its default template
 * for `expo export -p web`. Everything PWA-related that must be in <head>
 * before React mounts lives here.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <title>CourtSide</title>

        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0C0E12" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CourtSide" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.ico" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: bodyReset }} />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: swRegister }} />
      </body>
    </html>
  );
}

const bodyReset = `
html, body { height: 100%; }
body { overflow: hidden; background-color: #0C0E12; }
#root { display: flex; height: 100%; flex: 1; }
`;

const swRegister = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
`;
```

- `background-color: #0C0E12` on `body` kills the white flash before the JS
  bundle paints — matters most for a standalone launch.
- The SW registration is inline (not a module) so it runs without waiting on the
  bundle, and is a no-op on any browser without `serviceWorker`.

### 3. Service worker — `public/sw.js`

```js
// Hand-written app-shell service worker. The web build is online-only
// (guest-match spec) — this caches the shell so repeat launches are instant and
// an offline launch reaches the app rather than the browser's error page. It
// never caches Supabase requests.
//
// ponytail: cache name carries a build id stamped in by scripts/stamp-sw.js at
// deploy time, so every deploy self-invalidates. No manual version bumps.
const BUILD = '__SW_BUILD__';
const CACHE = 'courtside-shell-' + BUILD;

const SHELL = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch Supabase / cross-origin

  if (req.mode === 'navigate') {
    // Network-first: a fresh index.html when online, the cached shell when not.
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Static assets (content-hashed bundle, fonts, icons) — cache-first, fill on miss.
  event.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
    )
  );
});
```

- `__SW_BUILD__` is a literal placeholder. `scripts/stamp-sw.js` replaces it in
  `dist/sw.js` after export. Because the placeholder changes every deploy, the
  file changes, the browser re-installs the SW, and `activate` purges the prior
  cache (including the previous bundle's now-stale entries).
- No precache of the hashed JS bundle (its name isn't known at author time); the
  first navigation after install pulls it and the cache-first branch stores it.
  Trade-off: the very first offline launch after install, before any online
  visit, would reach the shell HTML but fail to boot React. Acceptable — install
  itself requires a working connection.

### 4. iOS install hint

`src/lib/pwa.ts`:

```ts
/** Inputs a caller gathers from the environment. Pure so it is unit-testable. */
export interface IosHintEnv {
  userAgent: string;
  /** navigator.standalone === true, or display-mode: standalone matches. */
  standalone: boolean;
  /** localStorage flag already set. */
  dismissed: boolean;
}

const IOS_SAFARI = /iP(hone|od|ad)/;
const IN_APP_OR_OTHER_BROWSER = /(CriOS|FxiOS|EdgiOS|GSA)/; // Chrome/Firefox/Edge/Google-app on iOS

/** Whether to show the "Add to Home Screen" hint. */
export function shouldShowIosInstallHint(env: IosHintEnv): boolean {
  if (env.standalone || env.dismissed) return false;
  return IOS_SAFARI.test(env.userAgent) && !IN_APP_OR_OTHER_BROWSER.test(env.userAgent);
}

export const IOS_HINT_DISMISSED_KEY = "ios_install_hint_dismissed";
```

`src/components/IosInstallHint.tsx`:

- On mount (web only): read `navigator.userAgent`, compute `standalone` from
  `('standalone' in navigator && navigator.standalone) || window.matchMedia('(display-mode: standalone)').matches`,
  read `localStorage.getItem(IOS_HINT_DISMISSED_KEY)`, call
  `shouldShowIosInstallHint`. Wrap `localStorage` access in try/catch.
- If true, render a bottom sheet (reuse the app's sheet styling — same
  `C.card` / `C.line` tokens as `app/guest/matches.tsx` cards): a line of copy
  ("Add CourtSide to your home screen — tap Share, then \"Add to Home
  Screen\""), an inline SVG of the iOS Share glyph, and a "Got it" dismiss
  button that sets the localStorage flag and hides the sheet.
- First line of the component body: `if (Platform.OS !== "web") return null;`.
  So it renders `null` on native and whenever the predicate is false.
- Mounted unconditionally in `app/_layout.tsx` beside `<Toaster />` — no
  `Platform` branch at the mount site; the component's own early-return handles
  native.

### 5. Deploy

`scripts/stamp-sw.js`:

```js
// Replaces the __SW_BUILD__ placeholder in the exported service worker with a
// unique id so every deploy invalidates the previous shell cache.
const fs = require("fs");
const path = require("path");

const swPath = path.join(__dirname, "..", "dist", "sw.js");
const src = fs.readFileSync(swPath, "utf8");
if (!src.includes("__SW_BUILD__")) {
  throw new Error("dist/sw.js has no __SW_BUILD__ placeholder — did public/sw.js change?");
}
fs.writeFileSync(swPath, src.replace(/__SW_BUILD__/g, String(Date.now())));
console.log("stamped dist/sw.js");
```

`package.json` scripts:

```json
"deploy:web": "expo export -p web && node scripts/stamp-sw.js && wrangler deploy"
```

`public/_headers` (Cloudflare Workers static assets honours `_headers` —
implementer verifies against current Wrangler docs; if unsupported, move the
rules into `wrangler.jsonc` `assets.headers` or a Worker script):

```
/_expo/*
  Cache-Control: public, max-age=31536000, immutable
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache
```

- `no-cache` (not `no-store`) on `sw.js` / `index.html`: the browser may keep a
  copy but must revalidate every time, so a deploy propagates on the next
  launch.

## Testing

1. **`shouldShowIosInstallHint`** — unit test (`tests/pwa.test.ts`), table of
   cases: iOS Safari + fresh → true; iOS Safari + standalone → false; iOS Safari
   + dismissed → false; iOS Chrome (`CriOS`) → false; Android Chrome → false;
   desktop → false.
2. **`public/` is copied** — after `expo export -p web`, assert
   `dist/manifest.webmanifest`, `dist/sw.js`, `dist/icons/icon-512.png`,
   `dist/_headers` all exist. A shell check in the plan; optionally a
   `tests/` script.
3. **`stamp-sw.js`** — run it against a fixture containing `__SW_BUILD__`,
   assert the placeholder is gone and replaced with digits; run against a
   fixture without the placeholder, assert it throws.
4. **`public/index.html`** — the export's `dist/index.html` contains
   `<link rel="manifest"`, `apple-touch-icon`, `theme-color`, and the
   `navigator.serviceWorker.register` script. Shell grep in the plan.
5. **Manual (documented in the plan, run by a human):**
   - Lighthouse PWA audit on the deployed origin — installable, has a service
     worker, manifest valid.
   - Android Chrome: visit → install prompt appears → installed app opens
     standalone with the CourtSide icon.
   - iOS Safari: visit → hint sheet appears → dismiss persists across reload →
     Share → Add to Home Screen → installed app opens standalone, no browser
     chrome, correct icon and name.
   - Offline: install, kill connection, relaunch → app shell loads (guest home
     renders as far as it can without network).

## Rollout

1. Land the code (manifest, icons, `public/index.html`, SW, hint, deploy script).
2. `npm run deploy:web` — publishes to the `courtside` Workers origin.
3. Run the manual checklist against that origin.
4. If a custom domain is wanted, add it in the Cloudflare dashboard and update
   `start_url` / `scope` only if the app moves to a subpath (it will not —
   served at origin root).

## File structure summary

| Path | New / modified | Purpose |
|---|---|---|
| `public/manifest.webmanifest` | new | PWA manifest |
| `public/icons/icon-192.png` | new | 192 icon |
| `public/icons/icon-512.png` | new | 512 icon |
| `public/icons/icon-maskable-512.png` | new | maskable icon |
| `public/icons/apple-touch-icon.png` | new | iOS home-screen icon |
| `public/sw.js` | new | app-shell service worker |
| `public/_headers` | new | Cloudflare cache-control rules |
| `public/index.html` | new | web HTML shell with PWA `<head>` + SW registration |
| `src/lib/pwa.ts` | new | `shouldShowIosInstallHint` predicate + key constant |
| `src/components/IosInstallHint.tsx` | new | dismissible iOS install sheet |
| `app/_layout.tsx` | modified | mount `<IosInstallHint />` |
| `scripts/stamp-sw.js` | new | stamp build id into `dist/sw.js` |
| `package.json` | modified | `deploy:web` script |
| `tests/pwa.test.ts` | new | `shouldShowIosInstallHint` + `stamp-sw` tests |
