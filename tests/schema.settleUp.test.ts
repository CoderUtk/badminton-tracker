import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "0051_settle_up.sql"),
  "utf8",
);

test("no payment rails are baked into the schema", () => {
  // Dropped deliberately: UPI is India-only. A global payee link is a separate
  // design, not a widening of this migration. Checked against the statements
  // rather than the file, since the header comment says why it went.
  const statements = sql.replace(/^\s*--.*$/gm, "");
  for (const token of ["upi", "payee_handles", "vpa"]) {
    expect(statements.toLowerCase()).not.toContain(token);
  }
});

test("the nudge is stamped, so it can never fire twice for one session", () => {
  expect(sql).toMatch(/add column if not exists settle_nudged_at timestamptz/);
  const fn = sql.slice(sql.indexOf("function public.nudge_unsettled_shares"));
  expect(fn).toMatch(/s\.settle_nudged_at is null/);
  expect(fn).toMatch(/update sessions set settle_nudged_at = now\(\) where id = r\.id/);
});

test("the nudge waits a day and looks back no further than a week", () => {
  const fn = sql.slice(sql.indexOf("function public.nudge_unsettled_shares"));
  expect(fn).toMatch(/s\.starts_at < now\(\) - interval '24 hours'/);
  expect(fn).toMatch(/s\.starts_at > now\(\) - interval '7 days'/);
});

test("the payer is never nudged to pay themselves", () => {
  const fn = sql.slice(sql.indexOf("function public.nudge_unsettled_shares"));
  expect(fn).toMatch(/cp\.id <> \(select paid_by from sessions where id = r\.id\)/);
});

test("no client may run the nudge, and it is scheduled", () => {
  expect(sql).toMatch(/revoke execute on function public\.nudge_unsettled_shares\(\)\s+from public, anon, authenticated/);
  expect(sql).toMatch(/cron\.schedule\(\s*'nudge-unsettled-shares'/);
});
