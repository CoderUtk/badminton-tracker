# Brackets Screen Realtime Redesign

## Problem

The tournament bracket screen (in-app tab and the public spectator link) shows entrant names and a winner marker per cell, but nothing else: no live score, no court assignment, even though `BracketMatch.court` already exists in the data model. Live score is also, today, physically unavailable to any device other than the one actively scoring — `matchStore.dispatch()` only syncs to Supabase when a match ends (`matchStore.ts:60-63`), so points scored never leave the scoring device until the match is over.

## Goal

Bracket cells (in-app and spectator link) show, for each match:
- **Pending**: entrant names only (unchanged).
- **Live**: court assigned + near-live current-game score + games-won pills.
- **Finished**: winner (bold + trophy, as today) + final per-game score line.

"Near-live" means refreshed on a ~15s cadence, not push-instant — see Non-Goals.

## Architecture

### 1. Live-score plumbing (new)

`matchStore` starts a 15s interval when a match becomes live (in `open()` if the loaded match isn't already over, and on the first `dispatch()` for a freshly started match) and clears it on `close()` or when `state.phase === "match_over"`.

Each tick calls a new `matchRepo.updateLiveScore(matchId, state)`:
- Writes a live snapshot into the local SQLite `matches.score_summary` column: `{ games: <finished games so far>, current: { A: number, B: number } }`.
- Marks the row `synced = 0`.
- Fires `syncNow()` (existing opportunistic push), which upserts the `matches` row and any pending `match_events` rows to Supabase via the existing `pushAll` pipeline. No new Supabase client code — this reuses the sync path that already exists for match completion.

This is fire-and-forget, matching the existing "never blocks scoring" pattern used elsewhere in `matchStore`. If offline, the periodic `syncNow()` no-ops (as it does today) and catches up next time connectivity returns or the interval next fires.

`score_summary`'s shape gains an optional `current` field. Existing readers (the Matches tab) already ignore unknown fields and compute their own local `live` snapshot via `replayMatch()`, so this is additive and non-breaking.

### 2. In-app bracket screen (`app/(app)/tournaments/[id].tsx`)

`reload()` already calls `getMatch()` per bracket cell that has a `matchId` and no `winnerEntrant` (today only for reconciliation). Extend this:
- Keep the fetched `MatchRecord` for every live cell in a new state map (`liveMatches: Map<matchId, MatchRecord>`), not just used transiently for reconciliation.
- Re-run `reload()` on a 15s interval while the bracket is showing (`!isDraft`), in addition to the existing `useFocusEffect` trigger. Interval starts/stops with screen focus (cleared on blur/unmount, same lifecycle as other screen-level polling in this codebase).
- Add a small manual refresh button (icon-only, top-right of the bracket area, near existing header controls) that calls `reload()` immediately — for on-demand refresh without waiting for the next tick. Standard `PressableScale` + spinner-while-loading affordance consistent with `BusyButton` usage elsewhere.

Pass `liveMatches` down to `BracketView`.

### 3. `BracketView` component

Cells grow from 150×56 to roughly 150×84 to fit the extra rows. Rendering per cell, keyed off the existing bracket-tree layout (unchanged connector-line logic):

- **Pending** (`!entrantA || !entrantB`): unchanged — names only, `—` placeholders.
- **Live** (`matchId` set, no `winnerEntrant`): existing red border + pulsing dot (unchanged), plus:
  - A small court chip (top-left corner) reading e.g. `C2`, rendered only when `cell.court` is set.
  - Below the names: current game score (`11-7`, tabular-nums) and, if any games are already won, small games-won pills — same visual language as `matches/index.tsx`'s `TeamLine` (`s.gamesWonPill`, `s.liveScore`).
  - If no live match data has arrived yet for a cell that has a `matchId` (e.g. match just started, first tick hasn't landed), fall back to the current "names + live dot, no score" rendering — never show a blank/broken state.
- **Finished** (`winnerEntrant` set): existing bold-winner + trophy treatment, plus a small muted per-game score line beneath (`21-15  21-18`), sourced from the completed match's `score_summary.games`.

### 4. Spectator link (`app/join/tournament/[id]/spectator.tsx`)

New migration extends the `tournament_spectator_view` security-definer RPC to left-join `matches` (on `b.match_id = m.id`) and select `m.status as match_status`, `m.score_summary`, plus the existing `bracket_matches.court` column (already present, just not selected today). Still scoped to one `p_tournament_id` — no RLS relaxation, since the function is `security definer` and already bypasses RLS deliberately, scoped by the tournament id parameter (per the existing comment in `0017_tournament_spectator_view.sql`).

`tournamentStaffRepo.getTournamentSpectatorView` parses the new columns into the `SpectatorView` cell shape (adding `court`, `matchStatus`, `scoreSummary`).

`spectator.tsx`: keep the initial one-shot fetch, add a 15s `setInterval` re-fetch while the screen is mounted (cleared on unmount), plus the same small manual refresh button as the in-app screen. Feed the result into the same enhanced `BracketView`.

## Non-Goals

- **No push/realtime channels.** The underlying score data itself only changes every 15s server-side (the scoring device's tick), so a push subscription (`RealtimeBackend.subscribe`/`onLiveMatchesChange`) would only save the time between a DB write and the next poll tick — a few seconds at most — at the cost of real complexity (per-match channels for the in-app screen, and a genuinely hard RLS/broadcast problem for anonymous spectators, since `matches`/`match_events` RLS is club-member-scoped). Plain polling on a single cadence, everywhere, is simpler and sufficient.
- **No change to per-point sync urgency beyond the 15s tick.** A scorer's own device still shows every point instantly (unchanged, local `replay()`); only *other* devices watching the bracket see the 15s-delayed snapshot.
- **No redesign of the pending/draft-stage bracket UI** (courts stepper, entrant editing, etc.) — out of scope, already covered by prior tournament work (Tasks 1-5).

## Testing

- Unit test `matchRepo.updateLiveScore` (writes expected `score_summary` shape, marks `synced = 0`).
- Unit test `BracketView`'s cell-rendering logic for the three states (pending / live-with-score / live-without-score-yet / finished-with-score), covering the "first tick hasn't landed" fallback.
- Migration (`tournament_spectator_view` update) verified manually via `db push` + walking the spectator link against a live tournament, consistent with how prior migrations in this project were verified (no local SQL test harness).
- Manual on-device walkthrough: start a bracket match on device A, confirm device B's in-app bracket screen and a spectator-link browser/device both show the court + score within ~15s, and that the manual refresh button pulls it immediately without waiting for the tick.
