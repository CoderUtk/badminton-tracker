# Session & Attendance Sync, Creator-Only Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sessions and attendance move from local-only SQLite to full Supabase sync (create/read/update/delete parity across devices), and session delete becomes creator-only instead of the current admin-gated local-only delete.

**Architecture:** `sessionRepo.ts` writes go straight to Supabase first, then a full local-cache refresh (`refreshSessions()`) pulls the authoritative state back down — the same pattern `clubRepo.ts`'s `refreshClubs()` already uses. Status changes (start/finish) go through a new `set_session_status` RPC so any club member can still use them, without loosening the admin-only table UPDATE policy. Attendance reuses its existing (already-correct, currently-unused) RLS policies unchanged.

**Tech Stack:** TypeScript, Expo SDK 57, expo-router, Supabase (Postgres + RLS + PL/pgSQL), expo-sqlite, Jest.

## Global Constraints

- Read the versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo API code.
- Gate every task on `npx tsc --noEmit && npm test`. Both must pass before commit.
- Supabase writes must `.select()` and throw on zero rows — a policy-blocked write otherwise reports success.
- Local SQLite schema changes ship as a NEW entry appended to `MIGRATIONS` in `src/db/db.ts`, never an edit to an applied one.
- Do not add a `Co-Authored-By` trailer to commits.
- Do NOT run `npx supabase db push` — the human operator applies migrations.
- This repo has no RN component-test harness — verification for UI changes is `tsc`/`npm test` plus a manual device check, not a new automated test.

---

### Task 1: Migration + sessionRepo sync

**Files:**
- Create: `supabase/migrations/0015_session_sync.sql`
- Modify: `src/db/db.ts`
- Modify: `src/repos/sessionRepo.ts`

**Interfaces:**
- Consumes: `listRealClubs()` from `src/repos/clubRepo.ts` (already exists, returns `Club[]` with `id`/`role`); `supabase` from `src/lib/supabase.ts`.
- Produces: `refreshSessions(): Promise<void>` (new export); `ClubSession` gains a `created_by: string | null` field (nullable — see `0016_profile_delete_cascade.sql`); `createSession`, `updateSessionStatus`, `deleteSession`, `setAttendance` keep their existing signatures but now write through Supabase.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0015_session_sync.sql`:

```sql
-- Sessions have always had created_by + RLS policies, but nothing in the
-- client ever wrote to this table — sessions were local-only. This adds the
-- one missing policy (delete) and a status-change RPC any member can call
-- without loosening the admin-only table UPDATE policy for anything else.

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

- [ ] **Step 2: Add the local schema column**

In `src/db/db.ts`, append a new entry to the `MIGRATIONS` array (after `CLUBS_PERSONAL_DDL`):

```ts
const MIGRATIONS = [
  // ... existing entries unchanged ...
  TOURNAMENT_DDL,
  SETTINGS_DDL,
  TOURNAMENT_ALTER_DDL,
  TOURNAMENT_COURTS_DDL,
  CLUBS_PERSONAL_DDL,
  `alter table sessions_cache add column created_by text;`,
];
```

- [ ] **Step 3: Typecheck before touching the repo**

```bash
npx tsc --noEmit
```

Expected: passes (this step only added a migration string and a column that
nothing references yet).

- [ ] **Step 4: Rewrite sessionRepo.ts**

Replace `src/repos/sessionRepo.ts` in full:

```ts
import * as Crypto from "expo-crypto";
import { getDb } from "../db/db";
import { supabase } from "../lib/supabase";
import { isStaleLive } from "../session/autoFinish";
import { listRealClubs, type ClubPlayer } from "./clubRepo";
import {
  endLiveMatchesForSession, listMatchesForClub, listMatchesForSession,
  type MatchRecord,
} from "./matchRepo";

export type SessionStatus = "scheduled" | "live" | "done" | "cancelled";
export type AttendanceStatus = "in" | "maybe" | "out";

export interface ClubSession {
  id: string;
  club_id: string;
  starts_at: number;
  ends_at: number | null;
  location: string | null;
  courts: number;
  status: SessionStatus;
  created_at: number;
  // Nullable: a session whose creator's account was later deleted keeps the
  // session (0016_profile_delete_cascade.sql sets this null rather than
  // cascading), but no one is "the creator" anymore — isCreator checks in
  // Task 2 naturally evaluate false, which is the correct, safe behavior.
  created_by: string | null;
}

export interface Attendance extends ClubPlayer {
  status: AttendanceStatus;
}

export async function createSession(input: {
  clubId: string;
  startsAt: number;
  location?: string;
  courts: number;
}): Promise<string> {
  if (!supabase) throw new Error("Sign in to plan a session");
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("Sign in to plan a session");
  const courts = Math.max(1, Math.min(20, Math.floor(input.courts)));
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      club_id: input.clubId,
      starts_at: new Date(input.startsAt).toISOString(),
      location: input.location?.trim() || null,
      courts,
      created_by: uid,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await refreshSessions();
  return data.id as string;
}

/**
 * Pull sessions + attendance for every club the user belongs to into the
 * local cache. No-op offline or with no real clubs. Mirrors
 * clubRepo.refreshClubs's write-through-then-refresh shape.
 */
let refreshing = false;
export async function refreshSessions(): Promise<void> {
  if (!supabase || refreshing) return;
  refreshing = true;
  try {
    const db = await getDb();
    if (!db) return;
    const clubs = await listRealClubs();
    if (clubs.length === 0) return;
    const clubIds = clubs.map((c) => c.id);

    const { data: sessions, error: sErr } = await supabase
      .from("sessions")
      .select("id, club_id, starts_at, ends_at, location, courts, status, created_at, created_by")
      .in("club_id", clubIds);
    if (sErr) return; // stay on cache

    const sessionIds = (sessions ?? []).map((s) => s.id as string);
    const attendance = sessionIds.length > 0
      ? await supabase.from("attendance").select("session_id, club_player_id, status").in("session_id", sessionIds)
      : { data: [] as { session_id: string; club_player_id: string; status: string }[], error: null };
    if (attendance.error) return; // stay on cache

    await db.withTransactionAsync(async () => {
      await db.runAsync("delete from sessions_cache");
      await db.runAsync("delete from attendance_cache");
      for (const s of sessions ?? []) {
        await db.runAsync(
          `insert into sessions_cache
             (id, club_id, starts_at, ends_at, location, courts, status, created_at, created_by, synced)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          s.id as string, s.club_id as string, new Date(s.starts_at as string).getTime(),
          s.ends_at ? new Date(s.ends_at as string).getTime() : null,
          s.location as string | null, s.courts as number, s.status as string,
          new Date(s.created_at as string).getTime(), s.created_by as string,
        );
      }
      for (const a of attendance.data ?? []) {
        await db.runAsync(
          "insert into attendance_cache (session_id, club_player_id, status, synced) values (?, ?, ?, 1)",
          a.session_id as string, a.club_player_id as string, a.status as string,
        );
      }
    });
  } finally {
    refreshing = false;
  }
}

export async function listSessions(clubId?: string): Promise<ClubSession[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = clubId
    ? await db.getAllAsync<ClubSession>(
        "select * from sessions_cache where club_id = ? order by starts_at desc", clubId
      )
    : await db.getAllAsync<ClubSession>("select * from sessions_cache order by starts_at desc");
  const now = Date.now();
  for (const row of rows) {
    if (!isStaleLive(row, now)) continue;
    try {
      await endSession(row.id);
      row.status = "done";
    } catch {
      // Leave this row live; the next read retries it. A failed sweep must
      // never prevent the rest of the list from loading.
    }
  }
  return rows;
}

export async function getSession(id: string): Promise<ClubSession | null> {
  const db = await getDb();
  const row = (await db?.getFirstAsync<ClubSession>("select * from sessions_cache where id = ?", id)) ?? null;
  if (row && isStaleLive(row, Date.now())) {
    try {
      await endSession(row.id);
      row.status = "done";
    } catch {
      // Leave this row live; the next read retries it. A failed sweep must
      // never prevent the rest of the list from loading.
    }
  }
  return row;
}

/** Change a session's status. Any club member may call this (RPC-gated, not admin-only). */
export async function updateSessionStatus(id: string, status: SessionStatus): Promise<void> {
  if (!supabase) throw new Error("Sign in to update a session");
  const { error } = await supabase.rpc("set_session_status", { p_session_id: id, p_status: status });
  if (error) throw new Error(error.message);
  const db = await getDb();
  await db?.runAsync(
    "update sessions_cache set status = ?, ends_at = case when ? = 'done' then ? else ends_at end where id = ?",
    status, status, Date.now(), id
  );
}

/** End a session: finish any still-live matches, then mark the session done. */
export async function endSession(id: string): Promise<void> {
  await endLiveMatchesForSession(id);
  await updateSessionStatus(id, "done");
}

export interface PlayerStat {
  name: string;
  wins: number;
  losses: number;
  played: number;
}

export interface SessionStats {
  matchCount: number;
  gameCount: number;
  players: PlayerStat[];
}

/** Aggregate per-player win/loss stats across a set of completed matches. */
function aggregate(matches: MatchRecord[]): SessionStats {
  const done = matches.filter((m) => m.status === "completed");
  const byName = new Map<string, PlayerStat>();
  const bump = (name: string, field: "wins" | "losses") => {
    const stat = byName.get(name) ?? { name, wins: 0, losses: 0, played: 0 };
    stat[field] += 1;
    stat.played += 1;
    byName.set(name, stat);
  };
  let gameCount = 0;
  for (const m of done) {
    gameCount += m.score_summary?.games.length ?? 0;
    if (!m.winner) continue;
    const winners = m.winner === "A" ? m.side_a : m.side_b;
    const losers = m.winner === "A" ? m.side_b : m.side_a;
    winners.forEach((p) => bump(p.name, "wins"));
    losers.forEach((p) => bump(p.name, "losses"));
  }
  const players = [...byName.values()].sort(
    (a, b) => b.wins - a.wins || b.played - a.played || a.name.localeCompare(b.name)
  );
  return { matchCount: done.length, gameCount, players };
}

export async function getSessionStats(sessionId: string): Promise<SessionStats> {
  return aggregate(await listMatchesForSession(sessionId));
}

/** Lifetime per-player stats across every completed match in a club. */
export async function getClubStats(clubId: string): Promise<SessionStats> {
  return aggregate(await listMatchesForClub(clubId));
}

export async function listAttendance(sessionId: string, clubId: string): Promise<Attendance[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAllAsync<Attendance>(
    `select p.id, p.club_id, p.profile_id, p.name, coalesce(a.status, 'out') as status
     from club_players_cache p
     left join attendance_cache a on a.club_player_id = p.id and a.session_id = ?
     where p.club_id = ? order by p.name`,
    sessionId, clubId
  );
}

/**
 * Delete a session. Creator only (enforced by RLS — a blocked delete returns
 * zero rows, which the .select() + throw-on-empty check turns into a real
 * error rather than a silent no-op). Matches created under it survive,
 * unlinked, mirroring the on-delete-set-null relationship already declared
 * for matches.session_id (0001_init.sql:77).
 */
export async function deleteSession(id: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to delete a session");
  const { data, error } = await supabase.from("sessions").delete().eq("id", id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not delete session");
  const db = await getDb();
  await db?.runAsync("update matches set session_id = null where session_id = ?", id);
  await db?.runAsync("delete from attendance_cache where session_id = ?", id);
  await db?.runAsync("delete from sessions_cache where id = ?", id);
}

/** Check a player in/out. Any club member may mark any player (shared check-in board). */
export async function setAttendance(
  sessionId: string,
  playerId: string,
  status: AttendanceStatus
): Promise<void> {
  if (!supabase) throw new Error("Sign in to update attendance");
  const { data, error } = await supabase
    .from("attendance")
    .upsert(
      { session_id: sessionId, club_player_id: playerId, status },
      { onConflict: "session_id,club_player_id" },
    )
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not update attendance");
  const db = await getDb();
  await db?.runAsync(
    `insert into attendance_cache (session_id, club_player_id, status, synced)
     values (?, ?, ?, 1)
     on conflict(session_id, club_player_id) do update set status = excluded.status, synced = 1`,
    sessionId, playerId, status
  );
}
```

- [ ] **Step 5: Wire refreshSessions into the sync runner**

In `src/sync/runner.ts`, add the import:

```ts
import { refreshSessions } from "../repos/sessionRepo";
```

And call it alongside `refreshClubs()`:

```ts
    await pushAll(store, client, user.id);
    await refreshClubs();
    await refreshSessions();
```

- [ ] **Step 6: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add supabase/migrations/0015_session_sync.sql src/db/db.ts src/repos/sessionRepo.ts src/sync/runner.ts
git commit -m "feat(sessions): sync sessions and attendance to Supabase, creator-only delete"
```

---

### Task 2: UI — creator-only delete, admin-only create

**Files:**
- Modify: `app/(app)/sessions/[id].tsx`
- Modify: `app/(app)/sessions/index.tsx`
- Modify: `app/new-session.tsx`

**Interfaces:**
- Consumes: `refreshSessions()`, `ClubSession.created_by` from Task 1; `useSession()` from `src/stores/session.tsx` (already exists, returns `{ session: Session | null, loading: boolean }` where `session.user.id` is the signed-in profile id).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Refresh sessions on the list screen**

In `app/(app)/sessions/index.tsx`, add the import:

```ts
import { listSessions, refreshSessions, type ClubSession } from "../../../src/repos/sessionRepo";
```

Change `reload`:

```ts
const reload = useCallback(() => {
  void refreshSessions().then(() => listSessions().then(setSessions));
}, []);
```

- [ ] **Step 2: Swap isAdmin for isCreator on the delete gate**

In `app/(app)/sessions/[id].tsx`, add the import:

```ts
import { useSession } from "../../../src/stores/session";
```

Add the hook call near the top of the component body (alongside the existing `useState` calls):

```ts
const { session: authSession } = useSession();
```

Replace the `isAdmin` line:

```ts
const isAdmin = clubRole === "owner" || clubRole === "admin";
```

with:

```ts
const isCreator = !!authSession && authSession.user.id === session.created_by;
```

Then replace both existing uses of `isAdmin` in this file (the `ListFooterComponent` delete button and the delete-confirm `Sheet`, both already gated on `isAdmin` and nowhere else in the file) with `isCreator`.

- [ ] **Step 3: Filter the club picker to admin clubs**

In `app/new-session.tsx`, change the club-loading effect:

```ts
useEffect(() => {
  void listRealClubs().then((items) => {
    const adminClubs = items.filter((c) => c.role === "owner" || c.role === "admin");
    setClubs(adminClubs);
    setClubId(adminClubs[0]?.id ?? null);
  });
}, []);
```

Add an empty-state message before the form, right after the intro text:

```tsx
<Text style={s.intro}>Set up the court night. Players can check in from the session screen.</Text>
{clubs.length === 0 ? (
  <Text style={s.hint}>You need to be an admin of a club to plan a session.</Text>
) : (
  <>
    <Text style={s.label}>Club</Text>
    <View style={s.chips}>
      {clubs.map((club) => (
        <Pressable key={club.id} style={[s.chip, club.id === clubId && s.chipOn]} onPress={() => setClubId(club.id)}>
          <Text style={s.chipText}>{club.name}</Text>
        </Pressable>
      ))}
    </View>
    <Text style={s.label}>Where</Text>
    <TextInput style={s.input} value={location} onChangeText={setLocation} placeholder="Venue" placeholderTextColor={C.text2} />
    <Text style={s.label}>When</Text>
    <View style={s.chips}>
      <Pressable style={[s.chip, sameDay(day, today) && s.chipOn]} onPress={() => setDay(today)}>
        <Text style={s.chipText}>Today</Text>
      </Pressable>
      <Pressable style={[s.chip, sameDay(day, tomorrow) && s.chipOn]} onPress={() => setDay(tomorrow)}>
        <Text style={s.chipText}>Tomorrow</Text>
      </Pressable>
    </View>
    <DatePicker value={day} onChange={setDay} />
    <Text style={s.hint}>
      {day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
    </Text>
    <Text style={s.label}>Time</Text>
    <TimePicker value={timeMinutes} onChange={setTimeMinutes} />
    <Text style={s.label}>Courts</Text>
    <View style={s.chips}>
      {[1, 2, 3, 4].map((n) => (
        <Pressable key={n} style={[s.chip, courts === n && s.chipOn]} onPress={() => setCourts(n)}>
          <Text style={s.chipText}>{n}</Text>
        </Pressable>
      ))}
    </View>
    <Pressable style={s.cta} onPress={save}><Text style={s.ctaText}>Create session</Text></Pressable>
  </>
)}
```

This replaces everything from the existing `<Text style={s.label}>Club</Text>` line through the final `<Pressable style={s.cta}>` — the whole form body — with the wrapped version above.

- [ ] **Step 4: Gate**

```bash
npx tsc --noEmit && npm test
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/sessions/[id].tsx" "app/(app)/sessions/index.tsx" app/new-session.tsx
git commit -m "feat(sessions): creator-only delete, admin-only session creation"
```

- [ ] **Step 6: Verify on device (two accounts in the same club)**

- Admin creates a session → the non-admin account's device (pull to refresh /
  revisit the Sessions tab) sees it appear.
- Non-admin taps Start, then Finish on that session → status change is
  visible on the admin's device too.
- Non-admin checks a player in/out → visible on the admin's device.
- The admin who did **not** create the session sees no delete option on it;
  the creator does, and deleting it removes it from every device.
- A club member with no admin role anywhere sees "You need to be an admin of
  a club to plan a session." instead of a club picker on the new-session
  screen.

---

## Final verification

- [ ] `npx tsc --noEmit && npm test` — green
- [ ] `npx supabase db push` — `0015` applied (human operator)
- [ ] Device checks from Task 2 Step 6 passed
