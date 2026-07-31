# CourtSide — Realtime Tournaments & Live Match Tracking

**Date:** 2026-07-31
**Status:** Design approved, pending spec review

## Goal

Add two capabilities to CourtSide (offline-first badminton club app):

1. **Live spectator view (A)** — club members watch an in-progress match update live on their own device, point by point.
2. **Realtime single-elimination tournaments (B)** — a bracket that advances automatically as matches finish; members see standings update live.

Both are club-gated (members only, logged in).

## Constraints & decisions

- **Backend deferred.** Supabase will be configured later by the user. Everything is built behind swappable interfaces with a working local implementation (in-process + SQLite + dummy data). Switching to Supabase is a one-line provider change, no UI rewrite.
- **Honest limitation:** true cross-device realtime (a friend watching on another phone) is not functional until Supabase is live. Until then: same-device live simulation via an in-process event bus, plus dummy tournament data for demos.
- **Scoring engine untouched.** `src/engine` stays pure and event-sourced. A scored point is already a `MatchEvent`; that event log is the realtime payload.
- **Auth added now** behind an interface, with a dummy local implementation (no cloud, no passwords). Real email/password + Google OAuth land when Supabase is wired.
- **Tournament format:** single elimination only for this version.

## Architecture: swappable backends

Two interfaces isolate all cloud concerns. App code depends only on the interface; a provider selects the implementation.

### RealtimeBackend (`src/realtime/backend.ts`)

```
RealtimeBackend {
  publishEvent(matchId, event): Promise<void>
  subscribe(matchId, cb: (event) => void): Unsubscribe
  listLiveMatches(clubId): Promise<LiveMatch[]>
  onLiveMatchesChange(clubId, cb): Unsubscribe
}
```

- **LocalBackend** — in-process `EventEmitter`. Scorer appends event to SQLite and emits; same-device spectator subscribes and replays via existing `replay(events)`. Seeds dummy live matches for demo. Never "offline".
- **SupabaseBackend** (later) — `publishEvent` inserts into `match_events` (append-only, already in the 0001 migration); `subscribe` is a Realtime channel on that match's rows; `listLiveMatches` queries `matches` where `status = 'live'`. Same interface, drop-in.

### AuthBackend (`src/auth/backend.ts`)

```
AuthBackend {
  signInEmail(email, pw); signUpEmail(...)
  signInGoogle()
  signOut()
  currentUser()
  onAuthChange(cb): Unsubscribe
}
```

- **LocalAuthBackend** — dummy users in SQLite; "sign in" picks or creates a local profile, no password verification. Works today.
- **SupabaseAuthBackend** (later) — email/password + Google via `expo-auth-session`. Google OAuth client IDs deferred with Supabase.

Session lives in a React Context (`src/stores/session.tsx`), holds `currentUser`, gates routes. `app/(auth)/sign-in.tsx` + a redirect in `app/_layout.tsx`: no user → sign-in; the existing `(app)` group is gated. The existing dummy-user profile screen rewires to `currentUser`.

## Data model (new tables)

Local SQLite now; mirrors Supabase later. Client-generated UUID PKs (offline-safe).

- `tournaments` — `id, club_id, name, format('single_elim'), size(4/8/16/32), status(draft/live/done), created_at`
- `tournament_entrants` — `id, tournament_id, club_player_id, seed`
- `bracket_matches` — `id, tournament_id, round, slot, match_id(nullable), entrant_a(nullable), entrant_b(nullable), winner_entrant(nullable), next_slot`
  - `match_id` links a bracket cell to a real scored match (reuses `matches` + `match_events`).
  - `next_slot` is where the winner flows.

No changes to the scoring engine or the `matches`/`match_events` tables beyond linking.

## Tournament engine (pure, `src/tournament/bracket.ts`)

No backend, fully unit-tested, deterministic.

- `buildBracket(entrants[], size)` — standard seed order (1v16, 8v9, …); inserts byes when `entrants < size`; round-1 byes auto-advance. Returns `rounds[]` of `bracket_matches`.
- `advanceWinner(bracket, slot, winnerEntrant)` — writes the winner, fills `next_slot`, returns updated bracket. Idempotent.
- `bracketStatus(bracket)` — `pending | live | done`; resolves champion when the final is decided.

`src/repos/tournamentRepo.ts` — create tournament, add entrants, persist bracket rows, link `bracket_match.match_id` when a match starts, and on match finish call `advanceWinner` and persist.

## Realtime wiring

The existing `matchStore` already appends events. Add a single non-blocking call on append: `backend.publishEvent(matchId, event)`. On failure, the event is already persisted with `synced = false` (column exists in the migration) and flushed on reconnect via the existing sync pattern. No point is ever lost.

## Screens

- `app/(app)/watch/index.tsx` — club's live matches; tap to watch. Reached from a "Live" entry on Home / a tab.
- `app/(app)/watch/[matchId].tsx` — read-only spectator. Reuses `Court.tsx` and the score ribbon from `MatchScreen`, no controls. Subscribes on mount, unsubscribes on unmount. Shows server, rally, set score, live badge. Subscribe failure → last-known score + "reconnecting" with backoff retry.
- `app/(app)/tournaments/index.tsx` — list club tournaments, status color (reuses the existing session color-code pattern).
- `app/(app)/tournaments/new.tsx` — name, size (4/8/16/32), pick entrants from club players, auto-seed. Create → draft.
- `app/(app)/tournaments/[id].tsx` — bracket view: rounds as horizontally scrolling columns, matches as cells, live cell pulses, winner highlighted, champion crown. `react-native-svg` connectors between rounds (already installed). Tap live cell → watch screen; tap a pending cell with both entrants → "Start match" (creates a real match, opens the scorer).

## Flow

Create tournament → draft bracket → start round-1 matches → score with the existing engine → finish → winner auto-advances → repeat → champion. Live matches appear in the watch list and the corresponding bracket cell pulses.

## Error handling

- Bracket engine is pure and throws on bad input (odd advance, double-resolve); caught at the repo layer and surfaced as a toast.
- "Start match" on a cell missing an entrant is a disabled button, not an error.
- Auth failure shows an inline message on sign-in; no navigation.

## Testing (gate: `tsc --noEmit && jest`)

- `bracket.test.ts` — seeding correctness; byes for non-power-of-2 (e.g. 5 → 8 with 3 byes); winner-advance chain; champion detection; idempotent advance; determinism.
- `backend.test.ts` — LocalBackend publish→subscribe delivery; unsubscribe stops delivery; live-list change notification.
- Fake backend for screen tests.
- Existing 21 engine tests and generator tests stay green (engine untouched).

## YAGNI — explicitly out of scope for this version

Seeding drag-reorder (auto-seed only), double elimination, consolation / 3rd-place match, public share links, push notifications, bracket editing after start.

## Dependencies on the user (later, non-blocking)

Create a Supabase project and paste URL + anon key; create Google OAuth client IDs. Until then the app runs on LocalBackend + LocalAuthBackend with dummy data. Exact steps provided when the user is ready.
