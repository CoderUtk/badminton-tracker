# Web Deploy Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `courtside-links.vercel.app` build and serve the Expo web export (`dist/`) as one origin — SPA fallback so `/join/...` deep links resolve instead of 404-ing, Android App Links `assetlinks.json` on that origin, the PWA shell/headers intact, and the two privacy pages folded in — retiring the Cloudflare deploy and the separate `web/` + `site/` static sites.

**Architecture:** `vercel.json` at the repo root gains a `buildCommand` (`expo export -p web` + the SW build-stamp) and `outputDirectory: dist`, a catch-all rewrite to `/index.html` (Vercel serves real files first), and the cache-control headers ported from the deleted Cloudflare `public/_headers`. `assetlinks.json` and the two privacy HTML pages move into `public/` so `expo export` copies them into `dist/`. `wrangler.jsonc`, `public/_headers`, `web/`, and `site/` are deleted. `src/components/share/CardShell.tsx` stops hard-coding the join domain and reads it from the env var like the rest of the share code. The Vercel-project reconfiguration and Play Console URL updates are manual human steps (Task 4).

**Tech Stack:** Expo SDK `^54.0.36`, `expo-router ~6.0.24`, React Native `0.81`, `react-native-web`, Vercel (git-integrated static deploy), Jest (ts-jest, node env).

**Spec:** `docs/superpowers/specs/2026-09-03-web-deploy-consolidation-design.md`

## Global Constraints

- Expo SDK `^54.0.36`, `expo-router ~6.0.24`, RN `0.81`. `web.output: single`. `expo export -p web` copies repo-root `public/` (recursively, subdirs included) into `dist/` and emits `dist/index.html` + a content-hashed entry bundle.
- Android package `com.navalo.courtside`. The `assetlinks.json` fingerprints (3) are copied verbatim from `web/assetlinks.json` — do not regenerate or alter them.
- `EXPO_PUBLIC_JOIN_LINK_DOMAIN=courtside-links.vercel.app` is already set in `.env` — unchanged. `src/lib/shareJoin.ts` exposes `joinLinkDisplayDomain(): string | null` reading it.
- Vercel checks the filesystem before applying `rewrites` — a physical file at a path wins over a catch-all rewrite.
- PWA constraints stay: `theme_color`/`background_color` `#0C0E12`; the service worker (`public/sw.js`) caches the app shell only, never Supabase/cross-origin. The SW cache headers must remain `no-cache` for `/sw.js`, `/`, `/index.html`, `/manifest.webmanifest`; immutable for `/_expo/*` and `/assets/*`.
- `app.json` is NOT modified by this plan (its `intentFilters` host is already `courtside-links.vercel.app`, `autoVerify: true`).
- Shared-checkout commit rule: explicit pathspec always, never `git add -A` / `git add .` / `git commit -a`. Never stage `package-lock.json`.
- Task 4 (Vercel dashboard reconfig, deploy, Play Console URL changes, App Links verification) is a **human checklist** — an agent executor stops at the end of Task 3 and hands Task 4 to the user.

---

## File Structure

| Path | Change | Task |
|---|---|---|
| `public/.well-known/assetlinks.json` | new — Android Digital Asset Links (from `web/assetlinks.json`) | 1 |
| `public/privacy.html` | `git mv` from `site/index.html`; fix one internal link | 1 |
| `public/delete-account.html` | `git mv` from `site/delete-account.html`; fix one internal link | 1 |
| `site/` | removed (now empty) | 1 |
| `vercel.json` | rewritten — build Expo, serve `dist/`, SPA rewrite, PWA headers, assetlinks content-type | 2 |
| `.vercelignore` | rewritten — exclude heavy trees, allow app source | 2 |
| `public/_headers` | removed (rules moved into `vercel.json`) | 2 |
| `wrangler.jsonc` | removed (Cloudflare host retired) | 2 |
| `web/` | removed (`assetlinks.json` moved; `join/index.html` replaced by the real app) | 2 |
| `package.json` | `deploy:web` drops the `&& npx --yes wrangler deploy` tail | 2 |
| `docs/superpowers/specs/2026-09-01-pwa-packaging-design.md` | one-line note: host is Vercel, not Cloudflare | 2 |
| `src/components/share/CardShell.tsx` | read domain from `joinLinkDisplayDomain()`, hide the QR block when unset | 3 |
| `tests/shareJoin.test.ts` | add a case only if the null branch of `joinLinkDisplayDomain` is uncovered | 3 |

---

## Task 1: Move assetlinks + privacy pages into `public/`

**Files:**
- Create: `public/.well-known/assetlinks.json`
- Move: `site/index.html` → `public/privacy.html`, `site/delete-account.html` → `public/delete-account.html`
- Delete: `site/` (empty afterwards)

**Interfaces:**
- Consumes: `web/assetlinks.json` (source of the fingerprint array — `web/` itself is deleted in Task 2).
- Produces (available after `expo export -p web` — verified in Task 2): `dist/.well-known/assetlinks.json`, `dist/privacy.html`, `dist/delete-account.html`.

- [ ] **Step 1: Create the assetlinks file**

```bash
mkdir -p public/.well-known
```

Create `public/.well-known/assetlinks.json` with exactly:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.navalo.courtside",
      "sha256_cert_fingerprints": [
        "07:CA:F2:B7:4D:44:8A:2F:4B:D0:43:F4:7A:0C:03:F5:8B:72:AB:8E:16:65:A7:89:66:5B:8E:6E:0B:72:11:97",
        "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C",
        "8B:65:4E:87:BA:2F:52:21:0C:E1:A2:60:32:EE:40:D7:EE:5F:09:76:8B:59:D7:23:39:30:50:8C:D1:5B:CA:40"
      ]
    }
  }
]
```

- [ ] **Step 2: Verify it is valid JSON and matches the source**

```bash
node -e "
const fs=require('fs');
const a=JSON.parse(fs.readFileSync('public/.well-known/assetlinks.json','utf8'));
const b=JSON.parse(fs.readFileSync('web/assetlinks.json','utf8'));
if (JSON.stringify(a)!==JSON.stringify(b)) throw new Error('assetlinks differs from web/assetlinks.json');
console.log('assetlinks ok:', a[0].target.sha256_cert_fingerprints.length, 'fingerprints');
"
```

Expected: `assetlinks ok: 3 fingerprints`.

- [ ] **Step 3: Move the privacy pages**

```bash
git mv site/index.html public/privacy.html
git mv site/delete-account.html public/delete-account.html
```

- [ ] **Step 4: Fix the internal links in both pages**

The two pages currently link to each other assuming the privacy policy is served at `/` (its old root on `courtside-privacy.vercel.app`). On the new origin the policy is at `/privacy`.

In `public/delete-account.html`, find:

```html
<p>See the <a href="/">CourtSide Privacy Policy</a> for what we collect and why.</p>
```

Change `href="/"` to `href="/privacy"`.

In `public/privacy.html`, find the link to the deletion page:

```html
<a href="/delete-account">request deletion from the web</a>
```

Leave it — `/delete-account` still resolves (via `cleanUrls` in Task 2's `vercel.json`, and `dist/delete-account.html` exists).

Grep both files for any other root-absolute `href="/..."` or `src="/..."` and, if found, verify the target still exists in `dist/` after Task 2's build; adjust only if broken. (A `mailto:` link and relative asset references are fine.)

- [ ] **Step 5: Remove the now-empty `site/` directory**

```bash
rmdir site 2>/dev/null || true
git status --porcelain site/ 2>/dev/null
```

Expected: `site/` no longer exists; `git status` shows the two files as renamed (`R`) into `public/` and nothing left under `site/`.

- [ ] **Step 6: Confirm the existing suite is unaffected**

Run: `npm test`
Expected: PASS, same count as before (no app code changed — these are static assets jest never imports).

- [ ] **Step 7: Commit**

```bash
git add public/.well-known/assetlinks.json public/privacy.html public/delete-account.html
git commit -m "feat(web): move assetlinks + privacy pages into public/ for the Expo web build"
```

(`git mv` already staged the renames; the `git add` picks up the new assetlinks file and the link edits. Verify with `git status` that `site/` deletions are staged too — if not, `git add site/`.)

---

## Task 2: Rewrite `vercel.json` + `.vercelignore`; delete Cloudflare + `web/`

**Files:**
- Modify: `vercel.json` (full rewrite)
- Modify: `.vercelignore` (full rewrite)
- Delete: `public/_headers`, `wrangler.jsonc`, `web/` (recursive)
- Modify: `package.json` — `scripts.deploy:web`
- Modify: `docs/superpowers/specs/2026-09-01-pwa-packaging-design.md` — one line

**Interfaces:**
- Consumes: Task 1's `public/.well-known/assetlinks.json`, `public/privacy.html`, `public/delete-account.html`; the existing `public/sw.js`, `public/manifest.webmanifest`, `public/icons/`, `public/index.html`; `scripts/stamp-sw.js` (`stampSw` — unchanged); `package.json` `build:web` = `expo export -p web`.
- Produces: a `vercel.json` that, given `dist/` from `npm run build:web && node scripts/stamp-sw.js`, serves the SPA with deep-link fallback + PWA headers + assetlinks. `deploy:web` = `expo export -p web && node scripts/stamp-sw.js`.

- [ ] **Step 1: Rewrite `vercel.json`**

Replace the entire file with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "npm install",
  "buildCommand": "npm run build:web && node scripts/stamp-sw.js",
  "outputDirectory": "dist",
  "cleanUrls": true,
  "rewrites": [
    {
      "source": "/((?!_expo/|assets/|icons/|\\.well-known/|manifest\\.webmanifest|sw\\.js|favicon\\.ico|privacy\\.html|delete-account\\.html).*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    { "source": "/_expo/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/icons/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=86400" }] },
    { "source": "/favicon.ico", "headers": [{ "key": "Cache-Control", "value": "public, max-age=86400" }] },
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/manifest.webmanifest", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/index.html", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/.well-known/assetlinks.json", "headers": [{ "key": "Content-Type", "value": "application/json" }] }
  ]
}
```

- [ ] **Step 2: Rewrite `.vercelignore`**

Replace the entire file with:

```
node_modules
.claude
.superpowers
dist
android
ios
graphify-out
*.log
```

(The old `/*` + `!/site` allowlist form is wrong now — the build needs the whole app source, not just `site/`.)

- [ ] **Step 3: Delete the Cloudflare + old-static pieces**

```bash
git rm public/_headers wrangler.jsonc
git rm -r web
```

Expected: 3 removals staged (`public/_headers`, `wrangler.jsonc`, `web/` — which contains `assetlinks.json`, `join/index.html`, `vercel.json`; `web/.vercel/` is git-ignored and not tracked, remove the on-disk dir with `rm -rf web` if `git rm -r web` leaves it).

- [ ] **Step 4: Update `package.json` `deploy:web`**

In `package.json` `scripts`, change:

```
"deploy:web": "expo export -p web && node scripts/stamp-sw.js && npx --yes wrangler deploy"
```

to:

```
"deploy:web": "expo export -p web && node scripts/stamp-sw.js"
```

Leave `build:web` (`expo export -p web`) and every other script unchanged.

- [ ] **Step 5: One-line note in the PWA spec**

In `docs/superpowers/specs/2026-09-01-pwa-packaging-design.md`, find the line in "## Problem" or "## Global constraints" that says the host is Cloudflare Workers via `wrangler.jsonc`. Add, right after it:

```markdown
> **Superseded 2026-09-03:** the web app is hosted on Vercel (one git-connected project serving `dist/`), not Cloudflare. `wrangler.jsonc` and `public/_headers` were removed; the cache rules moved into `vercel.json`. See `docs/superpowers/specs/2026-09-03-web-deploy-consolidation-design.md`.
```

Do not rewrite the rest of that spec.

- [ ] **Step 6: Build and stamp**

Run:

```bash
npm run build:web && node scripts/stamp-sw.js
```

Expected: `Exported: dist`, then `stamped dist/sw.js -> <digits>`.

- [ ] **Step 7: Verify the build output has everything the deploy needs**

```bash
node -e "
const fs=require('fs');
const need=['dist/index.html','dist/sw.js','dist/manifest.webmanifest','dist/.well-known/assetlinks.json','dist/privacy.html','dist/delete-account.html','dist/icons/icon-512.png'];
for (const f of need) if (!fs.existsSync(f)) throw new Error('missing: '+f);
if (fs.readFileSync('dist/sw.js','utf8').includes('__SW_BUILD__')) throw new Error('sw.js not stamped');
console.log('dist output complete');
"
```

Expected: `dist output complete`.

- [ ] **Step 8: Verify SPA fallback + static-file precedence with `serve -s`**

`serve -s` mimics Vercel's "serve real files, fall back to index.html" behaviour.

```bash
npx --yes serve -s dist -l 4173 &
SERVE_PID=$!
sleep 2
echo "--- deep link (expect 200 + <div id=root) ---"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4173/join/tournament/00000000-0000-4000-8000-000000000000/spectator"
curl -s "http://localhost:4173/join/tournament/x/spectator" | grep -c 'id="root"'
echo "--- assetlinks (expect the JSON) ---"
curl -s "http://localhost:4173/.well-known/assetlinks.json" | node -e "const a=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('fingerprints:', a[0].target.sha256_cert_fingerprints.length)"
echo "--- privacy pages (expect 200) ---"
curl -s -o /dev/null -w "privacy.html %{http_code}\n" "http://localhost:4173/privacy.html"
curl -s -o /dev/null -w "delete-account.html %{http_code}\n" "http://localhost:4173/delete-account.html"
echo "--- real asset not swallowed by rewrite (expect 200) ---"
curl -s -o /dev/null -w "sw.js %{http_code}\n" "http://localhost:4173/sw.js"
kill $SERVE_PID
```

Expected: deep link `200` and grep count `1`; `fingerprints: 3`; both privacy pages `200`; `sw.js 200`.

(If `serve` on Windows Git Bash backgrounds poorly, run it in one terminal and the curls in another. The assertions are what matter.)

- [ ] **Step 9: Full suite green**

Run: `npm test`
Expected: PASS, unchanged count (no app code touched in this task).

- [ ] **Step 10: Commit**

```bash
git add vercel.json .vercelignore package.json docs/superpowers/specs/2026-09-01-pwa-packaging-design.md
git commit -m "build(web): serve the Expo app from Vercel with SPA fallback; drop Cloudflare + web/"
```

(`git rm` from Step 3 already staged the deletions — include them by verifying `git status` shows `public/_headers`, `wrangler.jsonc`, `web/*` as deleted and staged before committing; if the commit above misses them, `git add -u public/_headers wrangler.jsonc web` — explicit paths only.)

---

## Task 3: `CardShell.tsx` reads the join domain from config

**Files:**
- Modify: `src/components/share/CardShell.tsx`
- Test: `tests/shareJoin.test.ts` (add one case only if needed)

**Interfaces:**
- Consumes: `joinLinkDisplayDomain(): string | null` from `src/lib/shareJoin.ts` (returns `process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN || null`).
- Produces: nothing new — behavioural change only. When the env var is set, the card shows a QR to `https://<domain>/join` and the text `<domain>/join`. When unset, the card shows the wordmark alone (no QR, no link text).

- [ ] **Step 1: Check whether the null branch of `joinLinkDisplayDomain` is already tested**

```bash
grep -n "joinLinkDisplayDomain" tests/shareJoin.test.ts
```

If there is a test asserting `joinLinkDisplayDomain()` returns `null` when the env var is unset AND one asserting it returns the domain when set, skip Step 2. Otherwise do Step 2.

- [ ] **Step 2 (only if needed): Add the coverage**

Append to `tests/shareJoin.test.ts` (match the file's existing import + mock style — it already manipulates `process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN`):

```ts
describe("joinLinkDisplayDomain", () => {
  const KEY = "EXPO_PUBLIC_JOIN_LINK_DOMAIN";
  const original = process.env[KEY];
  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it("returns the domain when the env var is set", () => {
    process.env[KEY] = "example.test";
    expect(joinLinkDisplayDomain()).toBe("example.test");
  });

  it("returns null when the env var is unset", () => {
    delete process.env[KEY];
    expect(joinLinkDisplayDomain()).toBeNull();
  });
});
```

Add `joinLinkDisplayDomain` to the existing import from `"../src/lib/shareJoin"` at the top of the file if it is not already imported.

Run: `npx jest tests/shareJoin.test.ts`
Expected: PASS (existing tests + the 2 new ones).

- [ ] **Step 3: Rewrite the domain-dependent part of `CardShell.tsx`**

Replace lines 1-31 (imports through the end of the component's `return`) so the file reads:

```tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import QRCode from "react-native-qrcode-svg";
import Logo from "../Logo";
import { joinLinkDisplayDomain } from "../../lib/shareJoin";
import { C, F, GRAD, radius } from "../../theme";

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const TOP_MARGIN = 130;
const BOTTOM_MARGIN = 360;

export default function CardShell({ children }: { children: React.ReactNode }) {
  const domain = joinLinkDisplayDomain();

  return (
    <View style={s.canvas}>
      <LinearGradient colors={GRAD.court} style={StyleSheet.absoluteFill} />
      <View style={s.topBar}>
        <Logo size={44} />
      </View>
      <View style={s.safeZone}>{children}</View>
      {domain && (
        <View style={s.watermark}>
          <View style={s.qrBox}>
            <QRCode value={`https://${domain}/join`} size={140} color={C.bg} backgroundColor={C.text} />
          </View>
          <Text style={s.link}>{domain}/join</Text>
          <Text style={s.linkSub}>Scan to join CourtSide</Text>
        </View>
      )}
    </View>
  );
}
```

Leave the `StyleSheet.create({...})` block below it exactly as is.

- [ ] **Step 4: Confirm the build compiles for web and native**

Run: `npm run build:web`
Expected: `Exported: dist`, no TypeScript / Metro errors.

- [ ] **Step 5: Full suite green**

Run: `npm test`
Expected: PASS (existing count, plus the 2 `joinLinkDisplayDomain` tests if Step 2 was needed).

- [ ] **Step 6: Commit**

```bash
git add src/components/share/CardShell.tsx tests/shareJoin.test.ts
git commit -m "feat(share): CardShell reads the join domain from config, hides QR when unset"
```

(Drop `tests/shareJoin.test.ts` from the `git add` if Step 2 was skipped.)

---

## Task 4: Deploy, dashboard reconfig, and verification (human)

**Files:** none — infrastructure and manual verification.

**Interfaces:**
- Consumes: everything from Tasks 1-3, merged to the production branch.
- Produces: a recorded pass/fail of the deep-link fix and App Links on the live origin.

**Status 2026-09-03: DONE except Play Console + device App Links + Lighthouse (see "Remaining" below).**

Live commits beyond the merge (`fb8b42e`): `6ec9d8e` (rebuild trigger), `89dc01b` + `c1ebf6b` (`vercel.json` fixes — see Step 2 note).

- [x] **Step 1: Reconfigure the Vercel project** — took path (a). The project owning `courtside-links.vercel.app` is named **`badminton-tracker`** (org `coderutks-projects`), already git-connected to `CoderUtk/badminton-tracker` on `master`. Changed **Root Directory** `web` → empty (repo root). Framework Preset already "Other". `courtside-privacy` project NOT yet deleted — see Remaining.

- [x] **Step 1b: Build-time env vars** — added all 4 to the `badminton-tracker` project as **Config** type, scoped **Production + Preview + Development**:
  `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_JOIN_LINK_DOMAIN` (`courtside-links.vercel.app`), `EXPO_PUBLIC_SENTRY_DSN`. `SENTRY_AUTH_TOKEN` deliberately omitted.

- [x] **Step 2: Deploy** — git push auto-build. **`vercel.json` needed two fixes after merge**: the plan's `{ "source": "/(.*)", "destination": "/index.html" }` rewrite was silently **inert** on Vercel (`cleanUrls: true` forbids the `.html` destination and/or Vercel auto-applied Expo framework routing). Fix = Expo's official Vercel SPA config: added `"framework": null` and changed the rewrite to `{ "source": "/:path*", "destination": "/" }`. `headers` and `cleanUrls` worked the whole time; only `rewrites` was dropped. Final production deployment: `c1ebf6b`, Ready.

- [x] **Step 3: Curl the live origin** — all pass:
  - deep links `/join/tournament/<id>/spectator`, `/join/club/<id>`, `/join/tournament/<id>/scorer`, `/matches`, `/guest` → `200`, each serves the app shell (`id="root"` present)
  - `/sw.js` `200` `application/javascript` + `Cache-Control: no-cache`
  - `/manifest.webmanifest` `200` `application/manifest+json` + `no-cache`
  - `/favicon.ico` `200`; `/metadata.json` `200`
  - `/.well-known/assetlinks.json` `200` `application/json`
  - `/privacy` `200`, `/delete-account` `200`
  - `/` `Cache-Control: no-cache`; `/_expo/*` `public, max-age=31536000, immutable`

- [x] **Step 4: Browser check** — `https://courtside-links.vercel.app/join/tournament/e839862b-d4cb-4d3e-845c-22d50f8eb5ae/spectator` (the original 404 report) renders the CourtSide **Spectating** view (tournament bracket, live Supabase data), zero console errors. Not a Vercel 404.

- [ ] **Step 5: Update the Play Console URLs** — REMAINING (needs Play Console login).
  In Google Play Console → the app → App content / Store presence:
  - **Data deletion URL**: `https://courtside-privacy.vercel.app/delete-account` → `https://courtside-links.vercel.app/delete-account`
  - **Privacy policy URL**: `https://courtside-privacy.vercel.app` (or `/`) → `https://courtside-links.vercel.app/privacy`

- [ ] **Step 5b: Retire `courtside-privacy`** — REMAINING. After Step 5 lands, delete the `courtside-privacy` Vercel project (still exists, still git-connected to the same repo, builds redundantly on every push). Do NOT delete before Step 5 or the old data-deletion URL 404s.

- [~] **Step 6: Android App Links verification**
  - [x] Statement-list test — **PASS**. `curl "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://courtside-links.vercel.app&relation=delegate_permission/common.handle_all_urls"` returns all **3** fingerprints for `com.navalo.courtside`, no errors.
  - [ ] Device check — REMAINING. `adb shell pm get-app-links com.navalo.courtside` after installing a build with a bumped `versionCode` (`autoVerify` re-runs on install/update only — will not verify against the current store build).

- [ ] **Step 7: Lighthouse** — REMAINING (optional; PWA criteria already substantively verified in Step 3 — manifest served with valid type, SW registered, cache headers correct). Chrome DevTools → Lighthouse → PWA against `https://courtside-links.vercel.app`.

- [x] **Step 8: Record results** — recorded here (Steps 3-4, 6 statement test) and in session memory `web-deploy-consolidation-task4-pending`.

---

## Self-Review

**1. Spec coverage**

| Spec section / requirement | Task |
|---|---|
| Goal 1 — SPA fallback, no deep-link 404 | 2 Step 1 (`rewrites`), verified 2 Step 8, 4 Step 3-4 |
| Goal 2 — Android App Links / `assetlinks.json` on origin | 1 Steps 1-2, 2 Step 1 (content-type header), 4 Step 6 |
| Goal 3 — PWA intact (manifest/SW/icons/headers) | 2 Step 1 (`headers`), 2 Step 7, 4 Step 7 |
| Goal 4 — privacy pages preserved on same origin | 1 Steps 3-4, verified 2 Step 8, 4 Step 3 |
| Goal 5 — `git push` deploys | 4 Step 1 (git-connect) |
| Arch 1 — root `vercel.json` build+serve | 2 Step 1 |
| Arch 2 — `.vercelignore` updated | 2 Step 2 |
| Arch 3 — `public/.well-known/assetlinks.json` from `web/assetlinks.json` | 1 Steps 1-2 |
| Arch 4 — privacy pages fold into `public/`, fix internal links | 1 Steps 3-4 |
| Arch 5 — delete `wrangler.jsonc`, `public/_headers`, `web/`; `deploy:web` change | 2 Steps 3-4 |
| Arch 6 — `CardShell.tsx` env-driven, hide QR when unset | 3 Step 3 |
| Arch 7 — `app.json` unchanged | not a task (constraint) |
| "The Vercel project change (human)" | 4 Step 1 |
| Play Console URL move | 4 Step 5 |
| Testing — local serve checks, post-deploy curl, App Links, Lighthouse | 2 Step 8, 4 Steps 3-7 |
| PWA spec doc note (file-change summary row) | 2 Step 5 |
| Non-goals (iOS Universal Links, Cloudflare, custom domain) | not implemented — no task |

No gaps.

**2. Placeholder scan**

No "TBD"/"TODO"/"handle edge cases". Every code step is a full file or block. `<a real tournament id>` / `<digits>` / `<BASE>` are described runtime values, not unfilled blanks. The one conditional step (Task 3 Step 2) states its precondition explicitly and gives the full test code.

**3. Type consistency**

- `joinLinkDisplayDomain(): string | null` — same signature in the Global Constraints, Task 3 interface block, Task 3 Step 2 test, and Task 3 Step 3 usage (`const domain = joinLinkDisplayDomain()` then `domain && ...`).
- `stampSw` / `scripts/stamp-sw.js` — referenced as "unchanged" in Task 2; not modified anywhere.
- `assetlinks.json` fingerprint array — byte-identical string in Task 1 Step 1 and validated against `web/assetlinks.json` in Task 1 Step 2 before `web/` is deleted in Task 2 Step 3 (order matters: Task 1 copies, Task 2 deletes the source — correct sequence).
- `dist/` output paths in Task 2 Step 7 (`dist/.well-known/assetlinks.json`, `dist/privacy.html`, `dist/delete-account.html`) match what Task 1 produces via `public/`.
- `vercel.json` `rewrites` exclusion list (`privacy\\.html`, `delete-account\\.html`, `.well-known/`) matches the files Task 1 places in `public/`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-03-web-deploy-consolidation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task (Tasks 1-3), review between tasks; Task 4 is handed to you as a checklist.

**2. Inline Execution** — execute Tasks 1-3 in this session with checkpoints; Task 4 to you.

Which approach?
