# PWA Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `expo export -p web` build of CourtSide an installable PWA — home-screen install on iOS Safari and Android Chrome, instant/offline-tolerant repeat launches via an app-shell service worker, and a one-time iOS "Add to Home Screen" hint.

**Architecture:** Five independent pieces. Static PWA files (`manifest.webmanifest`, icons, `sw.js`, `_headers`) live under a new repo-root `public/` directory that `expo export -p web` copies verbatim into `dist/`. A new `app/+html.tsx` replaces Expo Router's default HTML shell to inject the manifest link, apple-touch-icon, theme-color/apple meta, and an inline service-worker registration script. The hand-written service worker caches only the app shell (never Supabase). A pure predicate `shouldShowIosInstallHint` drives a dismissible bottom-sheet component mounted in `app/_layout.tsx`. `npm run deploy:web` runs export → stamp a build id into `dist/sw.js` → `wrangler deploy`.

**Tech Stack:** Expo SDK `^54.0.36`, `expo-router ~6.0.24`, React Native `0.81`, `react-native-web`, Jest (ts-jest, node env), Cloudflare Workers static assets (`wrangler`).

**Spec:** `docs/superpowers/specs/2026-09-01-pwa-packaging-design.md`

## Global Constraints

- Expo SDK `^54.0.36`, `expo-router ~6.0.24`, RN `0.81`. `expo export -p web` copies the repo-root `public/` directory verbatim into `dist/`.
- Every static PWA file lives under `public/` and is referenced by a root-absolute path (`/manifest.webmanifest`, `/sw.js`, `/icons/...`).
- **No new runtime dependencies.** Service worker is hand-written. Icon generation uses a one-off `npx --yes sharp-cli` invocation at implementation time; the PNGs are committed, `sharp-cli` is NOT added to `package.json`.
- Colors (from `src/theme.ts`): background / status-bar `#0C0E12`, accent `#FF3B30`, text `#F2F4F8`, card `#171A21`, line `#242A33`. PWA `theme_color` AND `background_color` are both `#0C0E12`.
- App identity: `name` = `CourtSide`, `short_name` = `CourtSide`. Hosting = Cloudflare Workers static assets via existing `wrangler.jsonc` (`name: courtside`, `assets.directory: ./dist`). App served at origin root — `start_url` and `scope` are both `/`.
- The service worker's cache name embeds a build id via the literal placeholder `__SW_BUILD__`, replaced in `dist/sw.js` by `scripts/stamp-sw.js` at deploy time.
- The iOS install hint renders only when ALL of: `Platform.OS === "web"`, UA is iOS Safari (not CriOS/FxiOS/EdgiOS/GSA, not Android, not desktop), not running standalone, not previously dismissed.
- Web is online-only. Service worker caches the app shell (HTML, JS, fonts, icons) only — never Supabase requests, never cross-origin.
- Shared-checkout commit rule: explicit pathspec always, never `git add -A` / `git add .` / `git commit -a`.

---

## File Structure

| Path | New / modified | Task | Purpose |
|---|---|---|---|
| `public/manifest.webmanifest` | new | 1 | PWA manifest |
| `public/icons/icon-192.png` | new | 1 | 192 icon (`purpose: any`) |
| `public/icons/icon-512.png` | new | 1 | 512 icon (`purpose: any`) |
| `public/icons/icon-maskable-512.png` | new | 1 | maskable icon (safe-zone padded on `#0C0E12`) |
| `public/icons/apple-touch-icon.png` | new | 1 | 180 iOS home-screen icon (opaque `#0C0E12` bg) |
| `public/_headers` | new | 1 | Cloudflare cache-control rules |
| `app/+html.tsx` | new | 2 | web HTML shell: PWA `<head>` tags + SW registration script |
| `public/sw.js` | new | 3 | app-shell service worker |
| `scripts/stamp-sw.js` | new | 3 | stamp build id into `dist/sw.js`; exports `stampSw(path)` |
| `package.json` | modified | 3 | `deploy:web` script |
| `src/lib/pwa.ts` | new | 4 | `shouldShowIosInstallHint` predicate + `IOS_HINT_DISMISSED_KEY` |
| `src/components/IosInstallHint.tsx` | new | 5 | dismissible iOS install bottom sheet |
| `app/_layout.tsx` | modified | 5 | mount `<IosInstallHint />` beside `<Toaster />` |
| `tests/pwa.test.ts` | new | 3, 4 | `stampSw` + `shouldShowIosInstallHint` unit tests |

---

## Task 1: Manifest, icons, cache headers

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `public/icons/apple-touch-icon.png`
- Create: `public/_headers`

**Interfaces:**
- Consumes: `assets/icon.png` (the CourtSide shuttlecock mark, ~1024×1024, in the repo).
- Produces: root-absolute URLs `/manifest.webmanifest`, `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/icon-maskable-512.png`, `/icons/apple-touch-icon.png` (available once `public/` is copied into `dist/` — Task 2 verifies the copy).

- [ ] **Step 1: Create the manifest**

Create `public/manifest.webmanifest`:

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

- [ ] **Step 2: Verify the manifest is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/manifest.webmanifest','utf8')); console.log('valid')"`
Expected: prints `valid`.

- [ ] **Step 3: Generate the four icons from `assets/icon.png`**

Run these (they install `sharp-cli` transiently via npx; do NOT add it to package.json):

```bash
mkdir -p public/icons
npx --yes sharp-cli --input assets/icon.png --output public/icons/icon-192.png resize 192 192
npx --yes sharp-cli --input assets/icon.png --output public/icons/icon-512.png resize 512 512
# maskable: shrink the mark to 80% (410px) and center it on a 512 #0C0E12 field
npx --yes sharp-cli --input assets/icon.png --output /tmp/mark-410.png resize 410 410
npx --yes sharp-cli --input /tmp/mark-410.png --output public/icons/icon-maskable-512.png \
  extend --top 51 --bottom 51 --left 51 --right 51 --background "#0C0E12"
# apple-touch-icon: 180 on an opaque #0C0E12 field (iOS fills transparency with black otherwise)
npx --yes sharp-cli --input assets/icon.png --output /tmp/mark-180.png resize 180 180
npx --yes sharp-cli --input /tmp/mark-180.png --output public/icons/apple-touch-icon.png \
  flatten --background "#0C0E12"
```

If `sharp-cli`'s flag names differ in the installed version, use any equivalent tool (ImageMagick `magick`, an Expo image util, or a short Node script with the `sharp` module via `npx`) to produce PNGs of exactly the sizes and background treatment described. The end state — four PNGs at 192/512/512/180 with the maskable and apple variants on an opaque `#0C0E12` background — is what matters.

- [ ] **Step 4: Verify icon dimensions**

Run:

```bash
node -e "const s=require('child_process');['icon-192.png:192','icon-512.png:512','icon-maskable-512.png:512','apple-touch-icon.png:180'].forEach(x=>{const[f,n]=x.split(':');const b=require('fs').readFileSync('public/icons/'+f);const w=b.readUInt32BE(16),h=b.readUInt32BE(20);if(w!=n||h!=n)throw new Error(f+' is '+w+'x'+h+', expected '+n);console.log(f,w+'x'+h,'ok')})"
```

Expected: four `... ok` lines. (Reads PNG IHDR width/height directly — no dependency.)

- [ ] **Step 5: Create the cache headers file**

Create `public/_headers`:

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

- [ ] **Step 6: Commit**

```bash
git add public/manifest.webmanifest public/icons/icon-192.png public/icons/icon-512.png public/icons/icon-maskable-512.png public/icons/apple-touch-icon.png public/_headers
git commit -m "feat(pwa): web app manifest, icons, and Cloudflare cache headers"
```

---

## Task 2: HTML shell — `app/+html.tsx`

**Files:**
- Create: `app/+html.tsx`

**Interfaces:**
- Consumes: `/manifest.webmanifest`, `/icons/apple-touch-icon.png` (Task 1); `/sw.js` (Task 3 — the registration script references it by path; registration failing before Task 3 lands is a caught no-op).
- Produces: an `expo export -p web` whose `dist/index.html` contains `<link rel="manifest" href="/manifest.webmanifest">`, `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`, `<meta name="theme-color" content="#0C0E12">`, the `apple-mobile-web-app-*` meta tags, and an inline `navigator.serviceWorker.register('/sw.js')` script.

- [ ] **Step 1: Create the shell**

Create `app/+html.tsx`:

```tsx
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Web-only HTML shell. Expo Router renders this in place of its default
 * template for `expo export -p web`. Everything PWA-related that must be in
 * <head> before the JS bundle loads lives here.
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

- [ ] **Step 2: Build the web export**

Run: `npm run build:web`
Expected: ends with `Exported: dist`, no TypeScript or Metro errors.

- [ ] **Step 3: Verify the shell tags and the `public/` copy landed**

Run:

```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('dist/index.html','utf8');
for (const s of ['rel=\"manifest\" href=\"/manifest.webmanifest\"','rel=\"apple-touch-icon\"','name=\"theme-color\" content=\"#0C0E12\"','apple-mobile-web-app-capable','navigator.serviceWorker.register(\'/sw.js\')']) {
  if (!html.includes(s)) throw new Error('index.html missing: '+s);
}
for (const f of ['dist/manifest.webmanifest','dist/icons/icon-512.png','dist/icons/apple-touch-icon.png','dist/_headers']) {
  if (!fs.existsSync(f)) throw new Error('public/ not copied: '+f);
}
console.log('shell + public copy ok');
"
```

Expected: prints `shell + public copy ok`. (Confirms `+html.tsx` took effect and `expo export` copied `public/`. `dist/sw.js` is intentionally NOT checked here — it arrives in Task 3.)

- [ ] **Step 4: Confirm the existing test suite is unaffected**

Run: `npm test`
Expected: PASS, same count as before this task (`+html.tsx` is web-shell only; jest's node env never imports it).

- [ ] **Step 5: Commit**

```bash
git add app/+html.tsx
git commit -m "feat(pwa): web HTML shell with manifest, apple meta, and SW registration"
```

---

## Task 3: Service worker, build-stamp script, deploy command

**Files:**
- Create: `public/sw.js`
- Create: `scripts/stamp-sw.js`
- Modify: `package.json` (add `deploy:web` to `scripts`)
- Test: `tests/pwa.test.ts` (the `stampSw` describe block)

**Interfaces:**
- Consumes: `dist/sw.js` (the copy of `public/sw.js` produced by `expo export -p web`).
- Produces:
  - `public/sw.js` — a service worker whose cache name is `'courtside-shell-' + '__SW_BUILD__'` until stamped.
  - `scripts/stamp-sw.js` exports `stampSw(swPath: string): string` — reads the file at `swPath`, throws `Error` if it has no `__SW_BUILD__` substring, otherwise replaces every `__SW_BUILD__` with `String(Date.now())`, writes the file back, and returns the id it wrote. Running the script directly (`node scripts/stamp-sw.js`) calls `stampSw` on `dist/sw.js`.
  - `package.json` script `deploy:web` = `expo export -p web && node scripts/stamp-sw.js && wrangler deploy`.

- [ ] **Step 1: Write the failing `stampSw` tests**

Create `tests/pwa.test.ts`:

```ts
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { stampSw } from "../scripts/stamp-sw";

function tmpFile(contents: string): string {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sw-")), "sw.js");
  fs.writeFileSync(p, contents);
  return p;
}

describe("stampSw", () => {
  it("replaces every __SW_BUILD__ with a numeric id and returns it", () => {
    const p = tmpFile("const A='__SW_BUILD__'; const B='courtside-shell-__SW_BUILD__';");
    const id = stampSw(p);
    expect(id).toMatch(/^\d+$/);
    const out = fs.readFileSync(p, "utf8");
    expect(out).not.toContain("__SW_BUILD__");
    expect(out).toContain(`'${id}'`);
    expect(out).toContain(`courtside-shell-${id}`);
  });

  it("throws when the file has no __SW_BUILD__ placeholder", () => {
    const p = tmpFile("const A = 'already-stamped-123';");
    expect(() => stampSw(p)).toThrow(/__SW_BUILD__/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/pwa.test.ts`
Expected: FAIL — `Cannot find module '../scripts/stamp-sw'`.

- [ ] **Step 3: Write `scripts/stamp-sw.js`**

Create `scripts/stamp-sw.js`:

```js
// Replaces the __SW_BUILD__ placeholder in the exported service worker with a
// unique id, so every deploy produces a different sw.js and the browser
// re-installs it (its `activate` then purges the previous shell cache).
const fs = require("fs");
const path = require("path");

/**
 * @param {string} swPath  path to the service worker file to stamp
 * @returns {string} the id written
 */
function stampSw(swPath) {
  const src = fs.readFileSync(swPath, "utf8");
  if (!src.includes("__SW_BUILD__")) {
    throw new Error(`${swPath} has no __SW_BUILD__ placeholder — did public/sw.js change?`);
  }
  const id = String(Date.now());
  fs.writeFileSync(swPath, src.replace(/__SW_BUILD__/g, id));
  return id;
}

module.exports = { stampSw };

if (require.main === module) {
  const target = path.join(__dirname, "..", "dist", "sw.js");
  const id = stampSw(target);
  console.log(`stamped ${target} -> ${id}`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/pwa.test.ts`
Expected: PASS (2 tests in the `stampSw` block).

- [ ] **Step 5: Write the service worker**

Create `public/sw.js`:

```js
// Hand-written app-shell service worker. The web build is online-only (see the
// guest-match spec), so this caches only the shell — HTML, JS bundle, fonts,
// icons — for instant repeat launches and an offline launch that reaches the
// app rather than the browser's error page. It never touches Supabase or any
// cross-origin request.
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
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
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
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

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

- [ ] **Step 6: Add the `deploy:web` script**

In `package.json`, inside `"scripts"`, add (keep existing scripts; match the file's indentation and comma style):

```json
"deploy:web": "expo export -p web && node scripts/stamp-sw.js && wrangler deploy"
```

- [ ] **Step 7: Verify export + stamp produce a valid, stamped SW**

Run:

```bash
npm run build:web && node scripts/stamp-sw.js && node -e "
const fs=require('fs');
const sw=fs.readFileSync('dist/sw.js','utf8');
if (sw.includes('__SW_BUILD__')) throw new Error('sw.js still has placeholder');
if (!/courtside-shell-\d+/.test(sw)) throw new Error('sw.js cache name not stamped');
new (require('vm').Script)(sw); // parses as valid JS
console.log('sw.js exported, stamped, parses');
"
```

Expected: prints `sw.js exported, stamped, parses`.

- [ ] **Step 8: Full suite green**

Run: `npm test`
Expected: PASS — existing tests plus the 2 new `stampSw` tests.

- [ ] **Step 9: Commit**

```bash
git add public/sw.js scripts/stamp-sw.js package.json tests/pwa.test.ts
git commit -m "feat(pwa): app-shell service worker, build-stamp script, deploy:web"
```

---

## Task 4: iOS install-hint predicate

**Files:**
- Create: `src/lib/pwa.ts`
- Test: `tests/pwa.test.ts` (add a `shouldShowIosInstallHint` describe block)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface IosHintEnv { userAgent: string; standalone: boolean; dismissed: boolean }`
  - `shouldShowIosInstallHint(env: IosHintEnv): boolean` — `false` if `standalone` or `dismissed`; otherwise `true` iff `userAgent` matches `/iP(hone|od|ad)/` and does NOT match `/(CriOS|FxiOS|EdgiOS|GSA)/`.
  - `const IOS_HINT_DISMISSED_KEY = "ios_install_hint_dismissed"`

- [ ] **Step 1: Write the failing tests**

Append to `tests/pwa.test.ts`:

```ts
import { shouldShowIosInstallHint, IOS_HINT_DISMISSED_KEY } from "../src/lib/pwa";

const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IOS_CHROME_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

describe("shouldShowIosInstallHint", () => {
  it("true for fresh iOS Safari", () => {
    expect(shouldShowIosInstallHint({ userAgent: IOS_SAFARI_UA, standalone: false, dismissed: false })).toBe(true);
  });
  it("false when already installed (standalone)", () => {
    expect(shouldShowIosInstallHint({ userAgent: IOS_SAFARI_UA, standalone: true, dismissed: false })).toBe(false);
  });
  it("false when previously dismissed", () => {
    expect(shouldShowIosInstallHint({ userAgent: IOS_SAFARI_UA, standalone: false, dismissed: true })).toBe(false);
  });
  it("false for Chrome on iOS (CriOS)", () => {
    expect(shouldShowIosInstallHint({ userAgent: IOS_CHROME_UA, standalone: false, dismissed: false })).toBe(false);
  });
  it("false for Android Chrome", () => {
    expect(shouldShowIosInstallHint({ userAgent: ANDROID_UA, standalone: false, dismissed: false })).toBe(false);
  });
  it("false for desktop", () => {
    expect(shouldShowIosInstallHint({ userAgent: DESKTOP_UA, standalone: false, dismissed: false })).toBe(false);
  });
  it("exports the localStorage key", () => {
    expect(IOS_HINT_DISMISSED_KEY).toBe("ios_install_hint_dismissed");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/pwa.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/pwa'`.

- [ ] **Step 3: Write `src/lib/pwa.ts`**

Create `src/lib/pwa.ts`:

```ts
/** Environment facts the caller gathers. Pure inputs so this is unit-testable. */
export interface IosHintEnv {
  userAgent: string;
  /** navigator.standalone === true, or `(display-mode: standalone)` matches. */
  standalone: boolean;
  /** the dismissed flag is already set in localStorage. */
  dismissed: boolean;
}

const IOS_SAFARI = /iP(hone|od|ad)/;
// Chrome, Firefox, Edge, and the Google app on iOS — none support the
// Share -> Add to Home Screen flow the hint describes.
const OTHER_IOS_BROWSER = /(CriOS|FxiOS|EdgiOS|GSA)/;

/** Whether to show the "Add to Home Screen" hint. */
export function shouldShowIosInstallHint(env: IosHintEnv): boolean {
  if (env.standalone || env.dismissed) return false;
  return IOS_SAFARI.test(env.userAgent) && !OTHER_IOS_BROWSER.test(env.userAgent);
}

export const IOS_HINT_DISMISSED_KEY = "ios_install_hint_dismissed";
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest tests/pwa.test.ts`
Expected: PASS — the 7 `shouldShowIosInstallHint` tests plus the 2 `stampSw` tests from Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pwa.ts tests/pwa.test.ts
git commit -m "feat(pwa): shouldShowIosInstallHint predicate"
```

---

## Task 5: iOS install-hint component

**Files:**
- Create: `src/components/IosInstallHint.tsx`
- Modify: `app/_layout.tsx` (add import; render `<IosInstallHint />` immediately after `<Toaster />` on line 320)

**Interfaces:**
- Consumes: `shouldShowIosInstallHint`, `IOS_HINT_DISMISSED_KEY` from `src/lib/pwa` (Task 4); `C`, `F` from `src/theme` (`C.card` `#171A21`, `C.line` `#242A33`, `C.text` `#F2F4F8`, `C.text2`, `C.red` `#FF3B30`; `F.body`, `F.semibold`).
- Produces: default-exported `IosInstallHint` React component. Renders `null` on native, when not iOS Safari, when standalone, or when dismissed. Otherwise renders a fixed bottom sheet.

- [ ] **Step 1: Write the component**

Create `src/components/IosInstallHint.tsx`:

```tsx
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { shouldShowIosInstallHint, IOS_HINT_DISMISSED_KEY } from "../lib/pwa";
import { C, F } from "../theme";

/**
 * One-time, dismissible "Add to Home Screen" hint for iOS Safari visitors.
 * Android/desktop get the browser's own install prompt, so this is iOS-only.
 * Renders nothing on native or once installed/dismissed.
 */
export default function IosInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(IOS_HINT_DISMISSED_KEY) === "1";
    } catch {
      // private mode / storage blocked — treat as not dismissed
    }
    const standalone =
      ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true) ||
      window.matchMedia?.("(display-mode: standalone)").matches === true;
    setShow(
      shouldShowIosInstallHint({ userAgent: window.navigator.userAgent, standalone, dismissed })
    );
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(IOS_HINT_DISMISSED_KEY, "1");
    } catch {
      // ignore — the hint just reappears next visit
    }
    setShow(false);
  };

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.sheet}>
        <Text style={s.title}>Add CourtSide to your home screen</Text>
        <View style={s.row}>
          <Text style={s.body}>Tap</Text>
          <Svg width={18} height={18} viewBox="0 0 24 24">
            {/* iOS Share glyph */}
            <Path
              d="M12 2l4 4h-3v9h-2V6H8l4-4zM5 10h3v2H6v8h12v-8h-2v-2h3a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V11a1 1 0 011-1z"
              fill={C.text}
            />
          </Svg>
          <Text style={s.body}>then “Add to Home Screen”.</Text>
        </View>
        <Pressable onPress={dismiss} style={s.btn}>
          <Text style={s.btnText}>Got it</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", padding: 12 },
  sheet: {
    width: "100%", maxWidth: 420, backgroundColor: C.card, borderRadius: 16,
    borderWidth: 1, borderColor: C.line, padding: 16, gap: 10,
  },
  title: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  body: { color: C.text2, fontFamily: F.body, fontSize: 14 },
  btn: {
    alignSelf: "flex-end", backgroundColor: C.red, borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 10, marginTop: 2,
  },
  btnText: { color: C.text, fontFamily: F.semibold, fontSize: 14 },
});
```

Note: `react-native-svg` is already a dependency (used across the app — e.g. `src/components/Icon`). Confirm with `node -e "require('react-native-svg')"` before relying on it; if the import path differs, match how an existing component (`src/components/Court.tsx` or similar) imports `Svg`/`Path`.

- [ ] **Step 2: Mount it in the layout**

In `app/_layout.tsx`:

Add to the import block (near the other component imports, around line 27-28):

```tsx
import IosInstallHint from "../src/components/IosInstallHint";
```

Change line 320 from:

```tsx
    <Toaster />
```

to:

```tsx
    <Toaster />
    <IosInstallHint />
```

- [ ] **Step 3: Build the web export**

Run: `npm run build:web`
Expected: `Exported: dist`, no TypeScript / Metro errors.

- [ ] **Step 4: Full suite green**

Run: `npm test`
Expected: PASS, same count as after Task 4 (the component has no node-env test; its logic is the Task 4 predicate, already covered).

- [ ] **Step 5: Verify the component renders nothing on native**

Run:

```bash
node -e "
const React=require('react');
process.env.EXPO_OS='ios';
" 2>&1 || true
```

Then confirm by reading the code: `if (Platform.OS !== 'web') return null;` is the first effect guard and `show` starts `false`, so on native it renders `null` without touching `window`. State this check in the report — no automated native render test exists in this repo.

- [ ] **Step 6: Commit**

```bash
git add src/components/IosInstallHint.tsx app/_layout.tsx
git commit -m "feat(pwa): one-time iOS Add-to-Home-Screen hint"
```

---

## Task 6: Deploy and manual verification

**Files:** none — deploy + human verification only.

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: a recorded pass/fail of install + offline behaviour on the deployed origin.

- [ ] **Step 1: Deploy**

Run: `npm run deploy:web`
Expected: `expo export` succeeds, `stamped dist/sw.js -> <id>` prints, `wrangler deploy` reports the published URL (a `*.workers.dev` origin unless a custom domain is configured). Record the URL.

- [ ] **Step 2: Verify the deployed files**

Against the published origin `<URL>`:

```bash
curl -sI <URL>/sw.js | grep -i cache-control          # expect: no-cache
curl -sI <URL>/_expo/static/js/web/ -o /dev/null       # (informational)
curl -s <URL>/manifest.webmanifest | node -e "JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('manifest served + valid')"
curl -s <URL>/sw.js | grep -o 'courtside-shell-[0-9]*' # expect: a stamped name
```

If `cache-control` on `/sw.js` is not `no-cache`, Cloudflare Workers static assets is not honouring `public/_headers` — move the rules into `wrangler.jsonc` (`assets` block) per current Wrangler docs and redeploy.

- [ ] **Step 3: Lighthouse PWA audit**

In Chrome DevTools → Lighthouse, run against `<URL>` with the "Progressive Web App" category. Expected: "Installable" passes, "PWA optimized" checks (manifest, themed, viewport, apple-touch-icon) pass, a service worker is detected.

- [ ] **Step 4: Android Chrome install**

On an Android device (or Chrome desktop with device emulation): visit `<URL>`, wait for the install affordance (address-bar install icon or the "Add to Home screen" menu item), install, launch the installed app. Expected: opens standalone (no browser chrome), CourtSide icon on the home screen, guest home renders.

- [ ] **Step 5: iOS Safari install + hint**

On an iPhone (Safari): visit `<URL>`. Expected: the hint sheet appears at the bottom. Tap "Got it" → it disappears → reload → it stays gone. Then Share → "Add to Home Screen" → open the installed icon. Expected: opens standalone, no Safari chrome, status bar legible, correct icon and "CourtSide" name; the hint does NOT show in the installed (standalone) app.

- [ ] **Step 6: Offline launch**

After installing on either platform: enable airplane mode, launch the installed app. Expected: the app shell loads (guest home renders as far as it can without network — it will not reach Supabase, but there is no browser error page). Re-enable network, pull to refresh / relaunch → normal operation.

- [ ] **Step 7: Record results**

Write the outcome of Steps 3–6 into the PR description or a short note under `docs/` (whichever the repo convention favours — check recent commits). If a custom domain is desired, add it in the Cloudflare dashboard; `start_url`/`scope` stay `/` because the app is served at the origin root.

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| Manifest (`public/manifest.webmanifest`, exact JSON) | 1 Step 1 |
| Icons — 192 / 512 / maskable-512 / apple-touch-180, `#0C0E12` treatment | 1 Steps 3-4 |
| `public/_headers` cache rules | 1 Step 5 |
| `app/+html.tsx` — manifest link, apple-touch-icon, theme-color, apple meta, viewport-fit=cover, body bg `#0C0E12`, inline SW registration | 2 Step 1 |
| `public/` copied into `dist/` by `expo export` | 2 Step 3 |
| Service worker — install precache, activate purge, navigate network-first, asset cache-first, cross-origin skip, `__SW_BUILD__` cache name | 3 Step 5 |
| `scripts/stamp-sw.js` — `stampSw(path)`, replace / throw / run-as-main | 3 Steps 1-4 |
| `deploy:web` = export → stamp → `wrangler deploy` | 3 Step 6 |
| `shouldShowIosInstallHint(env)` predicate + `IOS_HINT_DISMISSED_KEY` | 4 |
| `IosInstallHint` component — web/iOS-Safari/not-standalone/not-dismissed gate, localStorage try/catch, bottom sheet with Share glyph + "Got it" | 5 Step 1 |
| Mount beside `<Toaster />`, no `Platform` branch at mount site | 5 Step 2 |
| Testing: predicate unit tests, `public/` copy check, stamp-sw tests, `+html` grep, manual Lighthouse/install/offline | 2 Step 3, 3 Steps 1-4, 4 Step 1, 6 |
| Rollout | 6 |
| Non-goals (offline data, custom Android button, push, score-nav bug, orientation check, CI auto-deploy) | not implemented — no task |

No gaps.

**2. Placeholder scan**

`__SW_BUILD__` is a deliberate literal placeholder in source, replaced by `stampSw`; used identically in `public/sw.js`, `scripts/stamp-sw.js`, the tests, and the constraints. No "TBD"/"TODO"/"handle edge cases". Every code step has a full code block. The two fallback hedges (`sharp-cli` flag differences in Task 1 Step 3; `_headers` support in Task 6 Step 2) each name a concrete alternative and an end-state to hit.

**3. Type consistency**

- `IosHintEnv { userAgent, standalone, dismissed }` defined in Task 4 Step 3, consumed with those exact keys in Task 4 tests and Task 5 Step 1.
- `shouldShowIosInstallHint` / `IOS_HINT_DISMISSED_KEY` — same names in Tasks 4 and 5.
- `stampSw` — same name and `(swPath: string) => string` signature in Task 3's interface block, tests, and implementation.
- Cache name `courtside-shell-<id>` — same string in `public/sw.js`, the `stampSw` test assertion, and Task 3 Step 7's regex.
- `#0C0E12` — identical in the manifest, `+html.tsx` (`theme-color` + body bg), icon generation, and the `+html` grep check.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-01-pwa-packaging.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
