# Open Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone with a shared link claim a slot in a club session without becoming a club member.

**Architecture:** Two columns on `sessions` plus four security-definer RPCs. The link is the access grant, scoped to one session — a joiner gets a `club_players` roster row but never a `club_members` row, so every existing club RLS policy keeps them out. Client work is one new route, one new component, and a widened `parseJoinTarget`.

**Tech Stack:** Expo SDK 54 · React Native 0.81 · TypeScript · expo-router · expo-sqlite · Supabase (Postgres + RLS) · Jest

**Spec:** `docs/superpowers/specs/2026-09-09-open-sessions-design.md`

## Global Constraints

- **Read the Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo code.** Required by `AGENTS.md`.
- **Files stay under 500 lines.** `app/(app)/sessions/[id].tsx` is at 498 — Task 6 adds a component rather than inline JSX for exactly this reason.
- **Never `git add -A` / `git add .` / `git commit -a`.** Explicit pathspec on every commit — this is a shared checkout.
- **No `Co-Authored-By` trailer.** This project's `.claude/settings.json` has no `attribution.commit`.
- **Never commit secrets or `.env`.**
- **Both `npx tsc --noEmit` and `npx jest` must pass before every commit.**
- **Do not run `supabase db push`.** Migration files are written but applied by a human. Task 3 ends with a handoff note, not a deployment.
- Local SQLite migrations are **appended** to the `MIGRATIONS` array in `src/db/db.ts`, never edited in place — editing an applied migration means existing installs never receive it.
- Currency/money display: minor units, no symbol (established by `src/lib/money.ts` in 0045).

---

### Task 1: `joinLink` understands the session kind

Pure TypeScript, no database. Everything downstream needs `parseJoinTarget` to resolve `/join/session/<id>`, including the signed-out replay path — `app/_layout.tsx:117` already parks any `segments[0] === "join"` URL in `pendingLink` and replays it through `parseJoinTarget`, so no layout change is needed once this task lands.

**Files:**
- Modify: `src/lib/joinLink.ts`
- Test: `tests/joinLink.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `buildSessionJoinPath(sessionId: string): string` → `"join/session/<id>"`
  - `parseJoinTarget` return `kind` widened to `"club" | "tournament" | "session"`
  - `joinRouteFor` maps a session target to `/join/session/<id>` (no role suffix)

- [ ] **Step 1: Write the failing tests**

Append to `tests/joinLink.test.ts`:

```ts
import { buildSessionJoinPath } from "../src/lib/joinLink";

test("builds a session join path without a scheme", () => {
  expect(buildSessionJoinPath("s-1")).toBe("join/session/s-1");
});

test("parses a session link", () => {
  expect(parseJoinTarget("badminton://join/session/s-1"))
    .toEqual({ kind: "session", id: "s-1", role: "player" });
  expect(parseJoinTarget("https://courtside-links.vercel.app/join/session/s-1"))
    .toEqual({ kind: "session", id: "s-1", role: "player" });
});

test("a session link ignores any trailing role segment", () => {
  expect(parseJoinTarget("badminton://join/session/s-1/scorer"))
    .toEqual({ kind: "session", id: "s-1", role: "player" });
});

test("routes a session target to its join screen", () => {
  expect(joinRouteFor({ kind: "session", id: "s-1", role: "player" }))
    .toBe("/join/session/s-1");
});

test("a bare uuid still means tournament, not session", () => {
  expect(parseJoinTarget("11111111-2222-3333-4444-555555555555"))
    .toEqual({ kind: "tournament", id: "11111111-2222-3333-4444-555555555555", role: "player" });
});

test("rejects a session link with an unresolved route placeholder", () => {
  expect(parseJoinTarget("badminton://join/session/[id]")).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/joinLink.test.ts`
Expected: FAIL — `buildSessionJoinPath is not a function`, and the session parse cases return `null`.

- [ ] **Step 3: Widen the parser**

In `src/lib/joinLink.ts`, add the builder next to the existing ones:

```ts
export function buildSessionJoinPath(sessionId: string): string {
  return `join/session/${sessionId}`;
}
```

Change the `parseJoinTarget` signature's `kind` union and its inner check:

```ts
export function parseJoinTarget(
  url: string,
): { kind: "club" | "tournament" | "session"; id: string; role: JoinRole } | null {
```

Inside the `while (at !== -1)` loop, replace the kind test:

```ts
    const kind = parts[at + 1];
    const id = parts[at + 2];
    if ((kind === "club" || kind === "tournament" || kind === "session") && id) {
      if (id.includes("[") || id.includes("]")) return null;
      // Sessions have no sub-roles: a slot is a slot. Any trailing segment is
      // ignored rather than parsed, so a mangled link still resolves.
      const role: JoinRole = kind === "session"
        ? "player"
        : parts[at + 3] === "scorer" ? "scorer"
        : parts[at + 3] === "spectator" ? "spectator"
        : "player";
      return { kind, id, role };
    }
```

Widen `joinRouteFor`'s parameter type the same way. Its body needs no change — a session target has `role: "player"`, which already produces an empty suffix:

```ts
export function joinRouteFor(target: { kind: "club" | "tournament" | "session"; id: string; role: JoinRole }): string {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/joinLink.test.ts && npx tsc --noEmit`
Expected: PASS, and no type errors. `tsc` will flag any other call site that narrowed on the old two-member union — fix those by widening, not by casting.

- [ ] **Step 5: Commit**

```bash
git add src/lib/joinLink.ts tests/joinLink.test.ts
git commit -m "feat(links): parse and build session join links"
```

---

### Task 2: Join eligibility as a pure function

The rule for whether a slot can be claimed, in one testable place. The RPC re-checks every clause server-side — this copy exists only so the button can disable itself before a round trip, and must never be the gate.

**Files:**
- Create: `src/session/openJoin.ts`
- Test: `tests/openJoin.test.ts`

**Interfaces:**
- Consumes: `SessionStatus` from `src/repos/sessionRepo`.
- Produces:
  - `interface SessionOpenPreview { sessionId, clubName, location, startsAt, status, checkedIn, maxPlayers, alreadyIn }`
  - `type JoinBlockReason = "closed" | "finished" | "full" | "already-in"`
  - `joinEligibility(p: SessionOpenPreview): { ok: true } | { ok: false; reason: JoinBlockReason; message: string }`

- [ ] **Step 1: Write the failing test**

Create `tests/openJoin.test.ts`:

```ts
import { joinEligibility, type SessionOpenPreview } from "../src/session/openJoin";

const preview = (over: Partial<SessionOpenPreview> = {}): SessionOpenPreview => ({
  sessionId: "s-1",
  clubName: "Sunrise Badminton",
  location: "Court 3",
  startsAt: 1_760_000_000_000,
  status: "scheduled",
  checkedIn: 4,
  maxPlayers: 12,
  alreadyIn: false,
  ...over,
});

test("an open session with room accepts a join", () => {
  expect(joinEligibility(preview())).toEqual({ ok: true });
});

test("a session at capacity is full", () => {
  const result = joinEligibility(preview({ checkedIn: 12, maxPlayers: 12 }));
  expect(result).toEqual({ ok: false, reason: "full", message: "This session is full." });
});

test("capacity is a floor, not an equality — an over-filled session stays full", () => {
  // The organiser can lower max_players below the current count; that must not
  // wrap around into "there is room".
  expect(joinEligibility(preview({ checkedIn: 20, maxPlayers: 12 })).ok).toBe(false);
});

test("a null max means unlimited", () => {
  expect(joinEligibility(preview({ checkedIn: 500, maxPlayers: null }))).toEqual({ ok: true });
});

test("a finished or cancelled session cannot be joined", () => {
  expect(joinEligibility(preview({ status: "done" })).ok).toBe(false);
  expect(joinEligibility(preview({ status: "cancelled" })).ok).toBe(false);
});

test("a live session can still be joined — people arrive late", () => {
  expect(joinEligibility(preview({ status: "live" }))).toEqual({ ok: true });
});

test("already being in reports itself rather than an error", () => {
  const result = joinEligibility(preview({ alreadyIn: true }));
  expect(result).toEqual({ ok: false, reason: "already-in", message: "You are already in this session." });
});

test("already-in wins over full, so a joined player never sees a full message", () => {
  const result = joinEligibility(preview({ alreadyIn: true, checkedIn: 12, maxPlayers: 12 }));
  expect(result).toMatchObject({ reason: "already-in" });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/openJoin.test.ts`
Expected: FAIL — `Cannot find module '../src/session/openJoin'`.

- [ ] **Step 3: Write the implementation**

Create `src/session/openJoin.ts`:

```ts
import type { SessionStatus } from "../repos/sessionRepo";

/**
 * What someone holding an open-session link is allowed to see. Mirrors the
 * columns returned by the session_open_preview RPC.
 *
 * Deliberately carries no player names, no cost, and nothing about any other
 * session — a forwarded link discloses a count, never a guest list.
 */
export interface SessionOpenPreview {
  sessionId: string;
  clubName: string;
  location: string | null;
  startsAt: number;
  status: SessionStatus;
  checkedIn: number;
  maxPlayers: number | null;
  alreadyIn: boolean;
}

export type JoinBlockReason = "closed" | "finished" | "full" | "already-in";

export type JoinEligibility =
  | { ok: true }
  | { ok: false; reason: JoinBlockReason; message: string };

/**
 * Whether this viewer can claim a slot right now.
 *
 * A courtesy check so the button can disable before a round trip. The RPC
 * enforces every one of these clauses again server-side and is the real gate —
 * this function being wrong makes the UI misleading, never insecure.
 *
 * Order matters: already-in is tested first so someone who already holds a slot
 * in a full session is told they are in, not that it is full.
 */
export function joinEligibility(p: SessionOpenPreview): JoinEligibility {
  if (p.alreadyIn) {
    return { ok: false, reason: "already-in", message: "You are already in this session." };
  }
  if (p.status === "done" || p.status === "cancelled") {
    return { ok: false, reason: "finished", message: "This session has already finished." };
  }
  // >= not ===: the organiser may lower max_players below the current head
  // count, and that must not read as room having opened up.
  if (p.maxPlayers !== null && p.checkedIn >= p.maxPlayers) {
    return { ok: false, reason: "full", message: "This session is full." };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/openJoin.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/session/openJoin.ts tests/openJoin.test.ts
git commit -m "feat(sessions): pure join-eligibility rule for open sessions"
```

---

### Task 3: Migration `0046_open_sessions.sql`

The security surface of the whole feature. Nothing here can be executed locally — there is no Postgres and Docker is not running — so the guard is a text-assertion test over the migration file plus careful review.

**Files:**
- Create: `supabase/migrations/0046_open_sessions.sql`
- Test: `tests/schema.openSessions.test.ts`

**Interfaces:**
- Consumes: `is_club_admin(uuid)` (0001), `can_manage_session_cost(uuid)` (0045).
- Produces these RPC names and parameters, relied on verbatim by Task 4:
  - `session_open_preview(p_session_id uuid)` → table
  - `join_open_session(p_session_id uuid)` → uuid
  - `leave_open_session(p_session_id uuid)` → void
  - `set_session_open_join(p_session_id uuid, p_open boolean, p_max_players int)` → void
  - `can_manage_session(p_session_id uuid)` → boolean

- [ ] **Step 1: Write the failing test**

Create `tests/schema.openSessions.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "0046_open_sessions.sql"),
  "utf8",
);

test("adds the two session columns, defaulting closed", () => {
  expect(sql).toMatch(/add column open_join\s+boolean not null default false/);
  expect(sql).toMatch(/add column max_players int/);
  expect(sql).toMatch(/max_players between 1 and 100/);
});

test("join_open_session locks the session row before counting", () => {
  // The capacity check is only correct under a row lock: without it two
  // callers racing for the last slot both read the same count and both win.
  // This assertion is the only automated guard on that, since the behaviour
  // cannot be exercised without a live Postgres.
  const fn = sql.slice(sql.indexOf("function public.join_open_session"));
  expect(fn).toMatch(/for update/);
  expect(fn.indexOf("for update")).toBeLessThan(fn.indexOf("count("));
});

test("every new function is security definer with a pinned search_path", () => {
  const definitions = sql.match(/create or replace function public\.\w+[\s\S]*?\$\$/g) ?? [];
  // can_manage_session, can_manage_session_cost, set_session_open_join,
  // session_open_preview, join_open_session, leave_open_session.
  expect(definitions.length).toBe(6);
  for (const d of definitions) {
    expect(d).toMatch(/security definer/);
    expect(d).toMatch(/set search_path = public/);
  }
});

test("execute is revoked from anon and granted only to authenticated", () => {
  for (const fn of [
    "session_open_preview", "join_open_session",
    "leave_open_session", "set_session_open_join", "can_manage_session",
  ]) {
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}[^;]*from public, anon`));
    expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}[^;]*to authenticated`));
  }
});

test("the preview discloses no player names", () => {
  const fn = sql.slice(
    sql.indexOf("function public.session_open_preview"),
    sql.indexOf("function public.join_open_session"),
  );
  expect(fn).not.toMatch(/club_players/);
  expect(fn).toMatch(/count\(/);
});

test("keeps can_manage_session_cost resolvable for 0045's RPCs", () => {
  expect(sql).toMatch(/create or replace function public\.can_manage_session_cost/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/schema.openSessions.test.ts`
Expected: FAIL — `ENOENT: no such file or directory ... 0046_open_sessions.sql`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0046_open_sessions.sql`:

```sql
-- Open sessions: claim a slot in a club night from a shared link, without
-- becoming a member of that club.
--
-- The link is the access grant, scoped to exactly one session — the same shape
-- as tournament_spectator_view (0017), not the club join-request flow (0004).
-- A joiner receives a club_players roster row and NOT a club_members row, so
-- is_club_member() stays false for them and every existing club policy keeps
-- them out of the club, its other sessions, its stats and its matches.
--
-- No table policies change. All access runs through the security-definer
-- functions below, each gated internally.

alter table public.sessions
  add column open_join  boolean not null default false,
  add column max_players int check (max_players is null or max_players between 1 and 100);

-- One definition of "organiser" — the session creator or a club admin.
--
-- 0045 introduced this predicate as can_manage_session_cost. Open-join needs
-- the identical rule, so the concept is renamed here and the old name becomes a
-- wrapper: set_session_cost and set_attendance_settled keep resolving, and
-- there is one place to change who counts as an organiser rather than two that
-- drift apart.
create or replace function public.can_manage_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sessions s
     where s.id = p_session_id
       and (public.is_club_admin(s.club_id) or s.created_by = auth.uid())
  );
$$;

create or replace function public.can_manage_session_cost(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_session(p_session_id);
$$;

-- Organiser toggles the link on/off and sets the cap.
--
-- The sessions UPDATE policy is admin-only (0001), so a creator who is not an
-- admin cannot write these columns directly — hence an RPC, exactly as 0045
-- needed for the cost columns.
create or replace function public.set_session_open_join(
  p_session_id uuid,
  p_open boolean,
  p_max_players int
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_session(p_session_id) then
    raise exception 'Only the session creator or a club admin can open this session';
  end if;
  if p_max_players is not null and (p_max_players < 1 or p_max_players > 100) then
    raise exception 'Player limit must be between 1 and 100';
  end if;
  -- Lowering the cap below the current head count is allowed and evicts nobody;
  -- it only stops further joins. Evicting players because a number was edited
  -- would be a destructive surprise from a settings change.
  update sessions
     set open_join = coalesce(p_open, false),
         max_players = p_max_players
   where id = p_session_id;
end $$;

-- What a link holder may see. No player names, no cost, no other session.
-- Returns zero rows when the session is closed, so a revoked link is
-- indistinguishable from one that never existed.
create or replace function public.session_open_preview(p_session_id uuid)
returns table (
  session_id uuid,
  club_name text,
  location text,
  starts_at timestamptz,
  status text,
  checked_in int,
  max_players int,
  already_in boolean
) language sql security definer stable set search_path = public as $$
  select
    s.id,
    c.name,
    s.location,
    s.starts_at,
    s.status,
    (select count(*)::int from attendance a
      where a.session_id = s.id and a.status = 'in'),
    s.max_players,
    exists (
      select 1 from attendance a
        join club_players p on p.id = a.club_player_id
       where a.session_id = s.id and a.status = 'in' and p.profile_id = auth.uid()
    )
  from sessions s
  join clubs c on c.id = s.club_id
  where s.id = p_session_id and s.open_join;
$$;

-- Claim a slot. Returns the caller's club_player_id.
create or replace function public.join_open_session(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_club  uuid;
  v_open  boolean;
  v_status text;
  v_max   int;
  v_count int;
  v_player uuid;
  v_name  text;
begin
  if auth.uid() is null then raise exception 'Sign in to join this session'; end if;

  -- FOR UPDATE is load-bearing, not defensive. It serialises concurrent joiners
  -- on the session row so the capacity count below cannot be read stale — two
  -- people racing for the last slot would otherwise both see room and both win.
  select club_id, open_join, status, max_players
    into v_club, v_open, v_status, v_max
    from sessions where id = p_session_id for update;

  if v_club is null or not v_open then raise exception 'This link is no longer active'; end if;
  if v_status not in ('scheduled', 'live') then
    raise exception 'This session has already finished';
  end if;

  -- Reuse this player's existing roster row when they have played this club
  -- before, so a repeat visitor rejoins as themselves instead of cloning a
  -- second same-named entry onto the roster.
  select id into v_player
    from club_players
   where club_id = v_club and profile_id = auth.uid()
   limit 1;

  if v_player is null then
    select coalesce(nullif(display_name, ''), 'Player') into v_name
      from profiles where id = auth.uid();
    insert into club_players (club_id, profile_id, name)
      values (v_club, auth.uid(), coalesce(v_name, 'Player'))
      returning id into v_player;
  end if;

  if exists (select 1 from attendance
              where session_id = p_session_id
                and club_player_id = v_player and status = 'in') then
    return v_player; -- idempotent: already in, nothing to do
  end if;

  select count(*)::int into v_count
    from attendance where session_id = p_session_id and status = 'in';
  if v_max is not null and v_count >= v_max then
    raise exception 'This session is full';
  end if;

  insert into attendance (session_id, club_player_id, status)
    values (p_session_id, v_player, 'in')
    on conflict (session_id, club_player_id) do update set status = 'in';

  return v_player;
end $$;

-- Give the slot back. Only ever touches the caller's own row.
--
-- Required, not a nicety: a joiner is checked in, and 0045 therefore hands them
-- a share of the night's cost. Right when they played, wrong when they mistapped
-- a link — so there has to be a way out.
create or replace function public.leave_open_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_player uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to leave this session'; end if;
  select p.id into v_player
    from club_players p
    join sessions s on s.id = p_session_id and s.club_id = p.club_id
   where p.profile_id = auth.uid()
   limit 1;
  if v_player is null then raise exception 'You are not in this session'; end if;
  update attendance set status = 'out'
   where session_id = p_session_id and club_player_id = v_player;
end $$;

revoke all on function public.can_manage_session(uuid) from public, anon;
revoke all on function public.can_manage_session_cost(uuid) from public, anon;
revoke all on function public.set_session_open_join(uuid, boolean, int) from public, anon;
revoke all on function public.session_open_preview(uuid) from public, anon;
revoke all on function public.join_open_session(uuid) from public, anon;
revoke all on function public.leave_open_session(uuid) from public, anon;
grant execute on function public.can_manage_session(uuid) to authenticated;
grant execute on function public.can_manage_session_cost(uuid) to authenticated;
grant execute on function public.set_session_open_join(uuid, boolean, int) to authenticated;
grant execute on function public.session_open_preview(uuid) to authenticated;
grant execute on function public.join_open_session(uuid) to authenticated;
grant execute on function public.leave_open_session(uuid) to authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/schema.openSessions.test.ts`
Expected: PASS, all six assertions.

If an assertion fails, fix the **migration**, not the test. Each one encodes a
security property from the spec: the row lock, the definer/search_path pinning,
the anon revoke, and the no-names guarantee on the preview. Weakening a test to
make it green removes the only automated check standing behind a change nobody
here can execute.

- [ ] **Step 5: Commit, and do NOT deploy**

```bash
git add supabase/migrations/0046_open_sessions.sql tests/schema.openSessions.test.ts
git commit -m "feat(db): open-session join RPCs, scoped to one session"
```

Then stop and report: the migration is written but **not applied**. A human runs `npx supabase db push --linked`. Flag two things for them in the report:
1. `can_manage_session_cost` is being redefined — 0045's RPCs depend on it, so a failed push must be rolled back rather than half-applied. It is inside the migration's implicit transaction, so this is safe by default.
2. The capacity race is unverified. Ask them to run two concurrent `join_open_session` calls for the last slot against a staging project if one exists.

---

### Task 4: Repository layer

Wraps the four RPCs and teaches `sessions_cache` about the two new columns.

**Files:**
- Modify: `src/repos/sessionRepo.ts`
- Modify: `src/db/db.ts` (append one `MIGRATIONS` entry)
- Test: `tests/openSessionRepo.test.ts`

**Interfaces:**
- Consumes: `SessionOpenPreview` from `src/session/openJoin` (Task 2); the RPC names from Task 3.
- Produces:
  - `ClubSession` gains `open_join: boolean` and `max_players: number | null`
  - `getSessionOpenPreview(sessionId: string): Promise<SessionOpenPreview | null>`
  - `joinOpenSession(sessionId: string): Promise<string>`
  - `leaveOpenSession(sessionId: string): Promise<void>`
  - `setSessionOpenJoin(sessionId: string, input: { open: boolean; maxPlayers: number | null }): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `tests/openSessionRepo.test.ts`, following the mock shape already used by `tests/addFriendToClub.test.ts`:

```ts
const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
jest.mock("../src/db/db", () => ({ getDb: async () => null }));

import {
  getSessionOpenPreview, joinOpenSession, leaveOpenSession, setSessionOpenJoin,
} from "../src/repos/sessionRepo";

beforeEach(() => rpc.mockReset());

test("maps a preview row into camelCase", async () => {
  rpc.mockResolvedValue({
    data: [{
      session_id: "s-1", club_name: "Sunrise", location: "Court 3",
      starts_at: "2026-09-10T12:30:00.000Z", status: "scheduled",
      checked_in: 4, max_players: 12, already_in: false,
    }],
    error: null,
  });
  await expect(getSessionOpenPreview("s-1")).resolves.toEqual({
    sessionId: "s-1", clubName: "Sunrise", location: "Court 3",
    startsAt: Date.parse("2026-09-10T12:30:00.000Z"), status: "scheduled",
    checkedIn: 4, maxPlayers: 12, alreadyIn: false,
  });
  expect(rpc).toHaveBeenCalledWith("session_open_preview", { p_session_id: "s-1" });
});

test("a closed session previews as null rather than throwing", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  await expect(getSessionOpenPreview("s-1")).resolves.toBeNull();
});

test("joinOpenSession returns the club_player_id", async () => {
  rpc.mockResolvedValue({ data: "cp-9", error: null });
  await expect(joinOpenSession("s-1")).resolves.toBe("cp-9");
  expect(rpc).toHaveBeenCalledWith("join_open_session", { p_session_id: "s-1" });
});

test("joinOpenSession surfaces the RPC message verbatim", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "This session is full" } });
  await expect(joinOpenSession("s-1")).rejects.toThrow("This session is full");
});

test("leaveOpenSession calls through", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await expect(leaveOpenSession("s-1")).resolves.toBeUndefined();
  expect(rpc).toHaveBeenCalledWith("leave_open_session", { p_session_id: "s-1" });
});

test("setSessionOpenJoin passes a null cap through unchanged", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await setSessionOpenJoin("s-1", { open: true, maxPlayers: null });
  expect(rpc).toHaveBeenCalledWith("set_session_open_join", {
    p_session_id: "s-1", p_open: true, p_max_players: null,
  });
});

test("setSessionOpenJoin clamps a cap into the 1..100 the column allows", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await setSessionOpenJoin("s-1", { open: true, maxPlayers: 999 });
  expect(rpc).toHaveBeenCalledWith("set_session_open_join", {
    p_session_id: "s-1", p_open: true, p_max_players: 100,
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/openSessionRepo.test.ts`
Expected: FAIL — the four functions are not exported from `sessionRepo`.

- [ ] **Step 3: Extend the local schema and the repo**

In `src/db/db.ts`, **append** to the `MIGRATIONS` array (do not edit the 0045 entry):

```ts
  // Open sessions (0046_open_sessions.sql). SQLite has no boolean, so
  // open_join is an integer flag, mapped back in sessionRepo's hydrate().
  `alter table sessions_cache add column open_join integer not null default 0;
   alter table sessions_cache add column max_players integer;`,
```

In `src/repos/sessionRepo.ts`, add to the `ClubSession` interface:

```ts
  /** Anyone with the link may claim a slot. */
  open_join: boolean;
  /** Cap on checked-in players, or null for unlimited. */
  max_players: number | null;
```

`listSessions` and `getSession` both read `select *`, which yields `open_join` as
`0 | 1`. Add one mapper and route both through it, replacing the two existing
inline `isStaleLive` conversions:

```ts
/**
 * Cache row to domain object. Two conversions live here so the two read paths
 * cannot disagree: SQLite's integer flag becomes a real boolean, and a session
 * left live past the auto-finish window is *reported* as done without
 * persisting that (see sweepStaleLiveSessions for the persisting counterpart).
 */
function hydrate(row: ClubSession & { open_join: number | boolean }, now: number): ClubSession {
  const session = { ...row, open_join: !!row.open_join };
  return isStaleLive(session, now) ? { ...session, status: "done" as const } : session;
}
```

Use it in both readers:

```ts
  const now = Date.now();
  return rows.map((row) => hydrate(row as never, now));
```

```ts
export async function getSession(id: string): Promise<ClubSession | null> {
  const db = await getDb();
  const row = (await db?.getFirstAsync<ClubSession>("select * from sessions_cache where id = ?", id)) ?? null;
  return row ? hydrate(row as never, Date.now()) : null;
}
```

Add the two columns to `refreshSessions` — both the `.select(...)` string and the
`insertMany` column list and row mapper, exactly as 0045's columns were added:

```ts
      .select("id, club_id, starts_at, ends_at, location, courts, status, created_at, created_by, cost_total_cents, shuttles, paid_by, open_join, max_players")
```

```ts
        ["id", "club_id", "starts_at", "ends_at", "location", "courts",
         "status", "created_at", "created_by", "cost_total_cents", "shuttles",
         "paid_by", "open_join", "max_players", "synced"],
```

```ts
          s.paid_by as string | null,
          (s.open_join as boolean) ? 1 : 0,
          (s.max_players as number | null) ?? null, 1,
```

Then append the four wrappers:

```ts
import { type SessionOpenPreview } from "../session/openJoin";

/**
 * What a link holder sees before joining. Null when the session is closed or
 * gone — the RPC cannot tell those apart on purpose, so neither can we.
 */
export async function getSessionOpenPreview(sessionId: string): Promise<SessionOpenPreview | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("session_open_preview", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  const row = (data as {
    session_id: string; club_name: string; location: string | null;
    starts_at: string; status: SessionStatus; checked_in: number;
    max_players: number | null; already_in: boolean;
  }[] | null)?.[0];
  if (!row) return null;
  return {
    sessionId: row.session_id,
    clubName: row.club_name,
    location: row.location,
    startsAt: Date.parse(row.starts_at),
    status: row.status,
    checkedIn: row.checked_in ?? 0,
    maxPlayers: row.max_players,
    alreadyIn: !!row.already_in,
  };
}

/** Claim a slot. Idempotent — rejoining returns the same club_player_id. */
export async function joinOpenSession(sessionId: string): Promise<string> {
  if (!supabase) throw new Error("Sign in to join this session");
  const { data, error } = await supabase.rpc("join_open_session", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Give the slot back, so the cost split stops counting them. */
export async function leaveOpenSession(sessionId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to leave this session");
  const { error } = await supabase.rpc("leave_open_session", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
}

/** Organiser-only: open or close the link and set the cap. */
export async function setSessionOpenJoin(
  sessionId: string,
  input: { open: boolean; maxPlayers: number | null },
): Promise<void> {
  if (!supabase) throw new Error("Sign in to change this session");
  const maxPlayers = input.maxPlayers === null
    ? null
    : Math.max(1, Math.min(100, Math.round(input.maxPlayers)));
  const { error } = await supabase.rpc("set_session_open_join", {
    p_session_id: sessionId, p_open: input.open, p_max_players: maxPlayers,
  });
  if (error) throw new Error(error.message);
  const db = await getDb();
  await db?.runAsync(
    "update sessions_cache set open_join = ?, max_players = ? where id = ?",
    input.open ? 1 : 0, maxPlayers, sessionId
  );
}
```

- [ ] **Step 4: Run the full suite**

Run: `npx tsc --noEmit && npx jest`
Expected: all green. `tsc` will flag every `ClubSession` fixture missing the two
new fields — `tests/homeDashboard.test.ts` and `tests/reminderPlan.test.ts` both
build one. Add `open_join: false, max_players: null` to each, the same way the
0045 fields were added to them.

- [ ] **Step 5: Commit**

```bash
git add src/repos/sessionRepo.ts src/db/db.ts tests/openSessionRepo.test.ts tests/homeDashboard.test.ts tests/reminderPlan.test.ts
git commit -m "feat(sessions): repo wrappers and cache columns for open join"
```

---

### Task 5: The join screen

The link holder's only view of the session, before and after joining — they are not a club member, so it can never appear in their sessions tab. Reads solely from the RPC, so it behaves identically on web, where `getDb()` returns null and the session cache is empty.

**Files:**
- Create: `app/join/session/[id].tsx`
- Reference: `app/join/club/[id].tsx` (the shape to follow — 116 lines, same states)

**Interfaces:**
- Consumes: `getSessionOpenPreview`, `joinOpenSession`, `leaveOpenSession` (Task 4); `joinEligibility` (Task 2).
- Produces: route `/join/session/<id>`, reached by `joinRouteFor` from Task 1.

- [ ] **Step 1: Read the screen being mirrored**

Read `app/join/club/[id].tsx` in full. Match its loading spinner, its not-found card, its `FormScreen` + `Logo` + `PressableScale` composition, and its toast-on-error convention. Do not invent a new visual language.

- [ ] **Step 2: Write the screen**

Create `app/join/session/[id].tsx`. The logic, in full — styles and the
not-found card copy the mirrored club screen's `StyleSheet` and layout:

```tsx
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  getSessionOpenPreview, joinOpenSession, leaveOpenSession,
} from "../../../src/repos/sessionRepo";
import { joinEligibility, type SessionOpenPreview } from "../../../src/session/openJoin";
import { toast } from "../../../src/lib/toast";
import Icon from "../../../src/components/Icon";
import Logo from "../../../src/components/Logo";
import PressableScale from "../../../src/components/PressableScale";
import { C, F } from "../../../src/theme";

export default function JoinSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<SessionOpenPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    try {
      setPreview(await getSessionOpenPreview(id));
    } catch (e) {
      toast((e as Error).message || "Could not load that session", "error");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: (sessionId: string) => Promise<unknown>, fallback: string) => {
    if (!id || busy) return;          // busy guard: a double tap must not fire two joins
    setBusy(true);
    try {
      await fn(id);
      await load();                    // re-read rather than guess the new state
    } catch (e) {
      toast((e as Error).message || fallback, "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={C.red} /></View>;

  // A closed session and a nonexistent one are the same response by design —
  // session_open_preview returns no rows for both, so a revoked link cannot be
  // distinguished from one that never existed.
  if (!preview) {
    return (
      <View style={s.center}>
        <Logo size={44} />
        <Text style={s.title}>This link is no longer active</Text>
        <Text style={s.sub}>Ask the organiser for a fresh one.</Text>
        <PressableScale style={s.ghost} onPress={() => router.replace("/")}>
          <Text style={s.ghostText}>Back to CourtSide</Text>
        </PressableScale>
      </View>
    );
  }

  const eligibility = joinEligibility(preview);
  const joined = !eligibility.ok && eligibility.reason === "already-in";
  const when = new Date(preview.startsAt).toLocaleString([], {
    weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const heads = preview.maxPlayers === null
    ? `${preview.checkedIn} in`
    : `${preview.checkedIn} of ${preview.maxPlayers} in`;

  return (
    <View style={s.center}>
      <Logo size={44} />
      {joined && <Icon name="checkmark-circle" color={C.green} size={32} />}
      <Text style={s.title}>{joined ? "You're in" : preview.clubName}</Text>
      <Text style={s.sub}>{preview.location || "Badminton session"}</Text>
      <Text style={s.sub}>{when}</Text>
      <Text style={s.heads}>{heads}</Text>

      {joined ? (
        <PressableScale
          style={s.ghost}
          disabled={busy}
          accessibilityLabel="Leave this session"
          onPress={() => void act(leaveOpenSession, "Could not leave the session")}
        >
          <Text style={s.ghostText}>{busy ? "Leaving…" : "Leave session"}</Text>
        </PressableScale>
      ) : (
        <>
          <PressableScale
            style={[s.cta, (!eligibility.ok || busy) && s.ctaOff]}
            disabled={!eligibility.ok || busy}
            accessibilityLabel="Join this session"
            onPress={() => void act(joinOpenSession, "Could not join the session")}
          >
            <Text style={s.ctaText}>{busy ? "Joining…" : "Join this session"}</Text>
          </PressableScale>
          {/* Never router.replace("/") on success — a non-member has nowhere to
              land, so this screen stays their view of the session. */}
          {!eligibility.ok && <Text style={s.blocked}>{eligibility.message}</Text>}
        </>
      )}
    </View>
  );
}
```

Copy `s.center`, `s.title`, `s.sub`, `s.ghost` and `s.ghostText` verbatim from
`app/join/club/[id].tsx`'s `StyleSheet`, and add:

```ts
  heads: { color: C.accent, fontFamily: F.semibold, fontSize: 14 },
  cta: { /* match the club screen's primary PressableScale */ },
  ctaOff: { opacity: 0.5 },
  ctaText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
  blocked: { color: C.amber, fontFamily: F.body, fontSize: 13, textAlign: "center" },
```

Behaviour the code above must satisfy, restated as the acceptance check:

- Loading: `<ActivityIndicator color={C.red} />`, centred.
- Preview null: the not-found card, copy `"This link is no longer active."` plus `"Ask the organiser for a fresh one."` and a "Back to CourtSide" `PressableScale` that does `router.replace("/")`. This is also what a closed session renders — the RPC does not distinguish them and neither should the UI.
- Loaded and `joinEligibility(preview).ok`: club name, venue, the start time via
  `new Date(startsAt).toLocaleString([], { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })`, the head count as `` `${checkedIn} in` `` or `` `${checkedIn} of ${maxPlayers} in` ``, and a primary "Join this session" button.
- Loaded and not ok: render the same card with the button disabled and
  `eligibility.message` shown beneath it. When `reason === "already-in"`, instead
  render the joined state: a checkmark, `"You're in"`, the same session details,
  and a secondary "Leave session" action.
- Join success: re-fetch the preview and fall into the joined state. Do **not**
  `router.replace("/")` — a non-member has nowhere to land.
- Leave success: re-fetch the preview and fall back to the joinable state.
- Every failure path: `toast((e as Error).message || "<fallback>", "error")`.

Guard the button with a `busy` state during both RPCs so a double-tap cannot fire two joins.

- [ ] **Step 3: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx jest`
Expected: green. No new unit test here — the screen is composition over
already-tested units, matching how `app/join/club/[id].tsx` is covered.

- [ ] **Step 4: Verify the route resolves**

Run: `npx expo start --web`, then open `http://localhost:8081/join/session/does-not-exist`.
Expected: the not-found card, not a router 404 — this proves the route file is
picked up and that a bad id degrades correctly.

- [ ] **Step 5: Commit**

```bash
git add "app/join/session/[id].tsx"
git commit -m "feat(sessions): join screen for an open-session link"
```

---

### Task 6: Organiser controls

**Files:**
- Create: `src/components/SessionOpenJoin.tsx`
- Modify: `app/(app)/sessions/[id].tsx`

**Interfaces:**
- Consumes: `setSessionOpenJoin` (Task 4); `buildSessionJoinPath` (Task 1); `shareJoinLink` from `src/lib/shareJoin`; `canManageCost` — already computed in the screen at the `isCreator` line, rename it `canManage` since it now gates two features.
- Produces: `<SessionOpenJoin session={...} canManage={...} onChanged={...} />`

- [ ] **Step 1: Build the component**

Create `src/components/SessionOpenJoin.tsx`, modelled on `src/components/SessionCost.tsx` (same `CarvedCard` shell, same `BottomPanel` editor, same `toast` error handling). It renders:

- Nothing at all when `!canManage && !session.open_join`.
- Closed + `canManage`: a single "Open to anyone with the link" action.
- Open: an `OPEN` state line, the cap (`"Limit 12"` or `"No limit"`), a **Share
  link** button calling
  `shareJoinLink(buildSessionJoinPath(session.id), 'invited you to play in "<venue>"')`,
  and a "Close link" action.
- Editor panel: a `Stepper` for the cap plus an explicit "No limit" `Chip` that
  sets it to null. Reuse `Stepper` with `min={1} max={100}` — do not hand-roll a
  numeric input.

Accessibility is not optional here: give the toggle `accessibilityRole="switch"`
with `accessibilityState={{ checked: session.open_join }}`, and every action an
`accessibilityLabel`.

- [ ] **Step 2: Mount it**

In `app/(app)/sessions/[id].tsx`, rename `canManageCost` to `canManage` (update
its use on the `SessionCost` element too), and add one line directly beneath the
`<SessionCost … />` element:

```tsx
          <SessionOpenJoin session={session} canManage={canManage} onChanged={reload} />
```

- [ ] **Step 3: Check the line budget**

Run: `wc -l "app/(app)/sessions/[id].tsx"`
Expected: under 500. It was 498 before this task and the import plus one element
push it to ~500. If it lands at 500 or over, move the `SessionCost` and
`SessionOpenJoin` elements into a single `<SessionAdmin>` wrapper component
rather than trimming comments — the ceiling exists to force extraction, and
deleting explanation to squeak under it defeats the point.

- [ ] **Step 4: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx jest`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionOpenJoin.tsx "app/(app)/sessions/[id].tsx"
git commit -m "feat(sessions): organiser controls to open a session by link"
```

---

### Task 7: `OPEN` marker in the sessions list

**Files:**
- Modify: `app/(app)/sessions/index.tsx` (121 lines)

**Interfaces:**
- Consumes: `ClubSession.open_join` (Task 4).
- Produces: nothing downstream.

- [ ] **Step 1: Add the marker**

Read `app/(app)/sessions/index.tsx`, find the row that renders a session's status
or date, and add a small `OPEN` label beside it, shown only when
`session.open_join`. Style it with `C.accent` and `F.semibold` at the same size
as the existing eyebrow text — reuse the row's existing type scale rather than
introducing a new one.

Give it `accessibilityLabel="Open to anyone with the link"` so the marker is not
colour-only information.

- [ ] **Step 2: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx jest`
Expected: green.

- [ ] **Step 3: Verify on device or web**

Run: `npx expo start`, open the sessions tab.
Expected: an open session shows `OPEN`; a closed one does not.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/sessions/index.tsx"
git commit -m "feat(sessions): mark open sessions in the list"
```

---

## After the plan

Report to the user, do not do these unprompted:

1. **`0046` needs a human `npx supabase db push --linked`.** It redefines
   `can_manage_session_cost`, which 0045's live RPCs depend on.
2. **The capacity race ships unverified.** No local Postgres. Two concurrent
   `join_open_session` calls for the last slot against a staging project is the
   only real proof.
3. **The open question from the spec is still open:** the preview shows a head
   count, not player names. Changing it is one line in `session_open_preview`
   plus one in the screen, and it discloses member names to everyone a forwarded
   link ever reaches.
