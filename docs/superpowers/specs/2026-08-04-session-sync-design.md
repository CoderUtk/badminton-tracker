# Session & Attendance Sync, Creator-Only Delete — Design

**Goal:** Sessions and attendance currently exist only in local SQLite (`sessions_cache`, `attendance_cache`) — nothing in the app ever writes to the `public.sessions` or `public.attendance` Supabase tables, even though both tables, their RLS policies, and a `created_by` column on `sessions` already exist unused. This spec syncs both tables fully (create/read/update/delete parity across devices) and adds a creator-only delete restriction on top, which was the original ask that surfaced the local-only gap.

**Why:** A session only ever exists on the device that created it today. No other club member ever sees it. "Only the creator can delete a session" has no one else to restrict against until sessions are actually shared.

## Architecture

Sessions and attendance move to the same sync pattern `clubRepo.ts` already uses for clubs (`refreshClubs()`): writes go straight to Supabase first (online required, same as club/tournament creation), then a full local-cache refresh (delete+reinsert) pulls the authoritative state back down. Screens keep reading from the local cache, so the app stays offline-readable — it just requires connectivity to write.

This is deliberately **not** `matchRepo`'s offline-queue-with-retry pattern (used for live match scoring, which must survive a dropped connection mid-rally). Sessions and attendance are occasional, non-live-critical writes — planning a night, checking someone in — so the simpler write-through-then-refresh model is the right fit, and it keeps the sync style consistent with clubs/tournaments rather than introducing a third approach.

## Permission model

Three distinct actions, three distinct rules, matching what's already enforced (dormant) in the schema plus one new addition:

| Action | Who | Enforcement |
|---|---|---|
| Create a session | Club admin/owner | Existing `"admins write sessions"` RLS policy (table INSERT) |
| Start/finish a session (status change) | Any club member | **New** `set_session_status` RPC — checks membership only, so it doesn't require loosening the admin-only table UPDATE policy |
| Delete a session | The creator only | **New** RLS DELETE policy: `created_by = auth.uid()` |
| Attendance (check in/out) | Any club member, for any player | Existing `"members write/update attendance"` RLS policies — unchanged, already matches today's UI (any viewer can mark any player) |

The status-RPC split matters: today, *any* member can tap Start/Finish (`app/(app)/sessions/[id].tsx:135,142`, ungated). Enforcing the existing admin-only UPDATE policy directly would silently break that. A narrow RPC that only ever touches `status`/`ends_at` and checks club membership (not admin) preserves today's behavior without loosening the table policy for anything else a session might grow (courts, location edits).

## Components

**`supabase/migrations/0015_session_sync.sql`** (new)
```sql
create policy "creator deletes sessions" on public.sessions for delete to authenticated
  using (created_by = auth.uid());

create or replace function public.set_session_status(
  p_session_id uuid,
  p_status text
) returns void language plpgsql security definer set search_path = public as $$
declare v_club uuid;
begin
  if p_status not in ('scheduled', 'live', 'done', 'cancelled') then
    raise exception 'Unknown status';
  end if;
  select club_id into v_club from sessions where id = p_session_id;
  if v_club is null then raise exception 'Session not found'; end if;
  if not is_club_member(v_club) then
    raise exception 'Only a club member can change this session';
  end if;
  update sessions
    set status = p_status, ends_at = case when p_status = 'done' then now() else ends_at end
    where id = p_session_id;
end $$;
```
No changes needed to `public.attendance` — its read/insert/update policies already allow any club member, matching current `setAttendance` behavior exactly.

**`src/db/db.ts`** — one new `MIGRATIONS` array entry (append-only, per this repo's existing convention — never edit an applied migration):
```sql
alter table sessions_cache add column created_by text;
```

**`src/repos/sessionRepo.ts`** — rewritten to write-through Supabase:
- `createSession(input)`: requires `supabase` (throw `"Sign in to plan a session"` otherwise, matching `createTournament`'s convention), reads the current user id, inserts into `public.sessions` with `created_by`, `.select()`, throws on error or zero rows, then calls the new `refreshSessions()`, returns the new id.
- `refreshSessions(): Promise<void>` (new export) — module-scoped `refreshing` boolean guard (same as `clubRepo.refreshClubs`), pulls sessions + attendance for every club `listRealClubs()` returns, replaces `sessions_cache`/`attendance_cache` wholesale inside a transaction, "stay on cache" (return silently) on read failure.
- `updateSessionStatus(id, status)`: calls `supabase.rpc("set_session_status", { p_session_id: id, p_status: status })`, throws on error, then updates the local cache row directly (no full refresh round-trip needed for a single-field change).
- `endSession`: unchanged shape — ends live matches, then calls `updateSessionStatus(id, "done")`.
- `deleteSession(id)`: replaces the current local-only delete with `supabase.from("sessions").delete().eq("id", id).select()`, throws on error or zero rows (a non-creator's attempt is blocked by the new RLS policy and returns zero rows, which the existing throw-on-empty convention turns into a clean error rather than a silent no-op), then runs the existing local cleanup (`matches.session_id = null`, delete from `attendance_cache`/`sessions_cache`).
- `setAttendance(sessionId, playerId, status)`: upserts into `public.attendance` (`.upsert({...}, { onConflict: "session_id,club_player_id" })`), `.select()`, throws on error/empty, then updates the local cache row directly.
- `listSessions`, `getSession`, `listAttendance`, `getSessionStats`, `getClubStats`: unchanged — still pure cache reads. The staleness auto-finish sweep inside `listSessions`/`getSession` keeps its existing try/catch-and-retry-later shape; since any member can now call the status RPC, there's no new failure mode to handle there.

**`app/(app)/sessions/[id].tsx`**
- `isAdmin` is used only for the delete button and its confirm `Sheet` (nowhere else in this file) — replace both uses with `isCreator`, computed as `useSession().session?.user.id === session.created_by` (reusing the existing app-wide `useSession()` hook — no new auth lookup needed).

**`app/new-session.tsx`**
- The club chip list currently shows every club `listRealClubs()` returns. Filter to `role === "owner" || role === "admin"` (the `role` field `listRealClubs()`/`Club` already carries). If the filtered list is empty, show a message in place of the form (mirrors the existing `"Create or select a club before planning a session."` toast already in `save()`, just surfaced earlier as inline copy rather than only on submit).

## Data flow

Write → Supabase → `refreshSessions()` (or a direct local-row update for single-field changes) → screens re-read the cache. Every write follows this repo's existing `.select()` + throw-on-zero-rows convention, since a policy-blocked write otherwise reports success.

## Error handling

Nothing new beyond the existing conventions already used throughout `tournamentRepo`/`clubRepo`: throw with a user-facing message on any Supabase error or an empty `.select()` result; screens already catch and `toast()` these (see `onDeleteSession`, `mark()` call sites in `[id].tsx`).

## Testing

No RN component-test harness in this repo (matches every prior UI task this session). Verification:
- `npx tsc --noEmit && npm test` — regression gate, no new pure logic to unit test here (everything is Supabase I/O or cache reads, same shape as the untested `tournamentRepo`/`clubRepo` write functions already in the codebase).
- Manual device check, two accounts in the same club:
  - Admin creates a session → non-admin's device (after a refresh) sees it appear.
  - Non-admin taps Start, then Finish → status change visible on the admin's device too.
  - Non-admin checks a player in/out → visible on the admin's device.
  - Non-creator admin does **not** see a delete option on a session they didn't create; the creator does, and deleting it removes it from every device.
  - A club member with no admin role anywhere sees "Plan session" lead to the empty-state message, not a club picker.

## Out of scope

- Renaming/editing a session's location, courts, or time after creation — no such UI exists today, so no policy or RPC is added for it.
- Any change to how matches sync (`matchRepo`/`src/sync/runner.ts`) — untouched.
- Migrating existing local-only session rows created before this ships — they stay device-local and are not backfilled to Supabase; only newly-created sessions sync.
