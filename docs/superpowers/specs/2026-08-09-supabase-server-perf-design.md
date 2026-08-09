# Supabase Server Performance — design

**Date:** 2026-08-09
**Status:** Design approved (planning only; no implementation yet)

P4 of four performance sub-projects. Server-side query cost: unindexed foreign key
columns, and RLS policies that call a `security definer` function once per row.

No client changes. Independent of P1-P3 and can ship in any order, though it compounds
with P1 — a cheaper `tournament_full_view` matters more once it is the only tournament
query left.

## 1. Commit the FK index migration (already applied)

**Corrected 2026-08-09.** An earlier draft of this spec claimed `0036_missing_fk_indexes.sql`
was unapplied. It is not. `npx supabase migration list` shows local and remote both at
0036, and `db push --dry-run` reports "Remote database is up to date". The file is
untracked *in git*, but the Supabase CLI reads `supabase/migrations/` from disk, so
git status never gated the push — it was applied in a prior session.

**The indexes are live in production.** The only outstanding work in this section is
committing the file so the repository matches the database.

For reference, the migration adds:

```sql
create index if not exists matches_club_id on public.matches (club_id);
create index if not exists matches_created_by on public.matches (created_by);
create index if not exists sessions_club_id on public.sessions (club_id);
create index if not exists tournaments_club_id on public.tournaments (club_id);
create index if not exists bracket_matches_tournament_id on public.bracket_matches (tournament_id);
create index if not exists tournament_entrants_tournament_id on public.tournament_entrants (tournament_id);
```

Its own comment states the rationale correctly: Postgres indexes primary keys
automatically but not foreign keys, and every RLS policy in this schema filters on
exactly these columns.

**Action:** `git add supabase/migrations/0036_missing_fk_indexes.sql` and commit. Nothing
to push.

**Consequence for the rest of this spec:** the "before" state for any measurement in §2
and §3 is *with* these indexes already in place. Any remaining slowness is therefore not
attributable to unindexed foreign keys, which removes the most likely explanation and
makes §2 correspondingly less likely to be worth its risk.

**Process note worth carrying forward.** A migration reached production while its file
was untracked in git. Nothing in the tooling prevents that, because the CLI reads the
filesystem and git does not gate it. Worth a habit of `git status supabase/migrations/`
before any `db push`.

## 2. RLS policy shape

This is where I initially proposed the wrong fix, and the source corrected it.

`is_club_member` (`supabase/migrations/0001_init.sql:100`) is already well-formed:

```sql
create or replace function public.is_club_member(p_club_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from club_members
    where club_id = p_club_id and profile_id = auth.uid()
  );
$$;
```

It is `stable`, `security definer`, has a pinned `search_path`, and is plain SQL so
Postgres can inline it. There is nothing wrong with the function.

**The standard Supabase optimisation does not apply here.** The well-known advice is to
wrap RLS subexpressions in a scalar subquery — `(select auth.uid())` — so the planner
evaluates them once as an InitPlan rather than per row. That works because `auth.uid()`
is row-independent.

`is_club_member(club_id)` takes **the row's own column** as its argument. It genuinely
varies per row, so `(select is_club_member(club_id))` would not hoist anything. Applying
that pattern here would be cargo-culting and would produce no measurable change.

### The fix that does apply

Rewrite the hot policies to replace a per-row function call with a single set membership
test the planner can hash once:

```sql
-- Instead of: using (is_club_member(club_id))
using (
  club_id in (
    select cm.club_id from public.club_members cm
    where cm.profile_id = (select auth.uid())
  )
)
```

The subquery is row-independent — it depends only on `auth.uid()` — so the planner
evaluates it once per statement and probes it as a hashed set. This turns N function
invocations into one scan of `club_members` for the current user, which is a handful of
rows.

**Scope: measure before rewriting.** `is_club_member` appears in 27 policies across 7
migration files. Rewriting all of them is a large, risky diff against working security
rules, for a benefit that is currently unquantified.

Restrict this section to the policies on the highest-row-count tables, which are the only
places per-row cost can add up:

- `matches` (one row per game — by far the fastest-growing table)
- `match_events` (one row per point — the largest table in the schema)
- `bracket_matches`
- `club_players`

Everything else keeps `is_club_member(...)` unchanged. A policy rewrite that is not
justified by a measurement does not ship.

**Correctness requirement.** Each rewritten policy must be provably equivalent to the
one it replaces. `is_club_member` is `security definer` — it reads `club_members`
bypassing that table's own RLS. An inlined subquery in a policy runs as the **calling
user**, subject to `club_members`' RLS. Migration `0001_init.sql:138` grants members
select on `club_members` via `is_club_member(club_id)`, which is itself recursive
through the definer function.

This is the real risk in this section: an inlined rewrite can silently return fewer rows
than the function did, turning a performance change into an access-control change that
looks like data loss. Two consequences for the plan:

1. Each rewrite is verified by comparing row counts for the same user before and after,
   for a member, a non-member, and an admin.
2. If any policy cannot be shown equivalent, it keeps the function call. Being slow is
   strictly better than being wrong.

## 3. Measurement first

Neither section should be planned in detail before there are numbers. The measurement
step is part of the work, not a precondition for starting it:

- `explain (analyze, buffers)` on the queries the client actually issues, as an
  authenticated member — the `matches` select by `club_id`, the `sessions` select by
  `club_id in (...)` (`sessionRepo.ts:75`), and `bracket_matches` by `tournament_id`.
- Supabase dashboard slow-query log, and `pg_stat_statements` ordered by total time, to
  confirm which queries actually dominate rather than which ones look suspicious.
- Row counts per table. If `matches` holds a few thousand rows, §2 is premature
  optimisation and should be deferred outright with the numbers recorded.

**Expected outcome, stated honestly:** §1 is worth doing regardless — the migration is
already written and unindexed FKs under RLS are a real, well-understood problem that
grows with usage. §2 may well turn out not to be worth its risk at this data volume, and
the measurement exists to make that call on evidence rather than instinct.

## 4. Realtime publication is not in source control

Not a performance issue, but discovered while investigating P1 and belonging here:

No migration in this repo adds any table to the `supabase_realtime` publication. The app
has three working realtime features (`src/stores/matchStore.ts`, `app/(app)/clubs/[id]/live.tsx`,
`app/(app)/watch/[matchId].tsx`), so the publication was configured by hand in the
Supabase dashboard.

Consequence: the production database cannot be rebuilt from this repository. A fresh
project created from these migrations would have silently non-functional realtime.

**Fix:** a migration that records the current state, written to be idempotent:

```sql
alter publication supabase_realtime add table public.match_events;
-- etc., for whatever is actually enabled today
```

**This requires reading the current publication membership from production first** —
guessing which tables are in it and writing a migration from the guess would either fail
or, worse, silently add a table that was deliberately excluded:

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```

## States and failure modes

| Situation | Behaviour |
|---|---|
| Index already exists in production | `if not exists` makes it a no-op. |
| `create index` on a large table | Brief write lock. Switch to `concurrently` (own migration file, no transaction) if row counts warrant. |
| Rewritten policy returns fewer rows | Caught by the before/after row-count comparison. That policy reverts to the function call. |
| Rewritten policy returns *more* rows | A security regression. Same comparison catches it; same revert. |
| Publication migration adds a table already present | `add table` errors if the table is already a member — the migration must check `pg_publication_tables` first, or use a `do $$ ... $$` guard. |

## Verification

- Every index in `0036` exists in production (`select indexname from pg_indexes where
  schemaname = 'public'`). Confirms the applied-migration record matches reality.
- `explain (analyze)` on the four client queries shows index scans, not sequential scans,
  with timings recorded in the plan document. Note this is a *verification* that the
  already-applied indexes are being used, not a before/after comparison — the "before"
  state no longer exists.
- For each rewritten policy: identical row counts as a member, a non-member, and an admin,
  before and after.
- Existing test suite passes — none of it covers RLS, which is itself worth noting as a
  gap rather than treating the green suite as evidence of correctness here.
- Realtime features still work after the publication migration: live match watch, club
  live screen, scoring sync.

## Out of scope

- Connection pooling / pgBouncer configuration. No evidence of connection pressure.
- Read replicas, materialised views, partitioning. Orders of magnitude beyond this data
  volume.
- Redis or any external cache. Considered and rejected in the parent brainstorm: nothing
  here is compute-bound, and SQLite already serves as the client cache tier.
- Anything client-side — that is P1-P3.
