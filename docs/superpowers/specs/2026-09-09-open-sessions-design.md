# Open Sessions — Join a Club Night by Link

**Date:** 2026-09-09

## Problem

Sessions are club-gated. Planning a night means the organiser marks people in from
the club roster, and the only way to involve someone outside the club is to add
them to it first. The common real case — *"we're two short for tonight, here's
the link"* dropped into a WhatsApp group — has no path through the app at all.

A competitor scan (Play Store, September 2026) found this is the one feature the
adjacent apps have that CourtSide does not. `com.courtside.ae` ships "create a
game and invite other players"; Playo and Playtomic are built around it. Their
version is coupled to court booking, which CourtSide does not do and is not
adding. The transferable part is only the open game itself.

## Non-goals

- Court booking, payments, venue discovery. Marketplace features with a supply
  side the app does not have.
- An approval queue. The link is the access grant, matching the tournament
  spectator precedent (0017) rather than the club join-request flow (0004/0027).
- Promoting a one-night joiner into a real club member. `add_friend_to_club`
  (0033) already covers this and can be wired to a button later; it does not
  change the access design below.
- Notifying the organiser when someone joins.

## Decisions taken

Three forks were settled before design:

1. **Who can claim a slot** — any signed-in CourtSide user with the link.
   Joining creates a `club_players` row, because `attendance.club_player_id`
   already points at that table; a session-only identity would need a second
   path through attendance, matchmaking and the cost split.
2. **What they get access to** — that one session, nothing else. A
   `club_players` row is *not* a `club_members` row, so `is_club_member()` stays
   false and every existing club policy keeps them out.
3. **Capacity** — an optional maximum the organiser sets. Blank means unlimited.

## 1. Schema — `0046_open_sessions.sql`

```sql
alter table public.sessions
  add column open_join  boolean not null default false,
  add column max_players int check (max_players is null or max_players between 1 and 100);
```

Two columns, no new table, no token column. The session id is the link, the same
way club and tournament ids already are. Revocation is `open_join = false`, which
invalidates every copy of the link at once — strictly better than rotating a
token, which only invalidates the copies you know about.

`open_join` defaults false. Existing sessions are unaffected and nothing becomes
reachable without the organiser opting in.

### The organiser gate

"Organiser" throughout this spec means **the session creator or a club admin** —
never a plain member.

The `sessions` table's UPDATE policy is admin-only (`is_club_admin`, 0001), so a
creator who is not an admin cannot flip their own session open by writing the
column directly. This is the same wall 0045 hit with the cost columns, and it
takes the same answer: a security-definer RPC.

0045 already defined that gate as `can_manage_session_cost(uuid)`. Rather than
add a second, near-identical predicate, 0046 renames the concept:

```sql
create or replace function public.can_manage_session(p_session_id uuid) …
-- creator OR club admin; body lifted verbatim from can_manage_session_cost
create or replace function public.can_manage_session_cost(p_session_id uuid) …
-- now a thin wrapper over can_manage_session, kept so 0045's RPCs still resolve
```

One predicate, one place to change who counts as an organiser. `set_session_cost`
and `set_attendance_settled` keep working untouched.

### `set_session_open_join(p_session_id uuid, p_open boolean, p_max_players int)`

Security definer, gated on `can_manage_session`. Validates `max_players` against
the same 1–100 bound as the column check, so an out-of-range value returns a
readable message instead of a raw constraint violation — the pattern 0045 used.

Setting `p_max_players` below the number already checked in is allowed and does
**not** evict anyone; it only stops further joins. Evicting someone because the
organiser typed a smaller number would be a surprising, destructive side effect
of a settings change.

## 2. Read path — `session_open_preview(p_session_id uuid)`

Security definer, `stable`, shaped after `tournament_spectator_view` (0017).

Returns exactly:

| field | why |
|---|---|
| `club_name`, `location`, `starts_at`, `status` | so the visitor knows what they are joining |
| `checked_in`, `max_players` | "6 of 12 in" |
| `already_in` | so the screen can render the joined state instead of the join button |

Deliberately **not** returned: the roster, other players' names, the cost split,
matches, or anything about any other session. A stranger holding a forwarded link
sees a count, not a guest list. This is the single biggest privacy lever in the
design — showing names is a one-line change, and it leaks club member names to
everyone the link ever reaches.

Returns zero rows when `open_join` is false, so a closed session is
indistinguishable from one that never existed. A link that has been revoked
leaks nothing, not even the fact that it was once valid.

## 3. Write path — `join_open_session(p_session_id uuid)`

Security definer, volatile. Returns the caller's `club_player_id`.

1. `select … from sessions where id = p_session_id for update` — row lock.
2. Reject when: not found, `open_join` false, or `status` not in
   (`scheduled`, `live`).
3. Find-or-create the `club_players` row for `(club_id, auth.uid())`. Reuse any
   existing row with that `profile_id`, so someone who played this club before
   rejoins as themselves rather than cloning a second roster entry with the same
   name.
4. Count `attendance` where `status = 'in'`. Refuse when `max_players` is set and
   the count has reached it.
5. Upsert `attendance` to `in`.

**Step 1 is what makes step 4 correct.** Without the row lock, two callers racing
for the twelfth slot both read `11` and both succeed. The lock serialises them on
the session row, so the second one sees `12` and is refused. This is the only
concurrency-sensitive path in the feature.

### `leave_open_session(p_session_id uuid)`

Sets the caller's own attendance to `out`. Required, not optional: a joiner is
checked in, and 0045 therefore hands them a share of the night's cost. That is
correct when they played and wrong when they mistapped a link, so there has to be
a way back out. Only ever affects the caller's own row.

## 4. Access boundary

No table policies change. All four RPCs — `session_open_preview`,
`join_open_session`, `leave_open_session`, `set_session_open_join` — are security
definer with the gate inside the function, following the 0031/0042 convention:

```sql
revoke all on function public.<fn>(…) from public, anon;
grant execute on function public.<fn>(…) to authenticated;
```

After joining, the visitor holds a `club_players` row and one `attendance` row.
They still cannot read: the club, its other sessions, its stats, its matches, its
roster, or the cost split. `is_club_member()` is false for them and stays false.

The organiser's side is unchanged — the joiner shows up in attendance,
matchmaking, the leaderboard and the cost split exactly like any other roster
entry, because that is what they now are.

## 5. Client

**New route** `app/join/session/[id].tsx`, shaped after `app/join/club/[id].tsx`:
preview card, one action, explicit not-found and full states.

This screen is the joiner's *only* view of the session, before and after joining.
They are not a club member, so the session can never appear in their sessions tab.
The screen therefore renders the joined state in place — "You're in · Tuesday 6pm
· Sunrise Badminton" with a Leave action — rather than redirecting into the app.
This also sidesteps the web gap: `getDb()` returns null on web, so the sqlite
session cache is empty there, but this screen reads only from the RPC and so
behaves identically on web and native.

**`src/lib/joinLink.ts`** — widen `kind` from `"club" | "tournament"` to include
`"session"`, add `buildSessionJoinPath`, extend `joinRouteFor`. `parseJoinTarget`
gains one branch. The bare-uuid fallback at the end of that function keeps its
current meaning (tournament) — changing it would be an ambiguous guess.

**Session detail** — organiser controls: an open/closed toggle, a max-players
field, and a share button reusing `shareJoinLink`. These go in a **new component**
from the start: `app/(app)/sessions/[id].tsx` sits at 498 lines against this
project's 500-line ceiling and would breach immediately otherwise.

**Sessions list** — an `OPEN` chip on open sessions.

**Signed-out visitors** route through the existing `src/lib/pendingLink.ts` so the
link survives the sign-in round trip.

**No `app.json` change.** The existing intent filter already matches
`pathPrefix: "/join"`, which covers `/join/session/<id>`. **No `vercel.json`
change** — the catch-all `/:path*` → `/` rewrite hands every path to the Expo SPA.
Both to be confirmed during implementation rather than assumed.

## 6. Error handling

Each refusal is a distinct exception from the RPC, surfaced through `toast`:

| case | message |
|---|---|
| session not open / not found | "This link is no longer active." |
| at capacity | "This session is full." |
| already checked in | render the joined state, not an error |
| session finished or cancelled | "This session has already finished." |
| not signed in | route to sign-in via `pendingLink`, resume afterwards |

## 7. Testing

- A pure eligibility function — full / closed / finished / already in — unit
  tested, so the button can disable before a round trip. The RPC re-checks all of
  it server-side regardless; the client copy is a courtesy, never the gate.
- `parseJoinTarget` cases for the new `session` kind, including that a bare uuid
  still resolves to `tournament`.

**Not testable here:** the row-lock behaviour under concurrent joins. There is no
local Postgres — `supabase db dump` has already shown Docker is not running on
this machine. The capacity race is the highest-risk part of the feature and it
will ship unverified unless someone runs two concurrent joins against a staging
project. This is the same gap 0045's `attendance` grants shipped with, and it
should be closed deliberately rather than by omission.

## Open question

Whether the preview should show who is already in. Currently specified as a bare
count. Names are friendlier and are what makes an open game feel social; they are
also member names disclosed to anyone the link reaches. Left at count-only until
someone decides otherwise.
