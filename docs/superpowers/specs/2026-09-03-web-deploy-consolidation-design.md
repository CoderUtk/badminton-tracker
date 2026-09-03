# Web deploy consolidation: one Vercel origin serving the Expo web app

**Date:** 2026-09-03
**Status:** Approved, not yet implemented
**Supersedes deploy portions of:** `docs/superpowers/specs/2026-08-05-share-links-design.md` (static `web/join` fallback pages), `docs/superpowers/specs/2026-09-01-pwa-packaging-design.md` (Cloudflare Workers host).

## Problem

`https://courtside-links.vercel.app/join/tournament/<id>/spectator` returns 404.

Current topology — two Vercel projects on one repo:

| Project | Root dir | Serves | Domain |
|---|---|---|---|
| `courtside-privacy` (`prj_5DbAQ…`) | `.` (root `vercel.json`, `outputDirectory: site`) | `site/index.html` (privacy), `site/delete-account.html` | `courtside-privacy.vercel.app` — the Play Console data-deletion URL |
| `web` (`prj_AIk9j…`) | `web/` (`web/vercel.json`) | `web/join/index.html` static fallback + `web/assetlinks.json` | `courtside-links.vercel.app` |

The `web` project has a `web/vercel.json` rewrite `"/join/(.*)" → "/join/index.html"`, but the deploy is broken/stale — unlike `courtside-privacy`, the `web` project was never git-connected (`f992be1` connected only privacy), so `courtside-links.vercel.app` is not serving the current `web/` contents. Every tournament join / spectator / scorer share link is dead.

The 2026-08-05 design's static "open in the app / get it on Play Store" fallback page also predates the web app existing. Now `app/join/tournament/[id]/spectator.tsx` is a real route a guest can use in a browser (anonymous Supabase session + `tournament_spectator_view` RPC, no membership needed — see the guest-match spec), so a deep link should land on the **working spectate view**, not a Play Store nag.

## Goal

`courtside-links.vercel.app` builds and serves the Expo web export (`dist/`) as a single origin, with:

1. **SPA fallback** — `/join/...` and every other client route resolve to `index.html`; expo-router handles them client-side. No 404 on deep links.
2. **Android App Links** — `/.well-known/assetlinks.json` served on this origin so `autoVerify` finally succeeds and an installed app opens the link directly.
3. **PWA intact** — the manifest, service worker, icons, and `#0C0E12` shell from the 2026-09-01 PWA work still ship (they live in `public/`, copied into `dist/`), with the cache-control headers ported from Cloudflare `_headers` to `vercel.json`.
4. **Privacy pages preserved** — `/delete-account` and the privacy policy stay reachable on this same origin.
5. **`git push` deploys** — the project is git-connected like `courtside-privacy`.

## Non-goals

- iOS Universal Links / `associatedDomains`. The app is not on the App Store; the PWA is the iOS story. iOS deep links open the browser web app, which the SPA fallback makes work.
- The Cloudflare Workers deploy (`wrangler.jsonc`, `wrangler` in `deploy:web`). Removed — Vercel is the single host.
- A purchased custom domain. Staying on `courtside-links.vercel.app`.
- Live tournament data on any server-rendered page. Everything is the client SPA hitting Supabase.
- Changing `app.json`'s `intentFilters` — the host is already `courtside-links.vercel.app` with `autoVerify: true`.

## Global constraints

- Expo SDK `^54.0.36`, `expo-router ~6.0.24`, RN `0.81`. `expo export -p web` (`web.output: single`) copies repo-root `public/` verbatim into `dist/` and emits `dist/index.html` + the content-hashed entry bundle.
- Android package `com.navalo.courtside`. `assetlinks.json` fingerprints (3, already in `web/assetlinks.json` — Play App Signing + two upload keys) are reused verbatim.
- `EXPO_PUBLIC_JOIN_LINK_DOMAIN=courtside-links.vercel.app` (already set in `.env`) — unchanged. `shareJoin.ts` and `joinLinkDisplayDomain()` already read it.
- Vercel checks the filesystem before applying `rewrites`, so a physical file at a path always wins over a catch-all rewrite.
- PWA constraints from the 2026-09-01 spec still hold: service worker caches the app shell only, never Supabase/cross-origin; `theme_color`/`background_color` `#0C0E12`.
- Shared-checkout commit rule: explicit pathspec always, never `git add -A` / `git add .` / `git commit -a`.
- Play Console has a data-deletion URL currently pointing at `courtside-privacy.vercel.app/delete-account`. This spec moves that page to `courtside-links.vercel.app/delete-account`; **updating the Play Console field is a manual human step**, called out in the plan.

## Architecture

### 1. Root `vercel.json` — build + serve the Expo app

Replace the current privacy-only config:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "npm install",
  "buildCommand": "npm run build:web && node scripts/stamp-sw.js",
  "outputDirectory": "dist",
  "cleanUrls": true,
  "rewrites": [
    { "source": "/((?!_expo/|assets/|icons/|\\.well-known/|manifest\\.webmanifest|sw\\.js|favicon\\.ico|privacy\\.html|delete-account\\.html).*)", "destination": "/index.html" }
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

- The `rewrites` negative-lookahead is belt-and-braces: Vercel already serves the real files first, but excluding them keeps the intent legible and protects against a future Vercel default change.
- `cleanUrls: true` gives `/delete-account` from `dist/delete-account.html` (the Play Console URL shape) and `/privacy` from `dist/privacy.html`.
- `node scripts/stamp-sw.js` runs after `expo export` (it stamps `dist/sw.js` — the same script the PWA work built, minus its now-removed Cloudflare consumer).
- `installCommand` is set explicitly because the old config had `"installCommand": null` (no install — right for a static folder, wrong now that the build needs the dependency tree).

### 2. `.vercelignore` — updated

The current file exists because a CLI `vercel deploy` from the fat working tree would upload 2.5 GB. With git integration Vercel clones fresh (no `node_modules`, no `.claude`), so the file matters only for local CLI deploys. Rewrite it to exclude the heavy/irrelevant trees but allow the source the build needs:

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

(Do NOT use the old `/*` + allowlist form — the build now needs the whole app source, not just `site/`.)

### 3. `public/.well-known/assetlinks.json` — new

Create with the exact contents of `web/assetlinks.json`:

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

`expo export` copies it to `dist/.well-known/assetlinks.json`. Vercel serves it directly (filesystem beats rewrite); the `vercel.json` header forces `Content-Type: application/json`.

### 4. Privacy pages fold into `public/`

- `git mv site/index.html public/privacy.html`
- `git mv site/delete-account.html public/delete-account.html`
- Remove the now-empty `site/` directory.
- If either HTML references a sibling by a root-absolute path (e.g. `/delete-account` from the privacy page, or a shared stylesheet), keep it working — with `cleanUrls` both resolve. Check and adjust the two files' internal links only if they break.

`dist/privacy.html` and `dist/delete-account.html` are served directly; `/privacy` and `/delete-account` resolve via `cleanUrls`.

### 5. Remove the Cloudflare + old-static-site pieces

- Delete `wrangler.jsonc`.
- Delete `public/_headers` (Cloudflare-only; its rules are now in `vercel.json`).
- Delete `web/` entirely (`web/assetlinks.json` → moved to `public/.well-known/`; `web/join/index.html` → replaced by the real app; `web/vercel.json` → obsolete; `web/.vercel/` → a stale project link).
- `package.json` `deploy:web`: change from
  `expo export -p web && node scripts/stamp-sw.js && npx --yes wrangler deploy`
  to
  `expo export -p web && node scripts/stamp-sw.js`
  (local build+stamp; the actual publish is `git push` via the Vercel git integration, or `npx vercel --prod` for a manual deploy). Keep `build:web` as `expo export -p web` unchanged.
- `scripts/stamp-sw.js` is unchanged — still exports `stampSw` and stamps `dist/sw.js` when run directly.

### 6. `src/components/share/CardShell.tsx` — use the configured domain

Replace the hardcoded constant and text:

```tsx
import { joinLinkDisplayDomain } from "../../lib/shareJoin";
// ...
const domain = joinLinkDisplayDomain(); // reads EXPO_PUBLIC_JOIN_LINK_DOMAIN, or null
const joinUrl = domain ? `https://${domain}/join` : null;
```

- QR: render the `<QRCode value={joinUrl} />` and the two `<Text>` lines **only when `joinUrl` is non-null**. When the env var is unset the card shows the wordmark alone (this is the exact contract `joinLinkDisplayDomain()`'s doc-comment already describes — a `badminton://` URL is a dead end on a shared story).
- Display line: `{domain}/join` instead of the literal string.

### 7. `app.json` — no change

`android.intentFilters[0].data[0]` is already `{ scheme: https, host: courtside-links.vercel.app, pathPrefix: /join }` with `autoVerify: true`. It starts verifying successfully once `assetlinks.json` is live on that origin. **Verification only re-runs on app install/update**, so an installed build picks it up on its next store update (next `versionCode` bump) — noted in the plan, not blocking the web fix.

## The Vercel project change (human, in the dashboard — prerequisite)

The code above assumes `courtside-links.vercel.app` is a git-connected Vercel project whose **Root Directory is the repo root** and which uses the root `vercel.json`. Today that domain belongs to the `web` project rooted at `web/`. The human must, in the Vercel dashboard, either:

- **(a)** Repoint the existing `web` project: set Root Directory to `.`, connect it to the GitHub repo (production branch `master`), and move the `courtside-links.vercel.app` domain onto it if it isn't already; **and** delete or unalias the `courtside-privacy` project (its pages now ship from this one). Then update the Play Console data-deletion URL to `https://courtside-links.vercel.app/delete-account`.
- **(b)** Create a fresh project from the repo root, alias `courtside-links.vercel.app` to it, retire both `web` and `courtside-privacy`.

Either way the end state is one git-connected project, root-dir `.`, serving `dist/`. The plan lists these as explicit manual steps; the code changes are independent of which path is taken.

## Testing

**Local (in the plan as runnable steps):**
1. `npm run build:web && node scripts/stamp-sw.js` — `Exported: dist`, `dist/sw.js` stamped.
2. `npx --yes serve -s dist -l 4173` then, against `http://localhost:4173`:
   - `/join/tournament/00000000-0000-4000-8000-000000000000/spectator` — returns `index.html` (200, the app shell), NOT 404. (`serve -s` = SPA mode, mirrors the Vercel rewrite.)
   - `/.well-known/assetlinks.json` — the JSON array, 3 fingerprints.
   - `/delete-account.html` and `/privacy.html` — the two pages.
   - `/manifest.webmanifest`, `/sw.js` — present.
3. In a browser at `http://localhost:4173/join/tournament/<a real tournament id>/spectator` — the spectate route renders (guest/anon), no crash. (Needs a real tournament id and the prod Supabase env; a synthetic id showing the route's own "not found" state is an acceptable substitute.)
4. `npm test` — full suite green (only `CardShell.tsx` is app code; add/adjust a test only if `CardShell` had one — it does not; a render-smoke is out of scope).

**Post-deploy (in the plan as a human checklist):**
- `curl -sI https://courtside-links.vercel.app/sw.js` → `cache-control: no-cache`.
- `curl -sI https://courtside-links.vercel.app/` → `cache-control: no-cache`.
- `curl -s https://courtside-links.vercel.app/.well-known/assetlinks.json` → the JSON, `content-type: application/json`.
- `curl -sI https://courtside-links.vercel.app/join/tournament/x/spectator` → `200`, `content-type: text/html`.
- `https://courtside-links.vercel.app/delete-account` loads.
- Android App Links: `https://developers.google.com/digital-asset-links/tools/generator` statement-list test against the origin, or `adb shell pm get-app-links com.navalo.courtside` on a device with the next build.
- Lighthouse PWA audit still passes (installable, SW, manifest).

## File-change summary

| Path | Change |
|---|---|
| `vercel.json` | rewrite: build Expo, serve `dist/`, SPA rewrite, PWA headers, assetlinks content-type |
| `.vercelignore` | rewrite: exclude heavy trees, allow app source |
| `public/.well-known/assetlinks.json` | new (from `web/assetlinks.json`) |
| `public/privacy.html` | `git mv` from `site/index.html` |
| `public/delete-account.html` | `git mv` from `site/delete-account.html` |
| `site/` | removed |
| `web/` | removed |
| `wrangler.jsonc` | removed |
| `public/_headers` | removed (rules moved to `vercel.json`) |
| `package.json` | `deploy:web` drops the `wrangler deploy` tail |
| `src/components/share/CardShell.tsx` | use `joinLinkDisplayDomain()`, hide QR block when unset |
| `app.json` | unchanged |
| `docs/superpowers/specs/2026-09-01-pwa-packaging-design.md` | note: host is Vercel, not Cloudflare (small edit) |
