# Tournament List Scoping & Error Surfacing — Design

**Date:** 2026-08-03
**Status:** Design approved (planning only; no implementation yet)

Fix the Cups tab showing no tournaments, and stop failed queries from being
indistinguishable from an empty list.

## Context

Reported as "deleting one tournament deletes all tournaments for the user", and
currently reproducing as an empty Cups tab.

`deleteTournament` is **not** the cause. It scopes its remote delete with
`.eq("id", id)` and all three local deletes by id, so it cannot affect other
tournaments. The data is intact; the list is failing to read it.

Two defects produce the reported symptom:

1. **`app/(app)/tournaments/index.tsx:18-19`** derives the club with
   `clubs[0]?.id ?? ""` — the same defect removed from the watch list earlier
   today. Tournaments in any club other than the first are invisible. When
   `clubs_cache` is empty the id is `""`, and `.eq("club_id", "")` against a
   `uuid` column is a Postgres type error, not an empty result.
2. **`listTournaments` discards `error`** — `(data ?? []).map(...)`. Any failed
   query, including the uuid error above, returns `[]` and renders as
   "No tournaments yet." A read failure is presented as data loss.

`getTournament` has the same defect: `toTournamentRow(row ?? {})` yields a blank
tournament when the fetch fails, so the bracket screen renders an empty
tournament rather than reporting the error.

## 1. The list spans every club

Tournaments is a top-level tab with no club in its route, so it cannot be
club-scoped the way the watch list was. It queries across all of the user's
clubs instead.

- `listAllTournaments(): Promise<TournamentListRow[]>` in `tournamentRepo`:
  read the user's club ids from `clubs_cache`, then
  `.in("club_id", ids)` ordered by `created_at` descending.
- Return early with `[]` when the user has no clubs. This is the one legitimate
  empty case and must not reach the query, since `.in("club_id", [])` is
  pointless and `.eq("club_id", "")` is a type error.
- `TournamentListRow` is `TournamentRow & { clubName: string }`. Rows now come
  from several clubs, so each shows its club name as a subtitle — "8-player ·
  draft" alone cannot distinguish them. The name comes from the already-loaded
  `clubs_cache` rows, not a join.

`listTournaments(clubId)` stays for callers that legitimately have a club id.

## 2. Read failures surface

`listAllTournaments`, `listTournaments`, and `getTournament` destructure `error`
and throw `new Error(error.message)`.

The list screen catches, toasts, and **leaves the previously loaded rows on
screen** rather than blanking. Only a genuinely empty result clears the list, so
"No tournaments yet." becomes trustworthy.

## 3. Creating stops guessing the club

Once the list spans clubs, "New tournament" defaulting to `clubs[0]` is
incoherent: it would create in Club A while you are looking at Club B's
tournaments. `app/(app)/tournaments/new.tsx:32` has the same fallback.

- One club: unchanged, it is passed through.
- Several clubs: a `Sheet` asks which club, then navigates with that `clubId`.
- No clubs: the button stays disabled, as it is today.

## Testing

- Pure and unit-tested: shaping club ids into a query set, including the
  no-clubs early return; attaching club names to rows.
- The throw-on-error contract is the behaviour worth asserting — a failed read
  must raise rather than return `[]`.
- Screens are `tsc`-gated and checked on device.
- Gate on `npx tsc --noEmit && npm test`.

## Out of scope

The tournament rework this bug surfaced during — lifecycle (`draft` → `live`),
Config/Players/Scorers subtabs, player vs scorer invite links, courts stepper,
random court assignment, and live scores on the bracket — is deliberately
excluded and gets its own spec once the list is trustworthy.
