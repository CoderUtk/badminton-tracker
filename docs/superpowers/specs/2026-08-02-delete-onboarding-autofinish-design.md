# Delete, Onboarding Fields, and Session Auto-Finish — Design

**Date:** 2026-08-02
**Status:** Design approved (planning only; no implementation yet)

Three independent, buildable-now features: owner/admin can delete a session or tournament, new users are asked for age and playing hand at first login, and stale live sessions auto-finish after 24 hours.

## Context

This work was scoped out of a larger brainstorm of six ideas. Three of the six — tournament share link, court configuration with admin reassignment, and live scores on the bracket screen — all require tournaments to exist somewhere a second device can see them. They're blocked on a tournament-cloud-sync project that doesn't exist yet, and are deferred to their own design.

**A finding from this brainstorm that shapes feature 1:** sessions are local-SQLite-only, exactly like tournaments. `src/sync/runner.ts` pushes only `matches` and `match_events` to Supabase — despite `sessions`/`attendance` having Supabase tables and RLS already defined in `0001_init.sql`, nothing ever writes to them. Neither `createSession` nor `updateSessionStatus` performs any role check today, client-side or server-side. A session or tournament created on one device is invisible to every other device, including other members of the same club.

This is a pre-existing gap, not something this spec introduces or fixes. It means "owner/admin can delete" can only be a **client-side check** (reading `role` from the already-local `clubs_cache`), not a server-enforced boundary — the same trust level every other session/tournament write already has.

## 1. Delete session & tournament

**Permission:** matches `is_club_admin()` — the same role gate every other session/tournament write already uses in the Supabase schema (`0001_init.sql:149-150`) — but enforced client-side only, since sessions/tournaments never reach Supabase. The delete button renders only when the signed-in user's `Club.role` (from `getClub(clubId)`, already populated locally by `refreshClubs()`) is `"owner"` or `"admin"`.

**Semantics:** hard delete — the row is actually removed from local SQLite. This is deliberate, not a soft/reversible `'cancelled'` status (sessions already have an unused `'cancelled'` status in `SessionStatus`; tournaments have no equivalent). A mis-tap is not recoverable from the UI.

**What happens to matches:** they survive. This follows the existing schema precedent rather than inventing new behavior — `matches.session_id references sessions(id) on delete set null` in `0001_init.sql:77`, and `bracket_matches.tournament_id references tournaments(id) on delete cascade` in `0002_tournaments.sql:18` cascades only the bracket structure, never the underlying `matches` rows (`bracket_matches.match_id references matches(id) on delete set null` points the other way). Deleting a session or tournament unlinks its matches from that container; match history, stats, and points-for-against for every player involved are untouched. The **local SQLite equivalent** of this precedent is implemented explicitly in code (SQLite has no FK cascade enforcement active here), matching what the Supabase schema already encodes.

**UI:** a "Delete session" / "Delete tournament" ghost-danger button at the bottom of the session/tournament detail screen, same visual treatment as Profile's existing "Sign out" button (`C.red` text, `s.signOut`-style container). Tapping it opens the existing `Sheet` component (`src/components/Sheet.tsx`) — `title`, a `message` naming the session/tournament, and two `actions`: `Cancel` and a `destructive` `Delete`. No native `Alert` is used anywhere in this project. On confirm, the row (and, for tournaments, its cascaded `tournament_entrants`/`bracket_matches`) is deleted and the screen navigates back to the parent list (`router.back()`).

## 2. Onboarding: age + handedness

**Schema:** `profiles` gains two nullable columns — `age int`, `hand text check (hand in ('left', 'right'))`. Both are nullable at the database level; there is no backfill and no NOT NULL constraint, because this only applies to users going through the welcome screen for the first time. Existing users with `display_name_set = true` never see the welcome screen again, so they simply have `age = null, hand = null` — no migration conflict, no forced re-prompt.

**UI:** `app/welcome.tsx` gains two fields below the existing display-name input:
- **Age** — optional numeric `TextInput`, skippable, no validation beyond digits.
- **Playing hand** — a required Left/Right segmented control, same chip style as the existing `Segmented` pattern in `app/(app)/tournaments/new.tsx`. Continue stays disabled until one is picked, exactly like the existing display-name validation already blocks Continue.

Both values are written alongside `display_name`/`display_name_set` in the same `setDisplayName`-style write path (`src/repos/profileRepo.ts`), so there is one save call, not three.

**Out of scope:** editing age/hand later from the Profile screen. This spec only covers capture at first login; a follow-up can add Profile editing if wanted.

## 3. Session auto-finish after 24h

**Trigger:** lazy check on read, not a scheduled job. This project has no server-side scheduled infrastructure today (no `pg_cron`, no edge functions) and everything else is client-driven — a scheduled sweep would be new infra for a feature that doesn't need real-time precision.

**Mechanism:** a pure helper in `sessionRepo.ts`, called as a side effect wherever sessions are loaded (`listSessions`, `getSession`): any session with `status = 'live'` whose `starts_at` is more than 24 hours in the past is flipped to `'done'`, reusing the existing `endSession` behavior (end any still-live matches under it, then mark the session done — see `sessionRepo.ts:69`) rather than a bare status update, so match state stays consistent.

**Consequence of the lazy-check design:** a session nobody opens the app for stays `'live'` indefinitely until some client loads the sessions list or that session's detail screen. This is an accepted tradeoff for zero new infrastructure, not an oversight.

## Testing

- Pure logic (the 24h-cutoff check, given a session and "now") is unit-tested — extend `sessionRepo` with a pure helper the same way `validateName` is pure, rather than embedding the date math inline in the async function.
- Delete permission gating, the `Sheet` confirmation flow, and the welcome-screen field additions are `tsc`-gated; manual verification on device (delete as admin vs. non-admin, welcome flow for a fresh account, a session left live past 24h) happens after implementation.
- Gate every task on `npx tsc --noEmit && npm test`.

## Out of scope

Tournament share link, court configuration + admin reassignment, live scores on the bracket screen (all blocked on tournament cloud sync — separate design). Editing age/hand from Profile after first login. Any change to the scoring engine. Any change to how sessions/tournaments sync (or don't) with Supabase.
