# Tournament Cloud Sync — Design

**Date:** 2026-08-02
**Status:** Design approved (planning only; no implementation yet)

Move tournament structure — metadata, entrants, bracket cells — from local-SQLite-only to Supabase, so a tournament created on one device is visible to every device and account in the club. This is the prerequisite that unblocks tournament share link, court configuration, live bracket scores, and Phase 4 live ops, all deferred from an earlier brainstorm. It also upgrades "delete tournament" (from a separate, already-approved spec) from a client-side-only permission check to real server enforcement.

## Context

`src/repos/tournamentRepo.ts` currently calls only `getDb()` (local SQLite) — never `supabase`. `supabase/migrations/0002_tournaments.sql` already defines `tournaments`, `tournament_entrants`, and `bracket_matches` with RLS, but nothing writes to them; the RLS has sat unused since it was written. Meanwhile the local schema gained columns during Phase 2 (`match_type`, `bestof`, `finals_bestof`, `club_player_id_2`) that the server tables never received.

This is scoped strictly to tournament *structure*. Point-by-point scoring inside a match — `matches`/`match_events` — already syncs local-first-then-push via `src/sync/runner.ts`, and none of that changes here.

## 1. Read/write model

`tournamentRepo.ts` is rewritten to call `supabase` directly for every read and write — no local cache, no pull-and-replace step. This mirrors `src/repos/profileRepo.ts` and `src/repos/membershipRepo.ts`, not the clubs pattern (`clubRepo.ts`'s `refreshClubs()` cache). Rationale: a local cache buys offline *reads* of bracket state, but every *write* to bracket structure (start a match, finish a match, delete a tournament) already needs a connection under this design, so a cache would only mask staleness without buying real offline capability.

**Consequence, stated plainly:** browsing, creating, starting, or finishing anything tournament-related requires a network connection. This does not affect the actual point-by-point scoring inside a match once it has started (see §2) — that stays exactly as offline-capable as it is today.

## 2. Starting a bracket match

`bracket_matches.match_id references matches(id) on delete set null` in `0002_tournaments.sql` — the column is nullable, but a **non-null** value must reference a row that actually exists. Today, `matchRepo.createMatch` inserts locally only; the corresponding Supabase row appears whenever `src/sync/runner.ts` next runs (on reconnect or app start), which is asynchronous and not guaranteed to have happened by the time `startBracketMatch` would want to link it.

**Fix:** `startBracketMatch` creates the match's Supabase row **synchronously**, in the same call that creates it locally — not routed through the existing push queue. Concretely: after the existing local `createMatch` insert, upsert the same row (`id, club_id, session_id, config, side_a, side_b, status: 'live', created_at`) directly to `supabase.from("matches")`, then mark that match `synced = 1` locally so the regular sync queue in `sync/runner.ts` doesn't redundantly re-push match metadata for it (its `match_events`/points still queue and push through the existing offline-first path — only the match's own row front-loads).

Only *then* does `bracket_matches.match_id` get set, satisfying the foreign key. If the Supabase insert of the match row fails (no connection), `startBracketMatch` fails outright rather than leaving a local match with no linked bracket cell — starting a tournament match requires signal, full stop, matching §1's stated consequence.

## 3. Finishing a bracket match — atomic RPC

A new `finish_bracket_match(p_bracket_match_id uuid, p_winner_entrant uuid)` RPC, `security definer`, mirroring the shape of `approve_club_join` from the club-join work. In one transaction:

1. Validate `p_bracket_match_id` exists, is not already decided, and `p_winner_entrant` is one of its `entrant_a`/`entrant_b`.
2. Set that cell's `winner_entrant` and confirm `match_id` (already set by §2).
3. Compute the next-round cell deterministically from this cell's `round`/`idx` — single-elimination bracket math is purely positional: parent round is `round + 1`, parent index is `idx / 2` (integer division), and whether this cell feeds the parent's `entrant_a` or `entrant_b` is determined by whether `idx` is even or odd.
4. Update **only that one column** on the parent row — never a full-row overwrite. Two matches whose winners feed the same parent cell (the common sibling-semifinals-into-final case) each touch a different column with no read-modify-write race between them, because neither statement reads the other's column before writing.
5. If there is no next round (this was the final), set the tournament's `status` to `'done'` instead of touching a parent cell.

Permission: `is_club_member`, matching the existing (already-loose) RLS already defined on `bracket_matches` in `0002_tournaments.sql` — this project does not tighten who can advance a bracket, only where the advancement logic runs.

`bracket.ts`'s pure `buildBracket` (initial bracket construction) and `bracketStatus` (status derivation for display) are untouched and keep being called client-side; only the *advance* step moves into this RPC as direct SQL rather than porting the whole pure `advanceWinner` function.

## 4. Schema migration

New file `supabase/migrations/0005_tournament_columns.sql`, following the existing `add column if not exists` re-runnable pattern already used in `0003_display_name_set.sql`:
- `tournaments`: add `match_type text not null default 'singles'`, `bestof integer not null default 3`, `finals_bestof integer not null default 3`.
- `tournament_entrants`: add `club_player_id_2 uuid references club_players(id) on delete set null`.
- The `finish_bracket_match` RPC (§3) is defined in this same migration.

No other change to `0002_tournaments.sql`'s existing RLS policies — they are reused as-is for reads/writes of `tournaments`/`tournament_entrants`/`bracket_matches` from the rewritten `tournamentRepo.ts`.

## 5. Cutover

Clean cutover, no migration of existing local-only tournaments. Any tournament currently sitting only in a device's local SQLite (created during earlier testing, before real accounts existed) becomes unreachable once `tournamentRepo.ts` stops reading local tables — consistent with treating pre-launch local data as disposable, the same reasoning already applied when clearing the stale SQLite cache earlier.

## 6. Relationship to the delete spec

`docs/superpowers/specs/2026-08-02-delete-onboarding-autofinish-design.md` specified tournament delete as owner/admin-only, enforced client-side (reading `role` from `clubs_cache`) because tournaments had no server presence at the time it was written. Once this project lands, tournament delete should be re-expressed as a real Supabase operation gated by `is_club_admin()` — either a direct RLS-backed `delete from tournaments` (relying on a delete policy this migration would need to add, since `0002_tournaments.sql` currently has none) or a dedicated RPC. This spec does not implement that change; it only notes the dependency so the delete work, whenever it's implemented, does it against the cloud-backed tournament rather than the local one. Session delete is unaffected — sessions remain outside this project's scope.

## Testing

- The single-elimination parent-cell math in §3 (round+1, idx/2, even/odd → column) is simple enough to unit-test as a pure TypeScript helper even though it executes as SQL — write the equivalent logic once in TypeScript, test it, and keep the SQL RPC in lockstep by inspection, the same way `bracket.ts`'s existing pure functions are tested independently of their callers.
- `tournamentRepo.ts`'s rewritten functions are integration-shaped (real Supabase calls); no unit test mocks Supabase for repos anywhere in this codebase, consistent with `membershipRepo.ts` having none either.
- Manual, on device with two accounts: create a tournament, start a bracket match, finish it, confirm the other account sees the advance; finish two sibling semifinals in quick succession and confirm the final shows both entrants, not just the last write.
- Gate every task on `npx tsc --noEmit && npm test`.

## Out of scope

Tournament share link, court configuration, live bracket scores, Phase 4 staff/scorer roles — all unblocked by this work but not built here. Any change to session sync (sessions remain local-only). Any change to `matches`/`match_events` sync. Tightening who can create/browse a tournament (stays `is_club_member`, unchanged). Migrating pre-existing local-only tournament data.
