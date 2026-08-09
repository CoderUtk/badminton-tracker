import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "0035_push_notifications.sql"),
  "utf8",
);

test("push_tokens is keyed by token, not a surrogate id", () => {
  // A surrogate key would leave a stale row behind when a device changes
  // accounts, and the previous user's pushes would keep arriving.
  expect(sql).toMatch(/token\s+text\s+primary key/i);
});

test("sends are filtered to recently seen tokens", () => {
  // This filter is the entire token-lifecycle strategy. Without it the
  // design needs a cleanup job.
  expect(sql).toMatch(/updated_at\s*>\s*now\(\)\s*-\s*interval\s*'60 days'/i);
});

test("push_to is not executable by clients", () => {
  // push_to is SECURITY DEFINER and reads every user's tokens. Without the
  // revoke, any authenticated client can push arbitrary text to anyone.
  // Single regex ensures revoke and target list are in the same statement.
  expect(sql).toMatch(
    /revoke execute on function public\.push_to\s*\(\s*uuid\[\]\s*,\s*text\s*,\s*text\s*,\s*jsonb\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i
  );
});

test("both triggers swallow their own errors", () => {
  // A raising trigger rolls back the insert that fired it: a broken
  // notification would block friend requests entirely.
  // Each handler is tied to its function to ensure neither is missing.
  const friendHandler = /create or replace function public\.notify_friend_request\(\)[\s\S]*?exception when others then return new;/i;
  const joinHandler = /create or replace function public\.notify_join_request\(\)[\s\S]*?exception when others then return new;/i;
  expect(friendHandler.test(sql)).toBe(true);
  expect(joinHandler.test(sql)).toBe(true);
});

test("the join request trigger excludes the requester", () => {
  expect(sql).toMatch(/profile_id\s*<>\s*new\.profile_id/i);
});

test("row level security is enabled on push_tokens", () => {
  // RLS enabled check ensures the table is protected.
  expect(sql).toMatch(/alter table public\.push_tokens enable row level security/i);
});

test("all four RLS policies verify auth.uid() = profile_id ownership", () => {
  // Each policy must check that the user only accesses their own tokens.
  // Verifying the policy bodies (not just that RLS is enabled) ensures a
  // future edit cannot weaken policies to using (true) without failing tests.
  expect(sql).toMatch(/create policy\s+"[^"]*"\s+on public\.push_tokens for select.*?using\s*\(\s*auth\.uid\(\)\s*=\s*profile_id\s*\)/is);
  expect(sql).toMatch(/create policy\s+"[^"]*"\s+on public\.push_tokens for insert.*?with check\s*\(\s*auth\.uid\(\)\s*=\s*profile_id/is);
  expect(sql).toMatch(/create policy\s+"[^"]*"\s+on public\.push_tokens for update.*?using\s*\(\s*auth\.uid\(\)\s*=\s*profile_id\s*\)/is);
  expect(sql).toMatch(/create policy\s+"[^"]*"\s+on public\.push_tokens for update.*?with check\s*\(\s*auth\.uid\(\)\s*=\s*profile_id\s*\)/is);
  expect(sql).toMatch(/create policy\s+"[^"]*"\s+on public\.push_tokens for delete.*?using\s*\(\s*auth\.uid\(\)\s*=\s*profile_id\s*\)/is);
});
