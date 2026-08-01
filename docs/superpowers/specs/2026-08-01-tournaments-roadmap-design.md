# CourtSide Tournaments & Multi-Scorer — Roadmap Design

**Date:** 2026-08-01
**Status:** Design approved (planning only; no implementation yet)

## Goal

Grow CourtSide's tournament capability from the current single-elim local demo into a real event tool: larger draws, doubles, escalating match length, shareable join-by-link with approval, and multi-scorer live operation across many courts. Delivered as a phased roadmap — each phase is independently shippable and gets its own implementation plan.

## Guiding constraints

- **Scoring engine stays pure and unmodified.** It already supports doubles and configurable `bestOf`; reuse it.
- **Everything rides existing seams:** `RealtimeBackend` (`src/realtime`), the repos (`src/repos`), `matchStore`, and the session store. New cloud behaviour drops in behind the same interfaces.
- **Local-first.** Phases 1–2 run fully on-device (SQLite + `LocalBackend`). Phases 3–4 require Supabase configured (see `docs/SUPABASE_SETUP.md`) because they are inherently multi-account / multi-device.
- **YAGNI.** No double-elimination, no consolation brackets, no seeding drag-reorder, no public spectator links beyond club-gated watch, no payments.

## Advice on record: sessions vs tournaments

They are **not** redundant; keep both.
- **Session** — recurring casual club play: RSVP/attendance, auto-generated fair rotating rounds, no champion. Ongoing club life.
- **Tournament** — one-off structured knockout: seeded bracket, single-elim, champion, admin + scorers.
- They share only the match-scoring core (already shared). They may later sit under a common "Events" nav grouping, but remain distinct data models and flows. No merge.

---

## Phase 1 — UX fixes (local, ship now)

**Goal:** three small, high-value interface corrections. No backend, minimal design risk.

1. **Tournaments as its own tab.** `app/(app)/_layout.tsx` bottom nav goes 4→5 tabs: Home · Sessions · Matches · **Tournaments** · Profile. Tournaments is promoted from a hidden route to a `Tabs.Screen` with a `trophy` icon. "Live/watch" stays a Home pill (keeps the bar at 5, honoring the ≤5 rule).
2. **Player name on Home.** The Home header greets the current player by name. Source: the session profile's `display_name`. Offline (no account, `offlineOnly`), there is no profile — so add a small **local display name** editable on the Profile screen, persisted in SQLite (a `settings` row or `profiles_cache`), and read by Home. Greeting falls back to "Player" if unset.
3. **Scoring screen forced fullscreen.** `app/score/[matchId].tsx` (renders `MatchScreen`) must enter immersive mode on focus so the status bar and Android navigation bar never overlap the `+1` rails. Use `expo-status-bar` hidden + `expo-navigation-bar` (`setVisibilityAsync("hidden")`, sticky-immersive behavior) on mount; restore both on unmount. New dependency: `expo-navigation-bar` (Expo SDK 54).

**Files touched:** `app/(app)/_layout.tsx`, `app/(app)/index.tsx`, `app/(app)/profile.tsx`, `app/score/[matchId].tsx`, a tiny local-settings helper in `src/repos` or `src/db`.

---

## Phase 2 — Tournament format (local, ship now)

**Goal:** bigger draws, doubles, and per-round match length. All local; extends the existing pure bracket engine and `tournamentRepo`.

1. **Up to 64 players.** Widen `BracketSize` to `4 | 8 | 16 | 32 | 64`. The seed-order/build logic in `src/tournament/bracket.ts` already generalizes to any power of two — only the type union and the size picker in `tournaments/new.tsx` change. Byes for non-power-of-two entrant counts already work.
2. **Doubles tournaments.** Add `matchType: 'singles' | 'doubles'` to the tournament.
   - **Data model:** an entrant becomes a *side*. For doubles an entrant references **two** `club_player`s. Extend `tournament_entrants` with a nullable `club_player_id_2` (and store a combined display name), or model an entrant as a small team record. The bracket engine is unchanged — `Entrant.id` still identifies a side.
   - **Scoring:** `startBracketMatch` builds a doubles `MatchConfig` (two players per team) when `matchType = 'doubles'`. The engine already scores doubles (serve rotation, positions).
   - **UI:** `tournaments/new.tsx` picks pairs when doubles is selected (select two players per entrant).
3. **Configurable games-per-match with escalation.** Tournament stores a default `bestOf` (1/3/5) **and** a `finalsBestOf` applied from the **semifinals onward** (the last two rounds). `startBracketMatch` chooses `bestOf` by the cell's round: `round >= maxRound - 1 ? finalsBestOf : bestOf`. `new.tsx` exposes both selectors.

**Files touched:** `src/tournament/types.ts`, `src/tournament/bracket.ts` (type only), `src/db/schema.ts` (+ `matchType`, `bestof`, `finals_bestof`, `club_player_id_2`), `src/repos/tournamentRepo.ts`, `app/(app)/tournaments/new.tsx`, `app/(app)/tournaments/[id].tsx`. Bracket-engine tests extended for size 64 and doubles-entrant start.

---

## Phase 3 — Join by ID / URL + approval (needs Supabase)

**Goal:** share a club or tournament by link/code; an owner/admin approves who joins. Multi-account, so Supabase must be live.

1. **Shareable identity.** Clubs and tournaments expose a stable **ID** and a **deep link** (`badminton://join/club/<id>`, `badminton://join/tournament/<id>`), plus a human short code. A route handles the deep link and shows a "Request to join" screen.
2. **Approval flow.** Joining creates a **pending request**, not an immediate membership. New tables `club_join_requests` and `tournament_join_requests` (`id, target_id, profile_id, status: pending|approved|denied, created_at`), RLS so a requester sees only their own request and admins see their target's queue. Approving inserts the real `club_members` / tournament entrant row; denying marks the request.
3. **Admin UI.** A "Pending requests" screen for owners/admins (approve / deny), reachable from the club and tournament screens.
4. **Coexistence.** The existing instant **invite-code** club join stays. Approval-by-ID is the new, additional public path. Tournament approval turns an approved requester into an entrant (subject to the size cap; overflow → waitlisted).

**Backend:** new migration `0003_join_requests.sql`; realtime optional (admin queue can poll or subscribe). **Files:** new `app/join/*` routes, `src/repos/membershipRepo.ts`, admin screens under clubs/tournaments.

---

## Phase 4 — Tournament live ops: admin + scorers + courts (needs Supabase + realtime)

**Goal:** the "company hosting a tournament in a stadium with multiple courts" scenario — one admin, many scorers, concurrent scoring, live everywhere.

1. **Roles.** A tournament has one **owner/admin** and **N scorers** (`tournament_staff(tournament_id, profile_id, role: admin|scorer)`). Admin manages the bracket and staff; scorers score matches.
2. **Courts.** A tournament declares a court count; each `bracket_match` can carry a `court` assignment. Admin **assigns** a match to a court/scorer, or a scorer **self-claims** an open (both-entrants-present, unstarted) match. A match **locks** to one active scorer (`bracket_matches.scored_by` / a claim) so two people never score the same game.
3. **Concurrent + live.** Many scorers score different courts simultaneously. Each point publishes via the existing `RealtimeBackend.publishEvent`; the admin dashboard and spectators watch every court live (reuses `matchStore` publish + the watch screens). On finish, `finishBracketMatch` advances the bracket for everyone in real time.
4. **Admin dashboard.** A per-tournament ops view: courts grid, who's scoring what, live scores, and one-tap assign/claim.

**Backend:** migration `0004_tournament_staff_courts.sql`; `SupabaseBackend` (the skeleton in `docs/SUPABASE_SETUP.md`) must be the active realtime provider. **Files:** `src/repos/tournamentStaffRepo.ts`, admin/scorer screens, court-claim wiring in `tournamentRepo` + `matchStore`.

---

## Sequencing

```
Phase 1 (UX) ──► Phase 2 (format) ──► [user configures Supabase] ──► Phase 3 (join+approval) ──► Phase 4 (live ops)
   local            local                    gate                        cloud                     cloud
```

Phases 1 and 2 ship immediately with no backend. Phase 3 unblocks once the two Supabase env vars are set and migrations applied. Phase 4 additionally needs `SupabaseBackend` active as the realtime provider.

## Decisions (baked in; revisit if wrong)

1. Tournaments becomes a 5th bottom-tab; Live stays a Home pill (not a tab).
2. Add an editable **local** display name (Profile screen) so the Home greeting works offline as well as signed-in.
3. Club keeps instant invite-code join **and** gains request-by-ID + approval — two paths, not a replacement.
4. Scorers can self-claim open matches **and** admins can assign; a match locks to a single active scorer.
5. Single elimination only (unchanged). Doubles is a per-tournament flag, not a separate bracket type.
6. "Semifinals onward" = the last two rounds use `finalsBestOf`.

## Testing posture

- Pure logic (`bracket.ts`, repo mappers, `bestOf`-by-round selection, doubles-config builder) is unit-tested — extend the existing `tests/bracket.test.ts` / `tests/tournamentRepo.test.ts`.
- Screens are tsc-gated; multi-device/realtime behaviour (Phases 3–4) is verified manually on two accounts once Supabase is live.
- Gate every phase on `npx tsc --noEmit && npm test`.

## Deferred / out of scope

Double elimination, 3rd-place/consolation matches, seeding drag-reorder, payments/ticketing, public (non-club) spectating, cross-tournament rankings/Elo integration.
