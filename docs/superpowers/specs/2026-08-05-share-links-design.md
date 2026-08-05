# Fix Share Links (Club Join, Tournament Player/Scorer/Spectator)

**Date:** 2026-08-05

## Problem

All four share flows (club join, tournament join as player, tournament join as scorer,
and the new tournament spectator link) build a URL with `Linking.createURL(path)`, which
uses the app's custom scheme (`badminton://join/...`, from `app.json`'s `"scheme"`).
Custom schemes are not recognized as URLs by WhatsApp, SMS, email, etc. — the shared text
renders as plain, non-tappable text. There is also no fallback when the recipient doesn't
have the app installed. Now that the app is on the Play Store, links need to work as real
tappable HTTPS links that open the app directly on Android, or send the user to install it
first.

## 1. Link infrastructure: Android App Links via Vercel

A minimal static site is added under a new `web/` directory (plain HTML, not the Expo
app — kept separate since the RN app doesn't need to build for web here) and deployed to
Vercel. It hosts:

- `web/.well-known/assetlinks.json` — declares `com.navalo.courtside` plus the Play
  **App Signing key** SHA-256 fingerprint (from Play Console → Setup → App integrity —
  this is the key Google re-signs the APK with, distinct from the upload key; the user
  must supply this value, it cannot be derived from the repo or any local keystore).
- Static fallback pages at `web/join/club/[id].html`, `web/join/tournament/[id].html`,
  `web/join/tournament/[id]/scorer.html`, `web/join/tournament/[id]/spectator.html` (or a
  single templated page serving all four paths via Vercel rewrites — implementation
  detail for the plan). Each shows a generic "Open in CourtSide" message and a Google
  Play Store button. No live tournament/club data is fetched on this page — it only
  renders when Android does *not* intercept the link (app not installed), so it doesn't
  need Supabase wiring.

`app.json` gets an `android.intentFilters` entry:
```json
"intentFilters": [{
  "action": "VIEW",
  "autoVerify": true,
  "data": [{ "scheme": "https", "host": "<vercel-domain>", "pathPrefix": "/join" }],
  "category": ["BROWSABLE", "DEFAULT"]
}]
```
This makes `https://<vercel-domain>/join/...` open the app directly when installed,
verified via `assetlinks.json` (Android Digital Asset Links). The existing `badminton://`
scheme stays registered (unchanged) as a secondary way to open the app; it's just no
longer what gets put in share text.

**Domain:** Vercel-assigned domain (e.g. `courtside-links.vercel.app` or similar — exact
name decided when the Vercel project is created; not a purchased custom domain for now).

**iOS:** out of scope. No Universal Links / `apple-app-site-association` — the user is
not shipping an iOS build yet.

## 2. `joinLink.ts` extension

- `JoinRole` becomes `"player" | "scorer" | "spectator"`.
- New `buildTournamentSpectatorJoinPath(tournamentId): string` → `` `join/tournament/${tournamentId}/spectator` ``.
- `parseJoinTarget` recognizes `parts[at+3] === "spectator"` as `role: "spectator"` (currently only checks for `"scorer"`, defaulting everything else to `"player"` — spectator needs its own explicit branch since it must route to the read-only screen, not the request-to-join screen).
- `shareJoinLink` (in `src/lib/shareJoin.ts`) switches from `Linking.createURL(path)` to `` `https://<vercel-domain>/${path}` ``. The domain is read from a constant in `shareJoin.ts` (not `app.json`, since it's a web-hosting detail, not a native app config) — set once the Vercel project is live.

## 3. Spectator: new security-definer RPC, no approval, no membership row

New Supabase RPC `tournament_spectator_view(p_tournament_id uuid)`:
- `security definer`, callable by any authenticated user (mirrors the existing
  `tournament_preview` RPC's non-membership-required pattern used by the player/scorer
  join screen).
- Returns tournament name, status, bracket cells (`round`, `idx`, `entrant_a`,
  `entrant_b`, `winner_entrant`, plus resolved entrant names), and each cell's live match
  score if `match_id` is set — enough for a read-only bracket render, scoped to exactly
  the requested `tournament_id`.
- No row is written anywhere (no `tournament_staff` insert, no approval flow) — opening
  the link is the entire "join" action, matching the "read-only, no approval" answer.
- Deliberately **not** a `bracket_matches`/`matches` RLS policy change — opening those
  tables' `select` policy to "any authenticated user" would leak every club's bracket
  data table-wide, not just the one tournament being shared. A scoped RPC keeps the
  read surface to exactly the tournament id passed in.

New screen `app/join/tournament/[id]/spectator.tsx`: calls `tournament_spectator_view`,
renders the bracket read-only (reusing the existing bracket-rendering visuals from
`app/(app)/tournaments/[id].tsx` where practical). No "Request to join" CTA — this screen
has no pending/denied states, since there's no request to make.

## 4. Wiring

`TournamentConfigTab.tsx` gets a third share button, "Share spectator link", next to the
existing player/scorer share buttons, calling
`shareJoinLink(buildTournamentSpectatorJoinPath(tournament.id), \`Watch "${tournament.name}" live on CourtSide:\`)`.

## Scope

Touches: `app.json`, new `web/` directory (Vercel project), `src/lib/joinLink.ts`,
`src/lib/shareJoin.ts`, `tests/joinLink.test.ts` (new spectator-role cases), one new
Supabase migration (`tournament_spectator_view` RPC), one new screen
(`app/join/tournament/[id]/spectator.tsx`), `src/components/TournamentConfigTab.tsx`.

Not in scope: iOS Universal Links, a purchased custom domain, live-updating the
spectator bracket view via Realtime (initial fetch only — matches how the existing
player/scorer preview screen behaves; Realtime for spectators can be a later addition
if wanted), changing how club-join or player/scorer-join links behave beyond the
URL scheme swap.

## Manual steps (not doable by the assistant)

- User must create the Vercel project and supply the resulting domain.
- User must supply the Play App Signing SHA-256 fingerprint from Play Console for
  `assetlinks.json`.
- User must run `npx supabase db push` for the new migration (standing project
  constraint — the assistant never runs this).
- User must deploy `web/` to Vercel (the assistant can prepare the files but does not
  have Vercel deploy access).

## Testing

- `tests/joinLink.test.ts`: extend for `buildTournamentSpectatorJoinPath` and
  `parseJoinTarget` returning `role: "spectator"` for `/join/tournament/{id}/spectator`
  paths, mirroring the existing scorer-role test cases.
- Manual: on a real Android device (or emulator) with the app installed, tap a shared
  `https://<vercel-domain>/join/...` link from another app (e.g. paste in Notes) and
  confirm it opens CourtSide directly, not the browser. Uninstall and re-test to confirm
  the Vercel fallback page renders with a working Play Store link.
