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
  expect(sql).toMatch(/revoke execute on function public\.push_to/i);
  expect(sql).toMatch(/from public, anon, authenticated/i);
});

test("both triggers swallow their own errors", () => {
  // A raising trigger rolls back the insert that fired it: a broken
  // notification would block friend requests entirely.
  const handlers = sql.match(/exception when others then return new;/gi) ?? [];
  expect(handlers.length).toBe(2);
});

test("the join request trigger excludes the requester", () => {
  expect(sql).toMatch(/profile_id\s*<>\s*new\.profile_id/i);
});

test("row level security is enabled on push_tokens", () => {
  expect(sql).toMatch(/alter table public\.push_tokens enable row level security/i);
});
