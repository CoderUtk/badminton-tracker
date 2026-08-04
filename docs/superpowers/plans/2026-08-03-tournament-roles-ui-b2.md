# Tournament Roles & UI (B2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tournament joining work — as a player or as a scorer — restructure the tournament screen into Config / Players / Scorers, and assign courts at start.

**Architecture:** Four migrations. Task 1 revives Phase 3's dead approval flow by seeding `tournament_staff`; everything else builds on it. Roles ride in the join link's path. The tournament screen becomes three tabs over one loaded tournament.

**Tech Stack:** TypeScript, Expo SDK 57, expo-router, Supabase (Postgres + RLS + PL/pgSQL), expo-sqlite, Jest.

## Global Constraints

- Read the versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo API code.
- Gate every task on `npx tsc --noEmit && npm test`. Both must pass before commit.
- RPCs are `security definer` with `set search_path = public`.
- Supabase writes must `.select()` and throw on zero rows — a policy-blocked write reports success otherwise.
- Local SQLite schema changes ship as a NEW entry appended to `MIGRATIONS` in `src/db/db.ts`, never an edit to an applied one.
- `listClubs()` returns personal clubs and must keep doing so; `listRealClubs()` is for anything the user sees.
- Do not add a `Co-Authored-By` trailer to commits.
- Do NOT run `npx supabase db push` — the human operator applies migrations.

---

### Task 1: Seed tournament staff — revive the approval flow

**Files:**
- Create: `supabase/migrations/0012_tournament_staff_seed.sql`
- Modify: `src/repos/tournamentStaffRepo.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `is_tournament_admin(p_tournament_id uuid) returns boolean`; `tournaments.created_by`; a `tournament_staff` admin row per tournament.

**Why first:** every gate Phase 3 shipped requires a `tournament_staff` row with `role = 'admin'` (`0007_tournament_live_ops.sql:30,73,86`), and nothing ever inserts one. `approve_tournament_join` and `deny_tournament_join` always raise, and the queue's SELECT policy is always false. Nothing else in B2 is testable until this lands.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0012_tournament_staff_seed.sql`:

```sql
-- Phase 3 gated every approval on a tournament_staff row with role = 'admin',
-- but nothing ever inserted one: approve/deny always raised and the queue
-- policy was always false. This seeds that row and backfills existing rows.

alter table public.tournaments
  add column if not exists created_by uuid references public.profiles (id);

-- Trigger keeps staff seeding atomic with creation. A second client call could
-- fail on its own and leave a tournament nobody can administer.
create or replace function public.seed_tournament_staff()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  insert into public.tournament_staff (tournament_id, profile_id, role)
  values (new.id, new.created_by, 'admin')
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_tournament_created on public.tournaments;
create trigger on_tournament_created
  after insert on public.tournaments
  for each row execute function public.seed_tournament_staff();

-- Backfill: every club admin of the owning club becomes a tournament admin.
-- created_by is unknown for these rows, so club admins are the only honest
-- source. Without this, tournaments made before today keep a dead queue.
insert into public.tournament_staff (tournament_id, profile_id, role)
select t.id, m.profile_id, 'admin'
from public.tournaments t
join public.club_members m on m.club_id = t.club_id and m.role in ('owner', 'admin')
on conflict do nothing;

-- Mirrors is_club_admin. An admin implies scorer rights; there is deliberately
-- no second 'scorer' row per admin, because two rows can disagree.
create or replace function public.is_tournament_admin(p_tournament_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from tournament_staff
    where tournament_id = p_tournament_id and profile_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_tournament_staff(p_tournament_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from tournament_staff
    where tournament_id = p_tournament_id and profile_id = auth.uid()
  );
$$;

-- A tournament admin who is not a club admin must still be able to start.
-- This is 0011's function reproduced with ONE line changed (the authorisation
-- check). Every other guard is byte-identical and must stay that way.
create or replace function public.start_tournament(
  p_tournament_id uuid,
  p_bracket jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
  v_status text;
  v_type text;
  v_entrants int;
  v_players int;
  v_draw int;
begin
  select club_id, status, match_type into v_club, v_status, v_type
  from tournaments where id = p_tournament_id;

  if v_club is null then
    raise exception 'Tournament not found';
  end if;
  -- CHANGED from 0011: a tournament admin who is not a club admin may start.
  if not (is_club_admin(v_club) or is_tournament_admin(p_tournament_id)) then
    raise exception 'Only an admin can start this tournament';
  end if;
  -- Blocks a second start from rebuilding a live bracket over played results.
  if v_status <> 'draft' then
    raise exception 'This tournament has already started';
  end if;
  -- Legacy drafts created before the two-phase split already carry a full
  -- bracket. Starting one again would insert a second, overlapping set of
  -- rows (no unique constraint on tournament_id/round/idx) and corrupt
  -- finish_bracket_match's advance update.
  if exists (select 1 from bracket_matches where tournament_id = p_tournament_id) then
    raise exception 'This tournament already has a bracket';
  end if;

  select count(*) into v_entrants from tournament_entrants
  where tournament_id = p_tournament_id;

  v_players := v_entrants * (case when v_type = 'doubles' then 2 else 1 end);
  if v_type = 'doubles' and v_players < 6 then
    raise exception 'Add at least 6 players to start';
  end if;
  if v_type <> 'doubles' and v_players < 4 then
    raise exception 'Add at least 4 players to start';
  end if;
  if v_entrants > 64 then
    raise exception 'A tournament holds at most 64 entrants';
  end if;

  v_draw := 4;
  while v_draw < v_entrants loop v_draw := v_draw * 2; end loop;

  -- Validate the client payload rather than trusting it.
  if jsonb_array_length(p_bracket) <> v_draw - 1 then
    raise exception 'Bracket does not match the draw size';
  end if;
  -- Every non-null entrant id in the payload — entrant_a, entrant_b, and
  -- winner_entrant (legitimately set on byes buildBracket already resolved)
  -- — must belong to this tournament.
  if exists (
    select 1
    from jsonb_array_elements(p_bracket) e
    cross join lateral (values
      (e->>'entrant_a'), (e->>'entrant_b'), (e->>'winner_entrant')
    ) as ids(entrant_id)
    where ids.entrant_id is not null
      and ids.entrant_id::uuid not in (
        select id from tournament_entrants where tournament_id = p_tournament_id)
  ) then
    raise exception 'Bracket references entrants from another tournament';
  end if;

  insert into bracket_matches (id, tournament_id, round, idx, match_id, entrant_a, entrant_b, winner_entrant, court, scored_by)
  select
    (e->>'id')::uuid, p_tournament_id, (e->>'round')::int, (e->>'idx')::int,
    null, (e->>'entrant_a')::uuid, (e->>'entrant_b')::uuid,
    (e->>'winner_entrant')::uuid, null, null
  from jsonb_array_elements(p_bracket) e;

  update tournaments set size = v_draw, status = 'live' where id = p_tournament_id;
end;
$$;
```

- [ ] **Step 2: Expose staff membership to the client**

In `src/repos/tournamentStaffRepo.ts`, add:

```ts
export type StaffRole = "admin" | "scorer";

/** The signed-in user's staff role for this tournament, or null if not staff. */
export async function myStaffRole(tournamentId: string): Promise<StaffRole | null> {
  if (!supabase) return null;
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("tournament_staff")
    .select("role")
    .eq("tournament_id", tournamentId)
    .eq("profile_id", uid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.role as StaffRole) ?? null;
}
```

- [ ] **Step 3: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add supabase/migrations/0012_tournament_staff_seed.sql src/repos/tournamentStaffRepo.ts
git commit -m "fix(tournaments): seed staff admin so approvals work at all"
```

- [ ] **Step 4: Verify after the operator applies it**

On a tournament created BEFORE this migration, the pending-requests screen must load instead of rendering empty. That is the case this task exists to fix.

---

### Task 2: Player and scorer invite links

**Files:**
- Create: `supabase/migrations/0013_join_request_roles.sql`
- Modify: `src/lib/joinLink.ts`, `tests/joinLink.test.ts`
- Modify: `src/repos/tournamentStaffRepo.ts`
- Modify: `app/join/tournament/[id].tsx`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `is_tournament_admin` from Task 1.
- Produces: `buildTournamentScorerJoinPath(id): string`; `parseJoinTarget` returns `{ kind, id, role }`; `requestJoinTournament(id, role)`.

- [ ] **Step 1: Write the failing parser tests**

Append to `tests/joinLink.test.ts`:

```ts
test("a tournament link without a role segment means player", () => {
  expect(parseJoinTarget("badminton://join/tournament/t-1"))
    .toEqual({ kind: "tournament", id: "t-1", role: "player" });
});

test("parses the scorer role segment", () => {
  expect(parseJoinTarget("badminton://join/tournament/t-1/scorer"))
    .toEqual({ kind: "tournament", id: "t-1", role: "scorer" });
  expect(parseJoinTarget("https://join.example.com/tournament/t-1/scorer"))
    .toEqual({ kind: "tournament", id: "t-1", role: "scorer" });
});

test("an unknown trailing segment is not a role", () => {
  expect(parseJoinTarget("badminton://join/tournament/t-1/bogus"))
    .toEqual({ kind: "tournament", id: "t-1", role: "player" });
});

test("club links carry the player role", () => {
  expect(parseJoinTarget("badminton://join/club/abc-123"))
    .toEqual({ kind: "club", id: "abc-123", role: "player" });
});

test("builds a scorer path", () => {
  expect(buildTournamentScorerJoinPath("t-1")).toBe("join/tournament/t-1/scorer");
});
```

Update the existing `parses a tournament join link` test to expect `role: "player"`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/joinLink.test.ts`
Expected: FAIL — `role` missing from results, `buildTournamentScorerJoinPath` undefined.

- [ ] **Step 3: Implement the parser change**

In `src/lib/joinLink.ts`:

```ts
export function buildTournamentScorerJoinPath(tournamentId: string): string {
  return `join/tournament/${tournamentId}/scorer`;
}

export type JoinRole = "player" | "scorer";
```

Change `parseJoinTarget`'s return type to
`{ kind: "club" | "tournament"; id: string; role: JoinRole } | null`, and where
it currently returns the match, read the segment after the id:

```ts
const role: JoinRole = parts[at + 3] === "scorer" ? "scorer" : "player";
return { kind, id, role };
```

The role MUST be a path segment. `parseJoinTarget` strips the query string on
its first line (`url.split("?")[0]`), so a `?role=scorer` would be silently
discarded and every scorer link would quietly invite a player.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/0013_join_request_roles.sql`:

```sql
-- Requests carry the role the link invited. Defaulting to 'player' keeps
-- in-flight requests created before this migration valid.
alter table public.tournament_join_requests
  add column if not exists role text not null default 'player'
  check (role in ('player', 'scorer'));

create or replace function public.request_tournament_join(
  p_tournament_id uuid,
  p_role text default 'player'
) returns text language plpgsql security definer set search_path = public as $$
declare v_status text; v_tstatus text;
begin
  select status into v_tstatus from tournaments where id = p_tournament_id;
  if v_tstatus is null then raise exception 'Tournament not found'; end if;

  if p_role not in ('player', 'scorer') then
    raise exception 'Unknown role';
  end if;

  -- A bracket is sized at start, so a late entrant has nowhere to go.
  -- Scorers do not affect the draw and may join at any time.
  if p_role = 'player' and v_tstatus <> 'draft' then
    raise exception 'This tournament has already started';
  end if;

  if p_role = 'scorer' and exists (
    select 1 from tournament_staff
    where tournament_id = p_tournament_id and profile_id = auth.uid()
  ) then
    return 'member';
  end if;

  if p_role = 'player' and exists (
    select 1 from tournament_entrants e
    join club_players p on e.club_player_id = p.id
    where e.tournament_id = p_tournament_id and p.profile_id = auth.uid()
  ) then
    return 'member';
  end if;

  select status into v_status from tournament_join_requests
  where tournament_id = p_tournament_id and profile_id = auth.uid() and role = p_role
  limit 1;
  if v_status = 'denied' then return 'denied'; end if;
  if v_status is null then
    insert into tournament_join_requests (tournament_id, profile_id, role)
    values (p_tournament_id, auth.uid(), p_role);
  end if;
  return 'pending';
end $$;

-- Approving branches on the request's role: a player becomes an entrant, a
-- scorer becomes staff. p_club_player_id is ignored for scorer requests.
create or replace function public.approve_tournament_join(
  p_request_id uuid,
  p_club_player_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_tourney_id uuid; v_role text; v_profile uuid; v_club uuid; v_player uuid;
begin
  select tournament_id, role, profile_id into v_tourney_id, v_role, v_profile
  from tournament_join_requests where id = p_request_id and status = 'pending';
  if v_tourney_id is null then raise exception 'Request not found or decided'; end if;
  if not is_tournament_admin(v_tourney_id) then
    raise exception 'Only admin can approve';
  end if;

  if v_role = 'scorer' then
    insert into tournament_staff (tournament_id, profile_id, role)
    values (v_tourney_id, v_profile, 'scorer') on conflict do nothing;
  else
    v_player := p_club_player_id;
    -- Entrants reference club_players, so a requester who is not yet one needs
    -- a row. Creating it here spares the admin pre-registering everybody.
    if v_player is null then
      select t.club_id into v_club from tournaments t where t.id = v_tourney_id;
      select id into v_player from club_players
      where club_id = v_club and profile_id = v_profile limit 1;
      if v_player is null then
        insert into club_players (club_id, profile_id, name)
        select v_club, v_profile, coalesce(nullif(pr.display_name, ''), 'Player')
        from profiles pr where pr.id = v_profile
        returning id into v_player;
      end if;
    end if;
    insert into tournament_entrants (tournament_id, club_player_id)
    values (v_tourney_id, v_player) on conflict do nothing;
  end if;

  update tournament_join_requests set status = 'approved', decided_at = now()
  where id = p_request_id;
end $$;

create or replace function public.deny_tournament_join(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tourney_id uuid;
begin
  select tournament_id into v_tourney_id from tournament_join_requests
  where id = p_request_id and status = 'pending';
  if v_tourney_id is null then raise exception 'Request not found or decided'; end if;
  if not is_tournament_admin(v_tourney_id) then
    raise exception 'Only admin can deny';
  end if;
  update tournament_join_requests set status = 'denied', decided_at = now()
  where id = p_request_id;
end $$;
```

- [ ] **Step 5: Thread the role through the client**

In `src/repos/tournamentStaffRepo.ts`, change `requestJoinTournament` to take a
role and pass `p_role`; add `role` to `TournamentJoinRequest` and select it in
`listPendingTournamentRequests`. `approveTournamentRequest`'s `clubPlayerId`
becomes optional (`string | null`), defaulting to null.

In `app/join/tournament/[id].tsx`, read the role from the route and pass it
through. The route becomes `app/join/tournament/[id]/[[...role]].tsx` OR keep
`[id].tsx` and add `app/join/tournament/[id]/scorer.tsx` that renders the same
component with `role="scorer"` — pick the second; it is one small file and
avoids optional-catch-all routing subtleties. Copy is role-aware: "Request to
join as a scorer" versus "Request to join".

In `app/_layout.tsx`, register the new screen alongside the existing
`join/tournament/[id]`, and confirm `Gate`'s pending-link replay
(`router.replace(\`/join/${target.kind}/${target.id}\`)`) preserves the role
segment — it currently rebuilds the path from `kind` and `id` only, dropping
`/scorer`. Fix it to append the role when it is `"scorer"`. Do the same in
`app/welcome.tsx`, which rebuilds the same path.

- [ ] **Step 6: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add supabase/migrations/0013_join_request_roles.sql src/lib/joinLink.ts tests/joinLink.test.ts src/repos/tournamentStaffRepo.ts "app/join/tournament" app/_layout.tsx app/welcome.tsx
git commit -m "feat(tournaments): player and scorer invite links"
```

---

### Task 3: Editable entrants and doubles pairing

**Files:**
- Modify: `src/repos/tournamentRepo.ts`
- Test: `tests/tournamentEntrants.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces: `addGuestEntrant(tournamentId, clubId, name)`, `removeEntrant(entrantId)`, `pairEntrants(entrantId, partnerClubPlayerId)`, `unpairEntrant(entrantId)`.

B1 fixed entrants at creation, so a too-small tournament was unstartable with no in-app escape. These are the data layer for the Players tab.

- [ ] **Step 1: Implement**

Add to `src/repos/tournamentRepo.ts`:

```ts
/** Remove an entrant from a draft. Refused once a bracket exists. */
export async function removeEntrant(entrantId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to edit entrants");
  const { data, error } = await supabase
    .from("tournament_entrants").delete().eq("id", entrantId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not remove that player");
}

/** Set or clear an entrant's doubles partner. */
export async function pairEntrants(
  entrantId: string, partnerClubPlayerId: string | null,
): Promise<void> {
  if (!supabase) throw new Error("Sign in to edit entrants");
  const { data, error } = await supabase
    .from("tournament_entrants")
    .update({ club_player_id_2: partnerClubPlayerId })
    .eq("id", entrantId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not update that pair");
}
```

```ts
/**
 * Add a non-registered player to the club and enter them in the tournament.
 * addGuestPlayer returns void, so the new row is found by name in the refreshed
 * roster — the same approach the create screen already uses.
 */
export async function addGuestEntrant(
  tournamentId: string, clubId: string, name: string,
): Promise<void> {
  if (!supabase) throw new Error("Sign in to add players");
  const trimmed = name.trim();
  await addGuestPlayer(clubId, trimmed);
  const added = (await listPlayers(clubId)).find((p) => p.name === trimmed);
  if (!added) throw new Error("Could not add that player");

  const { data: seeds } = await supabase
    .from("tournament_entrants").select("seed")
    .eq("tournament_id", tournamentId).order("seed", { ascending: false }).limit(1);
  const nextSeed = ((seeds?.[0]?.seed as number) ?? 0) + 1;

  const { data, error } = await supabase
    .from("tournament_entrants")
    .insert({ tournament_id: tournamentId, club_player_id: added.id, seed: nextSeed })
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not add that player");
}
```

Import `addGuestPlayer` and `listPlayers` from `./clubRepo` — `listClubs` is
already imported there, so this adds no new module dependency.

- [ ] **Step 2: Write tests**

`tests/tournamentEntrants.test.ts` follows the mocking pattern in
`tests/tournamentList.test.ts` — mock `../src/lib/supabase`, `../src/db/db`,
`../src/repos/matchRepo`, and `../src/repos/clubRepo`. Assert that each of
`removeEntrant` and `pairEntrants` THROWS when the write returns zero rows,
since a policy-blocked write otherwise reports success. That contract is the
part worth testing.

- [ ] **Step 3: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add src/repos/tournamentRepo.ts tests/tournamentEntrants.test.ts
git commit -m "feat(tournaments): add, remove and pair entrants in a draft"
```

---

### Task 4: Config / Players / Scorers subtabs

**Files:**
- Modify: `app/(app)/tournaments/[id].tsx`
- Create: `src/components/TournamentConfigTab.tsx`, `src/components/TournamentPlayersTab.tsx`, `src/components/TournamentScorersTab.tsx`
- Delete: `app/(app)/tournaments/requests/[tournamentId].tsx`
- Modify: `app/(app)/tournaments/_layout.tsx`

**Interfaces:**
- Consumes: `myStaffRole` (Task 1); `requestJoinTournament`, `listPendingTournamentRequests`, `approveTournamentRequest`, `denyTournamentRequest`, `getTournamentStaff` (Task 2); `removeEntrant`, `pairEntrants`, `addGuestEntrant` (Task 3); `drawSizeFor`, `startBlocker`.
- Produces: nothing consumed later.

Three tabs over ONE loaded tournament — local state, not three routes that each refetch. `[id].tsx` keeps ownership of loading and passes data down; the tab components are presentational plus their own actions.

- [ ] **Step 1: Split the screen**

`[id].tsx` gains `const [tab, setTab] = useState<"config" | "players" | "scorers">("config")` and a segmented control. While `status === "live"` the bracket renders above the tabs and Config/Players become read-only.

Each tab component takes what it needs as props and an `onChanged: () => void` callback that calls the screen's existing `reload`.

- [ ] **Step 2: Config tab**

Name (admin-editable, reusing `updateTournament`), the courts stepper (Task 5), both share links via `shareJoinLink` with `buildTournamentJoinPath` and `buildTournamentScorerJoinPath`, and the Start button with `startBlocker`'s reason. Non-admins see a read-only summary and the player share link only.

- [ ] **Step 3: Players tab**

Entrant list with `${entrants.length} entrants → ${drawSizeFor(entrants.length)} draw, ${drawSizeFor(entrants.length) - entrants.length} byes`; add-guest row; remove per entrant; for doubles, a partner picker per entrant. Pending requests whose `role === "player"` render inline with Approve/Deny.

- [ ] **Step 4: Scorers tab**

`getTournamentStaff` list showing each person's role, the scorer share link, and pending requests whose `role === "scorer"` with Approve/Deny.

- [ ] **Step 5: Retire the standalone requests screen**

Delete `app/(app)/tournaments/requests/[tournamentId].tsx`, remove its `Stack.Screen` from `_layout.tsx`, and remove the "Pending requests" button from `[id].tsx` — the queue now lives split across the two tabs.

- [ ] **Step 6: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add -A "app/(app)/tournaments" src/components
git commit -m "feat(tournaments): config, players and scorers subtabs"
```

---

### Task 5: Courts stepper and court assignment

**Files:**
- Create: `supabase/migrations/0014_court_assignment.sql`
- Modify: `src/tournament/draw.ts`, `tests/draw.test.ts`
- Modify: `src/repos/tournamentRepo.ts`
- Modify: `src/components/TournamentConfigTab.tsx`

**Interfaces:**
- Consumes: `TournamentConfigTab` from Task 4.
- Produces: `courtForIndex(index: number, courts: number): string`.

- [ ] **Step 1: Write the failing test**

Append to `tests/draw.test.ts`:

```ts
import { courtForIndex } from "../src/tournament/draw";

test("round-one matches cycle through the available courts", () => {
  expect([0, 1, 2, 3, 4].map((i) => courtForIndex(i, 3))).toEqual(["1", "2", "3", "1", "2"]);
  expect([0, 1, 2].map((i) => courtForIndex(i, 1))).toEqual(["1", "1", "1"]);
});
```

Cycling rather than random sampling is deliberate: random assignment
double-books a court within the same round routinely, which is the one thing
court assignment exists to prevent.

- [ ] **Step 2: Implement**

In `src/tournament/draw.ts`:

```ts
/** Court label for the Nth round-one match, cycling 1..courts. */
export function courtForIndex(index: number, courts: number): string {
  return String((index % Math.max(1, courts)) + 1);
}
```

- [ ] **Step 3: Assign courts when the bracket is built**

In `startTournament` (`src/repos/tournamentRepo.ts`), after `buildBracket`, set
`court` on round-1 cells only:

```ts
const withCourts = bracket.map((m) =>
  m.round === 1 ? { ...m, court: courtForIndex(m.index, tournament.courts) } : m,
);
```

Pass `withCourts` to the RPC. Later rounds stay null and are assigned from Live
Ops once their feeders resolve.

`startTournament` must now read `tournament` from `getTournament` for `courts` —
B1 removed that binding, so restore it.

- [ ] **Step 4: Lock the court once a match starts**

Create `supabase/migrations/0014_court_assignment.sql`:

```sql
-- A court may be changed until the match starts. Once bracket_matches.match_id
-- is set, players are already on court and a change strands them.
create or replace function public.assign_bracket_court(
  p_bracket_match_id uuid,
  p_court text
) returns void language plpgsql security definer set search_path = public as $$
declare v_tourney uuid; v_match uuid;
begin
  select tournament_id, match_id into v_tourney, v_match
  from bracket_matches where id = p_bracket_match_id;
  if v_tourney is null then raise exception 'Match not found'; end if;
  if not is_tournament_staff(v_tourney) then
    raise exception 'Only staff can assign a court';
  end if;
  if v_match is not null then
    raise exception 'This match has already started';
  end if;
  update bracket_matches set court = p_court where id = p_bracket_match_id;
end $$;
```

Change `assignBracketMatchCourt` in `src/repos/tournamentRepo.ts` to call this
RPC instead of updating the table directly, so the guard cannot be bypassed.

- [ ] **Step 5: Replace the courts control with a stepper**

In `TournamentConfigTab`, replace the `COURTS` segmented control with a stepper:
minus / value / plus, clamped to 1..10, writing through `updateTournament`.
Values above 10 are refused, not clamped silently. Remove the now-unused
`COURTS` constant from `app/(app)/tournaments/new.tsx` and use the same stepper
there.

- [ ] **Step 6: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add supabase/migrations/0014_court_assignment.sql src/tournament/draw.ts tests/draw.test.ts src/repos/tournamentRepo.ts src/components/TournamentConfigTab.tsx "app/(app)/tournaments/new.tsx"
git commit -m "feat(tournaments): court stepper and assignment at start"
```

---

## Final verification

- [ ] `npx tsc --noEmit && npm test` — green
- [ ] `npx supabase db push` — `0012`, `0013`, `0014` applied
- [ ] On a tournament created BEFORE `0012`, the requests queue loads instead of rendering empty
- [ ] Player link → second account requests → admin approves under Players → entrant appears
- [ ] Scorer link → third account requests → admin approves under Scorers → staff row, no entrant
- [ ] A player request sent after the tournament started is refused
- [ ] A doubles tournament with an unpaired player refuses to start, naming the reason
- [ ] Starting with 3 courts spreads round-1 across courts 1, 2, 3, 1, …
- [ ] A scorer claims a match, changes its court, starts it — and can no longer change the court
- [ ] A new user arriving via a scorer link lands on the scorer join screen after signing up, not the player one
