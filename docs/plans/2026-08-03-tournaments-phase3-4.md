# Tournaments Phase 3 and Phase 4 Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement tournament join requests (approval by link/ID) and live ops (admin/scorer roles, court assignment, real-time live scoring).

**Architecture:** We will create `tournament_join_requests` and `tournament_staff` tables via a new Supabase migration. `membershipRepo` and `tournamentStaffRepo` will handle the business logic and RPCs. We will add a join landing screen for tournaments, a pending requests queue screen for admins, and a live ops dashboard for managing scorers and courts.

**Tech Stack:** Expo SDK 54, expo-router v6, Supabase (Postgres + RLS + RPCs), Jest.

---

### Task 1: Migration for Tournament Join Requests & Staff

**Files:**
- Create: `supabase/migrations/0005_tournament_live_ops.sql`

**Step 1: Write the migration**

```sql
create table if not exists public.tournament_join_requests (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (tournament_id, profile_id)
);

create table if not exists public.tournament_staff (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'scorer')),
  created_at timestamptz not null default now(),
  unique (tournament_id, profile_id)
);

alter table public.tournament_join_requests enable row level security;
alter table public.tournament_staff enable row level security;

-- Admin and Staff RLS policies
create policy "admins read tournament queue" on public.tournament_join_requests
  for select to authenticated using (exists(select 1 from tournament_staff where tournament_id = tournament_join_requests.tournament_id and profile_id = auth.uid() and role = 'admin'));

create policy "requester reads own request" on public.tournament_join_requests
  for select to authenticated using (profile_id = auth.uid());

create policy "staff reads staff" on public.tournament_staff
  for select to authenticated using (true); -- Publicly readable so everyone knows who the admins/scorers are

-- RPCs for tournament join requests (similar to club join requests)
create or replace function public.tournament_preview(p_tournament_id uuid)
returns table (id uuid, name text, max_entrants int, entrant_count int)
language sql security definer stable set search_path = public as $$
  select t.id, t.name, t.size as max_entrants, (select count(*)::int from tournament_entrants e where e.tournament_id = t.id)
  from tournaments t where t.id = p_tournament_id;
$$;

create or replace function public.request_tournament_join(p_tournament_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not exists (select 1 from tournaments where id = p_tournament_id) then
    raise exception 'Tournament not found';
  end if;
  select status into v_status
  from tournament_join_requests where tournament_id = p_tournament_id and profile_id = auth.uid();
  if v_status = 'denied' then return 'denied'; end if;
  if v_status is null then
    insert into tournament_join_requests (tournament_id, profile_id) values (p_tournament_id, auth.uid());
  end if;
  return 'pending';
end $$;

-- Extend schema to include match locking (court and scored_by)
alter table public.bracket_matches 
add column if not exists court text,
add column if not exists scored_by uuid references public.profiles(id);
```

**Step 2: Commit**
```bash
git add supabase/migrations/0005_tournament_live_ops.sql
git commit -m "feat(db): migration for tournament join requests and staff roles"
```

---

### Task 2: Tournament Request Repo and Linking

**Files:**
- Modify: `src/lib/joinLink.ts`, `src/repos/membershipRepo.ts`
- Create: `src/repos/tournamentStaffRepo.ts`

**Step 1: Add Tournament links in `joinLink.ts`**
Update `buildTournamentJoinPath` and `parseJoinTarget` to support tournament links.

**Step 2: Add Tournament Repo Logic**
Add `getTournamentPreview`, `requestJoinTournament`, `listPendingTournamentRequests`, `approveTournamentRequest`, `denyTournamentRequest` wrapping the new RPCs.

**Step 3: Test and Commit**
```bash
git add src/lib/joinLink.ts src/repos/membershipRepo.ts src/repos/tournamentStaffRepo.ts
git commit -m "feat(join): repo methods for tournament join requests and staff"
```

---

### Task 3: Tournament Join Landing Screen

**Files:**
- Create: `app/join/tournament/[id].tsx`
- Modify: `app/_layout.tsx`, `app/(auth)/sign-in.tsx`

**Step 1: Build the UI**
Create the tournament invite landing screen showing tournament name, size, and request to join button.

**Step 2: Update router Gate**
Modify `app/_layout.tsx` to preserve `join/tournament/[id]` across sign in, similar to club links.

**Step 3: Commit**
```bash
git add app/join/tournament/[id].tsx app/_layout.tsx app/(auth)/sign-in.tsx
git commit -m "feat(join): tournament join landing screen and routing"
```

---

### Task 4: Tournament Admin Requests Queue

**Files:**
- Create: `app/(app)/tournaments/requests/[tournamentId].tsx`
- Modify: `app/(app)/tournaments/[id].tsx`

**Step 1: Requests Screen**
Build the flatlist showing pending requests with approve/deny buttons.

**Step 2: Update Tournament Details UI**
Add the "Pending requests" entry button in the tournament settings/details screen for admins.

**Step 3: Commit**
```bash
git add app/join/tournament/[id].tsx app/(app)/tournaments/requests/[tournamentId].tsx app/(app)/tournaments/[id].tsx
git commit -m "feat(admin): tournament requests queue screen"
```

---

### Task 5: Live Ops Admin Dashboard (Staff & Courts)

**Files:**
- Create: `app/(app)/tournaments/ops/[tournamentId].tsx`
- Modify: `src/repos/tournamentRepo.ts`

**Step 1: Live Ops Dashboard**
Display courts grid, assign scorers to matches, and show live scores via `matchStore`.

**Step 2: Court Assignment Logic**
Add repo functions to lock a match to a scorer (`scored_by`) and assign a court (`court`).

**Step 3: Commit**
```bash
git add app/join/tournament/[id].tsx app/(app)/tournaments/ops/[tournamentId].tsx src/repos/tournamentRepo.ts
git commit -m "feat(liveops): tournament live ops admin dashboard"
```
