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

// Splitting on the function header is the same remedy already applied to the
// RLS policy assertions below. An unanchored `[\s\S]*?` crosses function
// boundaries, so deleting one handler let the regex reach into the next
// function's handler and both assertions still passed.
const functionBlock = (name: string) =>
  sql
    .split(/(?=create or replace function)/i)
    .find((block) => new RegExp(`^create or replace function\\s+public\\.${name}\\s*\\(`, "i").test(block.trim())) ?? "";

test("both triggers swallow their own errors", () => {
  // A raising trigger rolls back the insert that fired it: a broken
  // notification would block friend requests entirely.
  const handler = /exception when others then return new;/i;
  expect(handler.test(functionBlock("notify_friend_request"))).toBe(true);
  expect(handler.test(functionBlock("notify_join_request"))).toBe(true);
});

test("registration goes through a security definer RPC, not a client upsert", () => {
  // `on conflict do update` under RLS is evaluated against the pre-existing
  // row, which belongs to the previous user after an account switch. Without
  // this function the device can never re-register.
  const fn = functionBlock("register_push_token");
  expect(fn).not.toBe("");
  expect(/security definer/i.test(fn)).toBe(true);
  expect(/set search_path\s*=\s*public/i.test(fn)).toBe(true);
  expect(/on conflict\s*\(\s*token\s*\)\s*do update/i.test(fn)).toBe(true);
  // The inserted row is owned by the caller and nobody else.
  expect(/values\s*\(\s*p_token\s*,\s*v_profile_id\s*,/i.test(fn)).toBe(true);
});

test("register_push_token deletes a foreign row instead of reassigning it", () => {
  // The function is security definer, so `do update set profile_id =
  // excluded.profile_id` would overwrite the owner of ANY existing row: a
  // caller who learned another user's token string could redirect that
  // device's notifications to their own account and read them. Dropping the
  // foreign row keeps the account switch working without ever handing the
  // caller ownership of a row they did not already own.
  const fn = functionBlock("register_push_token");

  expect(
    /delete from push_tokens\s+where token\s*=\s*p_token\s+and profile_id\s*<>\s*v_profile_id\s*;/i.test(fn),
  ).toBe(true);

  // The upsert must NOT touch profile_id. Asserting on the presence of the
  // delete alone would still pass if the `do update` reassigned as well.
  const conflictAt = fn.search(/on conflict\s*\(\s*token\s*\)\s*do update/i);
  expect(conflictAt).toBeGreaterThan(-1);
  const doUpdate = fn.slice(conflictAt, fn.indexOf(";", conflictAt));
  expect(/profile_id/i.test(doUpdate)).toBe(false);

  // The delete has to come first, or the conflicting foreign row survives and
  // the insert fails on the primary key.
  expect(fn.search(/delete from push_tokens/i)).toBeLessThan(conflictAt);
});

test("register_push_token derives the owner from auth.uid(), never a parameter", () => {
  // A profile_id parameter would let any client bind a token to another user.
  const fn = functionBlock("register_push_token");
  const signature = fn.slice(0, fn.indexOf(")"));
  expect(/profile_id/i.test(signature)).toBe(false);
  expect(/auth\.uid\(\)/i.test(fn)).toBe(true);
});

test("register_push_token rejects anonymous sessions and bad platforms", () => {
  const fn = functionBlock("register_push_token");
  // Same guard as the insert policy and 0018_anon_rls_restrictions.sql.
  expect(/auth\.jwt\(\)->>'is_anonymous'/i.test(fn)).toBe(true);
  expect(/p_platform not in \('ios',\s*'android'\)/i.test(fn)).toBe(true);
});

test("register_push_token stays callable by clients", () => {
  // Unlike push_to, this one is the client's only way to register. A revoke
  // here would disable push entirely.
  expect(sql).not.toMatch(/revoke execute on function public\.register_push_token/i);
});

test("every policy is dropped before it is created", () => {
  // This migration is applied by hand; a partial application followed by a
  // re-run must not abort on "policy already exists" and leave push_to and
  // the triggers uncreated.
  const created = [...sql.matchAll(/create policy\s+"([^"]+)"/gi)].map((m) => m[1]);
  expect(created.length).toBe(4);
  for (const name of created) {
    expect(sql).toMatch(
      new RegExp(`drop policy if exists\\s+"${name}"\\s+on public\\.push_tokens;`, "i"),
    );
  }
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
  // Extract each policy block separately to prevent regex from matching
  // across policy boundaries (e.g., a weakened select policy could match
  // the update policy's correct ownership clause).
  const getPolicyBlock = (operation: string) => {
    const policies = sql.split(/(?=create policy)/);
    return policies.find((p) => p.toLowerCase().includes(`for ${operation}`)) || "";
  };

  const selectBlock = getPolicyBlock("select");
  const insertBlock = getPolicyBlock("insert");
  const updateBlock = getPolicyBlock("update");
  const deleteBlock = getPolicyBlock("delete");

  // SELECT: check using clause has ownership
  expect(/using\s*\(\s*auth\.uid\(\)\s*=\s*profile_id\s*\)/i.test(selectBlock)).toBe(true);

  // INSERT: check with check clause has ownership
  expect(/with check\s*\([^)]*auth\.uid\(\)\s*=\s*profile_id/i.test(insertBlock)).toBe(true);

  // UPDATE: must have ownership in BOTH using and with check clauses
  // Testing separately ensures neither can be individually weakened
  expect(/using\s*\(\s*auth\.uid\(\)\s*=\s*profile_id\s*\)/i.test(updateBlock)).toBe(true);
  expect(/with check\s*\([^)]*auth\.uid\(\)\s*=\s*profile_id[^)]*\)/i.test(updateBlock)).toBe(true);

  // DELETE: check using clause has ownership
  expect(/using\s*\(\s*auth\.uid\(\)\s*=\s*profile_id\s*\)/i.test(deleteBlock)).toBe(true);
});
