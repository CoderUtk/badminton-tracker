# UX Polish Round 2 — Design

**Date:** 2026-08-03
**Status:** Design approved (planning only; no implementation yet)

Seven changes from the first real on-device session: make the tournament join
flow reachable, stop the keyboard covering Home's inputs, scope the live-match
list to a club, de-emphasise destructive actions, and tighten name validation.

## Context

Tournaments Phase 3 & 4 (join requests, approval queue, live ops) shipped and
its migration `0007_tournament_live_ops.sql` is applied. On-device testing
surfaced that **the feature has no entry point**: `buildTournamentJoinPath`
exists in `src/lib/joinLink.ts` and is unit-tested, but no screen calls it, so
no tournament join link can be produced. Item 1 unblocks everything Phase 3/4
built.

The same session surfaced six UI issues, all on screens this change already
touches.

## Scope

In: the seven items below.

Out, each needing its own spec: courts-at-tournament-creation, edit-tournament,
and a Friends tab. Friends in particular is a subsystem — social graph,
request lifecycle, privacy rules, and RLS — not a polish item.

## 1. Tournament share link

**Problem:** no way to generate a tournament join link, so the join landing
screen, request queue, and approval RPCs are all unreachable in the shipped app.

**Design:**
- Add a "Share join link" button to `app/(app)/tournaments/[id].tsx`, mirroring
  the club button in `app/(app)/clubs/[id].tsx:62`.
- Visible to **any club member**, not admin-gated — the same rule as clubs.
  Joining still requires admin approval through `request_tournament_join`, so
  sharing grants no privilege.
- Extract the shared logic into `src/lib/shareJoin.ts`:
  `shareJoinLink(path: string, message: string): Promise<void>` — wraps
  `Linking.createURL(path)` and `Share.share`, and toasts on failure. Both the
  club and tournament screens call it, so the two cannot drift.
- The club screen is refactored onto the helper in the same task; its current
  inline implementation is deleted, not left alongside.

**Testing:** `buildTournamentJoinPath` is already covered. `shareJoinLink`
wraps two platform APIs and is verified on device, not unit-tested.

## 2. Home keyboard covers the club/invite inputs

**Problem:** focusing "Invite code" (or "New club name") on Home puts the
keyboard directly over the field.

**Root cause:** Home is the one input screen that cannot use `FormScreen`,
because a `FlatList` may not nest inside a `ScrollView`. It instead keeps a bare
`KeyboardAvoidingView` whose `behavior` is `undefined` on Android
(`app/(app)/index.tsx:59`), which makes it a no-op there. Both forms sit below a
`flex: 1` list, so they are exactly what the keyboard lands on.

**Design:** move the two forms into the FlatList's `ListFooterComponent`. The
screen becomes a single scrollable surface, so React Native scrolls the focused
input into view and Android's `softwareKeyboardLayoutMode: "resize"` (already
set in `app.json`) shrinks the viewport to allow it. Visual order is unchanged.

The now-pointless `KeyboardAvoidingView` wrapper is replaced by a plain `View`,
and the stale comment at `app/(app)/index.tsx:57-58` is updated to describe the
footer approach.

**Rejected:** moving create/join into modal sheets. It also fixes the keyboard
and declutters Home, but it is a larger IA change than requested and hides the
invite-code path behind an extra tap.

## 3. Watch live matches

**Problem:** a permanent Home nav pill that usually leads to "No live matches
right now". It also under-reports: `app/(app)/watch/index.tsx:17` reads
`clubs[0]?.id ?? ""`, so it only ever subscribes to the user's **first** club
and shows nothing at all when they have none.

**Design:**
- Remove the nav pill from Home (`app/(app)/index.tsx:74-79`).
- Make the list club-scoped: it takes a `clubId` from the route rather than
  guessing. Entry point becomes a "Live now" button on club detail. Taking the
  id from the route deletes the `clubs[0]` bug rather than patching it.
- `app/(app)/watch/[matchId].tsx` is unchanged; tournament brackets continue to
  route into it directly (`app/(app)/tournaments/[id].tsx:57`).

**Route:** the list moves to `app/(app)/clubs/[id]/live.tsx`. The existing
`app/(app)/watch/index.tsx` is deleted; `app/(app)/watch/[matchId].tsx` and its
`_layout.tsx` stay where they are.

## 4. Destructive actions: club and tournament delete

**Problem:** "Delete tournament" is a full-width 52px button carrying the same
visual weight as Pending requests and Live Ops
(`app/(app)/tournaments/[id].tsx:115-121`). Clubs have no delete at all.

**Design:**
- New `src/components/MenuButton.tsx`: a `⋮` header button that opens a small
  popover of actions, each `{ label, onPress, destructive? }`. Destructive items
  render in `C.red`. Presentational only — no business logic.
- Both club detail and tournament detail mount it in the screen header via
  `Stack.Screen options={{ headerRight }}`, holding a single **Delete** item.
- Pending requests and Live Ops remain body buttons; only delete moves.
- The existing confirmation `Sheet` is still required before any delete runs.

**Club delete needs a migration.** There is currently no `deleteClub` in
`src/repos/` and no DELETE policy on `public.clubs` in any migration — the only
one that exists is for tournaments (`0006_tournament_sync.sql:74`). Without a
policy, RLS silently drops the delete and Supabase reports success, which is
exactly the bug that made `deleteTournament` a no-op before it was caught.

- **Migration** `supabase/migrations/0008_club_delete.sql`: add a DELETE policy
  restricted to owners. It cannot use `is_club_admin`, which resolves to
  `role in ('owner', 'admin')` (`0001_init.sql:108`) and would let admins delete
  too. The policy tests the owner role directly:

  ```sql
  create policy "owners delete clubs" on public.clubs for delete to authenticated
    using (exists (
      select 1 from club_members
      where club_id = clubs.id and profile_id = auth.uid() and role = 'owner'
    ));
  ```
- **Repo** `clubRepo.deleteClub(id)`: delete, `.select()` the result, and
  **throw when zero rows come back** so a blocked delete surfaces instead of
  appearing to succeed. Mirrors `tournamentRepo.deleteTournament`.
- Child rows already cascade via `on delete cascade` (`0001_init.sql`), so no
  manual cleanup is required. Local SQLite caches for the club are cleared after
  the remote delete succeeds.

Only a club **owner** may delete. Admins may not — deleting a club destroys
every member's history, which is a stronger action than admin implies. The
Delete item is therefore shown only when `club.role === "owner"`, while the
tournament Delete item keeps its existing admin-or-owner gate.

## 5. Profile display name

**Problem:** Profile shows the name twice — as the hero heading
(`app/(app)/profile.tsx:90`) and again immediately below in an always-open edit
card (`profile.tsx:97-111`) — pushing stats down for a field set once at signup.

**Design:** delete the standing card. The hero name becomes tappable, with a
small pencil icon to signal it, opening an edit sheet containing the input,
validation message, and Save/Cancel. Profile then opens on stats. Validation and
the `profileRepo` write are unchanged; only the presentation moves.

## 6. Player name must contain a letter

**Problem:** `validateName` accepts any non-blank string, so "123" is a valid
display name.

**Design:**
- `validateName(value, label, opts?: { requireLetter?: boolean })`. When
  `requireLetter` is set and the trimmed value matches no `\p{L}` (Unicode
  letter, `u` flag), return `` `${label} must contain a letter` ``. Using
  `\p{L}` rather than `A-Za-z` keeps non-Latin scripts valid.
- Applied to the **display name only**: `app/welcome.tsx` and the new Profile
  edit sheet.
- Club, tournament, and guest player names keep today's rules. Club and
  tournament names legitimately contain digits ("Summer 2026 Open", "Court 5
  Badminton"), and guest names are admin-entered, where "Guest 1" is a
  deliberate convention.

**Testing:** `validateName` is pure. Add cases for "123" rejected, "Ravi 2"
accepted, a non-Latin name accepted, and the existing blank/length rules
unaffected when `requireLetter` is absent.

## 7. Blank club name

Already implemented and working: `app/(app)/index.tsx:23` computes
`validateName(name, "Club name")`, Create is disabled while invalid, and an
inline error shows once the field is touched. The report almost certainly came
from the older v5 release APK installed before this landed.

**Action:** no new code. Add a regression test asserting `validateName` rejects
`""` and `"   "`, and confirm on device. If it does reproduce on a current
build, that is a new bug and gets its own investigation.

## Testing

- Pure logic — `validateName` with and without `requireLetter` — is unit-tested.
- `MenuButton` is presentational; verified on device.
- `deleteClub` follows `deleteTournament`'s throw-on-zero-rows contract, which
  is the part worth asserting: a blocked delete must raise, never pass silently.
- Everything else is `tsc`-gated plus on-device verification.
- Gate every task on `npx tsc --noEmit && npm test`.

## Manual verification

The point of item 1 is that this becomes possible at all:

1. Admin opens a tournament, taps Share join link, sends it.
2. Second account opens the link, lands on the join screen, requests to join.
3. Admin sees the request in the queue, approves, and the player appears in the
   bracket.
4. Admin assigns a court and a scorer claims a match from Live Ops.
5. Home: focus the invite-code field and confirm it stays visible.
6. Club detail: Live now lists in-progress matches for **that** club.
7. Delete a club from the ⋮ menu as owner; confirm it disappears on a second
   device rather than silently reappearing.
