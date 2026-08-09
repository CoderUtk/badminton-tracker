# Task 4 Report: Push notifications migration

## Files created

- `supabase/migrations/0035_push_notifications.sql`
- `tests/notifications.schema.test.ts`

## 1. `tests/notifications.schema.test.ts`

Created test file to verify the migration's security-critical clauses. The test reads the migration file as text and asserts over its SQL contents, following the pattern established in `tests/settings.schema.test.ts`.

Six tests verify:

1. **push_tokens is keyed by token, not a surrogate id** — asserts the presence of `token text primary key`. This ensures device account switches overwrite the old profile_id rather than leaving stale rows that would keep receiving the previous user's notifications.

2. **sends are filtered to recently seen tokens** — asserts `updated_at > now() - interval '60 days'`. This is the entire token-lifecycle strategy; without it the design would need a background cleanup job.

3. **push_to is not executable by clients** — asserts both the `revoke execute on function public.push_to(...)` statement and the `from public, anon, authenticated` clause. This is critical: `push_to` is `SECURITY DEFINER` and reads every user's push tokens. Without the revoke, any authenticated client could push arbitrary text to arbitrary users.

4. **both triggers swallow their own errors** — asserts exactly 2 occurrences of `exception when others then return new;`. A raising trigger rolls back the transaction that fired it — a broken notification would block friend requests or club join requests entirely.

5. **the join request trigger excludes the requester** — asserts `profile_id <> new.profile_id`. Club admins should not be notified of their own join requests.

6. **row level security is enabled on push_tokens** — asserts `alter table public.push_tokens enable row level security`. Users must not be able to read/write other users' tokens.

## 2. `supabase/migrations/0035_push_notifications.sql`

Migration written verbatim per the brief. Creates the `push_tokens` table and two trigger functions that fire on friend request and club join request insertion.

**Key design decisions (all preserved exactly from brief):**

- **Table design**: `token` is the primary key (not a surrogate `id`). When a device switches accounts, the upsert updates the same row in place; a surrogate key would leave the old row behind, and the previous owner would keep receiving notifications on a device they no longer own.

- **Index**: `(profile_id, updated_at desc)` supports the 60-day token filter in `push_to()` and the RLS policy queries.

- **`push_to()` function**: 
  - Accepts an array of profile IDs and message content (title, body, data JSON).
  - Collects all valid tokens (updated within 60 days) for the target profiles.
  - Fires a single HTTP POST to the Expo push API via `pg_net`.
  - Marked `SECURITY DEFINER` and revoked from `public`, `anon`, `authenticated` — only triggers can call it.
  - Returns immediately after queueing the request (fire-and-forget); the calling transaction never blocks on network latency.

- **Friend request trigger** (`notify_friend_request`):
  - Fires on `after insert` of a new friendship row.
  - Checks that `new.status = 'pending'` (only notify on new requests, not accepts).
  - Fetches the requester's display name (with fallback to username, then 'Someone').
  - Calls `push_to([addressee_id], 'Friend request', '<name> wants to be friends.', {...})`.
  - Catches all exceptions and returns `new` to avoid blocking the insert transaction.

- **Club join request trigger** (`notify_join_request`):
  - Fires on `after insert` of a new club join request row.
  - Checks that `new.status = 'pending'`.
  - Fetches the requester's display name and the club name (with fallback for the club).
  - Queries club admins and owners (excluding the requester via `profile_id <> new.profile_id`).
  - Calls `push_to(v_admins, 'Join request', '<name> wants to join <club>.', {...})`.
  - Catches all exceptions and returns `new` to avoid blocking the insert transaction.

Both trigger functions are `SECURITY DEFINER` to access other users' data (names, club membership) without RLS blocking them.

## Commands run

```bash
npx jest tests/notifications.schema.test.ts
```

Output:
```
PASS tests/notifications.schema.test.ts (10.493 s)
  √ push_tokens is keyed by token, not a surrogate id (4 ms)
  √ sends are filtered to recently seen tokens (1 ms)
  √ push_to is not executable by clients (1 ms)
  √ both triggers swallow their own errors (1 ms)
  √ the join request trigger excludes the requester (2 ms)
  √ row level security is enabled on push_tokens

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```

Full test suite:
```bash
npx jest
```

Output (final lines):
```
Test Suites: 44 passed, 44 total
Tests:       271 passed, 271 total
Snapshots:   0 total
Time:        29.469 s, estimated 41 s
Ran all test suites.
```

Comparison to baseline: The brief stated 43 suites / 265 tests before this change. After adding the notification test suite (1 suite with 6 tests), the total is now 44 suites / 271 tests. ✓

## Commit

```bash
git add supabase/migrations/0035_push_notifications.sql tests/notifications.schema.test.ts
git commit -m "feat(notifications): push_tokens table and friend/join request triggers"
```

SHA: `50475f588aeb3edf81500b8a8a36f03c765ab7db`

Commit message verified to have no `Co-Authored-By` trailer.

`git status` after commit confirmed only these two files were staged/committed; all other dirty/untracked items in the shared checkout (`CLAUDE.md`, deleted `assets/` files, untracked `REACT_NATIVE_ANIMATION_GUIDE.md`, `npx`, `web/.vercel/`) were left untouched.

## Self-review findings

**Security-critical clauses:**
- `revoke execute on function public.push_to(uuid[], text, text, jsonb) from public, anon, authenticated;` is present (line 160) — required to prevent clients from calling `push_to` directly.
- Both trigger functions end with `exception when others then return new;` (lines 187, 235) — required to prevent a broken notification from blocking the transaction that fired it.
- `profile_id <> new.profile_id` is present in the join request trigger (line 224) — required to exclude the requester from admin notifications.

**Design correctness:**
- Token primary key (not surrogate) confirmed at line 87: `token text primary key`.
- 60-day filter confirmed at line 147: `and t.updated_at > now() - interval '60 days'`.
- RLS enabled confirmed at line 101: `alter table public.push_tokens enable row level security`.
- All four RLS policies present: select, insert, update, delete (lines 103–121).

**No modifications to existing migrations or schema:**
- No existing migration files were touched.
- No existing tables or functions were modified.
- Migration is purely additive: creates one table, one function (`push_to`), two trigger functions, one index, and four RLS policies.

**No database applied:**
- Confirmed: No `supabase db push`, `supabase migration up`, or direct database connection was used.
- The migration file exists and passes text-based verification only.

## Migration not applied

**Explicitly confirmed:** This migration was written and tested as a text file only. No `supabase` CLI commands were run, no database connection was made, and no SQL was executed. The file is ready for human application per Task 8.

---

## Test Coverage Fixes (Round 1)

**Review findings:** Initial review identified two Important gaps in test coverage:

1. **RLS ownership check gap:** Test `row level security is enabled on push_tokens` only verified that RLS was enabled, not that policies enforced `auth.uid() = profile_id` ownership checks. A future edit weakening any policy to `using (true)` would pass all tests.

2. **Revoke assertion vulnerability:** Tests for `push_to` function revoke used two separate assertions:
   ```ts
   expect(sql).toMatch(/revoke execute on function public\.push_to/i);
   expect(sql).toMatch(/from public, anon, authenticated/i);
   ```
   This allowed a malicious weakening where the revoke statement was split across multiple statements (e.g., `revoke from public` + `grant to authenticated` in a separate line), both assertions would pass independently even though the security intent was violated.

### Validation

Before updating the tests, the new assertions were validated against both correct SQL and deliberately weakened versions:

- **Weakened RLS test:** Policies changed to `using (true)` and `with check (true)` — improved tests correctly fail, old tests pass.
- **Weakened revoke test:** Revoke statement split across separate grant/comment lines — improved tests correctly fail, old tests pass both assertions independently.

### Test file updates

**Test 3 (revoke):** Replaced two independent assertions with a single anchored regex:
```ts
expect(sql).toMatch(
  /revoke execute on function public\.push_to\s*\(\s*uuid\[\]\s*,\s*text\s*,\s*text\s*,\s*jsonb\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i
);
```
This ensures the revoke statement and its target list cannot be satisfied separately.

**Test 6 (RLS) expanded to Test 7:** Split into two tests:
- **Test 6:** Unchanged — verifies RLS is enabled.
- **Test 7 (new):** `all four RLS policies verify auth.uid() = profile_id ownership` — uses five focused regexes to verify ownership checks in each policy's `using` or `with check` clauses:
  - SELECT policy `using (auth.uid() = profile_id)`
  - INSERT policy `with check (auth.uid() = profile_id ...)`
  - UPDATE `using (auth.uid() = profile_id)`
  - UPDATE `with check (auth.uid() = profile_id)`
  - DELETE policy `using (auth.uid() = profile_id)`

**Test 4 (optional improvement):** Enhanced exception handler test to tie each handler to its function:
```ts
const friendHandler = /create or replace function public\.notify_friend_request\(\)[\s\S]*?exception when others then return new;/i;
const joinHandler = /create or replace function public\.notify_join_request\(\)[\s\S]*?exception when others then return new;/i;
expect(friendHandler.test(sql)).toBe(true);
expect(joinHandler.test(sql)).toBe(true);
```
This ensures both functions have their own exception handler; previously, two handlers in one function and none in the other would have passed the count check.

### Commands run

```bash
npx jest tests/notifications.schema.test.ts
```

Output after fixes:
```
PASS tests/notifications.schema.test.ts (27.499 s)
  √ push_tokens is keyed by token, not a surrogate id (12 ms)
  √ sends are filtered to recently seen tokens (1 ms)
  √ push_to is not executable by clients (1 ms)
  √ both triggers swallow their own errors (4 ms)
  √ the join request trigger excludes the requester (2 ms)
  √ row level security is enabled on push_tokens (1 ms)
  √ all four RLS policies verify auth.uid() = profile_id ownership (3 ms)

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

Full test suite:
```bash
npx jest
```

Output (final lines):
```
Test Suites: 44 passed, 44 total
Tests:       272 passed, 272 total
Snapshots:   0 total
Time:        47.941 s
Ran all test suites.
```

Comparison: Original baseline was 43 suites / 265 tests. After the initial migration task, it was 44 suites / 271 tests. After test coverage fixes, it is now 44 suites / 272 tests (added 1 new RLS policy coverage test).

### Commit

```bash
git add tests/notifications.schema.test.ts
git commit -m "test(notifications): strengthen RLS and revoke coverage in schema tests"
```

SHA: `be0730709a24f7fc3015072f6cbfe82bbff3f1b0`

Commit message verified to have no `Co-Authored-By` trailer.

`git status` after commit confirmed only the test file was staged/committed.

### Test correctness validation

All improvements verified against weakened SQL:
- New RLS assertions correctly fail when policies use `true()` instead of `auth.uid() = profile_id`
- New revoke assertion correctly fails when revoke and grant are split across lines
- Exception handler assertions correctly fail when either function lacks its handler
- All original tests still pass (no regression)

No changes to `supabase/migrations/0035_push_notifications.sql` — migration remains as written and correct.

---

## Test Coverage Fix Round 2: Block Extraction

**Review finding:** The RLS ownership test had a critical defect. Using `.*?` with the `s` (dotAll) flag allowed the regex to match across policy boundaries. When a single policy was weakened, the regex would skip over the weak clause and match a *neighboring policy's* correct ownership check. For example:

```
Actual policies:
  SELECT:  using (auth.uid() = profile_id)  ← correct
  UPDATE:  using (auth.uid() = profile_id)  ← correct
  
Weaken SELECT to: using (true)
  
My old regex: /create policy.*?for select.*?using.*?auth.uid.*?/is
  
Result: Regex skips the weakened SELECT policy and matches UPDATE's using clause
→ Test still passes even though SELECT is broken
```

This affected SELECT, INSERT, UPDATE (both clauses), and DELETE: each assertion could be satisfied by a neighboring policy's correct clause.

### Solution: Block Extraction

Extract each policy into its own block before testing. Split the SQL by `create policy` statements and find the block for each operation. Test ownership patterns only within that isolated block:

```typescript
const getPolicyBlock = (operation: string) => {
  const policies = sql.split(/(?=create policy)/);
  return policies.find((p) => p.toLowerCase().includes(`for ${operation}`)) || "";
};
```

Then check operation-specific patterns:
- **SELECT:** `using (auth.uid() = profile_id)`
- **INSERT:** `with check (...auth.uid() = profile_id...)`
- **UPDATE:** BOTH `using (auth.uid() = profile_id)` AND `with check (...auth.uid() = profile_id...)`
  - Separate checks ensure neither clause can be individually weakened
  - Update policy has two ownership checks; both must be verified separately
- **DELETE:** `using (auth.uid() = profile_id)`

### Validation: All Five Weakening Scenarios

Tested each of the five critical clauses independently. For each, weakened ONLY that clause and verified the corresponding assertion fails:

1. **SELECT using → (true)**
   - Weaken only the SELECT using clause
   - Assertion: `expect(/using\s*\(\s*auth\.uid\(\)\s*=\s*profile_id\s*\)/i.test(selectBlock)).toBe(true)`
   - Result: FAILS correctly ✓ (weakened clause is not found)

2. **INSERT with check → (true)**
   - Weaken only the INSERT with check clause
   - Assertion: `expect(/with check\s*\([^)]*auth\.uid\(\)\s*=\s*profile_id/i.test(insertBlock)).toBe(true)`
   - Result: FAILS correctly ✓

3. **UPDATE using → (true)**
   - Weaken only the UPDATE using clause (leave with check intact)
   - Assertion (first): `expect(/using\s*\(\s*auth\.uid\(\)\s*=\s*profile_id\s*\)/i.test(updateBlock)).toBe(true)`
   - Result: FAILS correctly ✓ (even though with check is still correct)

4. **UPDATE with check → (true)**
   - Weaken only the UPDATE with check clause (leave using intact)
   - Assertion (second): `expect(/with check\s*\([^)]*auth\.uid\(\)\s*=\s*profile_id[^)]*\)/i.test(updateBlock)).toBe(true)`
   - Result: FAILS correctly ✓ (even though using is still correct)

5. **DELETE using → (true)**
   - Weaken only the DELETE using clause
   - Assertion: `expect(/using\s*\(\s*auth\.uid\(\)\s*=\s*profile_id\s*\)/i.test(deleteBlock)).toBe(true)`
   - Result: FAILS correctly ✓

All five independently-weakened clauses cause their corresponding assertions to fail. No assertion can be satisfied by a neighboring policy's clause.

### Commands run

```bash
npx jest tests/notifications.schema.test.ts
```

Output:
```
PASS tests/notifications.schema.test.ts (31.497 s)
  √ push_tokens is keyed by token, not a surrogate id (18 ms)
  √ sends are filtered to recently seen tokens (1 ms)
  √ push_to is not executable by clients (1 ms)
  √ both triggers swallow their own errors (3 ms)
  √ the join request trigger excludes the requester (1 ms)
  √ row level security is enabled on push_tokens (1 ms)
  √ all four RLS policies verify auth.uid() = profile_id ownership (4 ms)

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

Full test suite:
```bash
npx jest
```

Output (final lines):
```
Test Suites: 44 passed, 44 total
Tests:       272 passed, 272 total
Snapshots:   0 total
Time:        74.919 s
Ran all test suites.
```

### Commit

```bash
git add tests/notifications.schema.test.ts
git commit -m "fix(test): use block extraction to prevent RLS assertion bypass"
```

SHA: `73a041678643e3f72416aac147f947c12937ad93`

Commit message verified to have no `Co-Authored-By` trailer.

`git status` after commit confirmed only the test file was staged/committed.

### Security verification

With block extraction in place:
- Cannot accidentally match a neighboring policy's ownership clause — each block is tested in isolation
- SELECT policy cannot satisfy UPDATE policy's test (different blocks)
- INSERT policy cannot satisfy DELETE policy's test (different blocks)
- Each UPDATE clause (using and with check) is tested separately, preventing one weakened clause from being masked by the other
- All five critical ownership checks are independently verifiable

No changes to `supabase/migrations/0035_push_notifications.sql` — migration remains correct and unchanged.
