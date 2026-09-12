import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "0051_settle_up.sql"),
  "utf8",
);

test("the UPI handle is kept off profiles, whose select policy is using (true)", () => {
  expect(sql).toMatch(/create table if not exists public\.payee_handles/);
  expect(sql).not.toMatch(/alter table public\.profiles/);
});

test("payee_handles is RLS-on and owner-scoped for every verb", () => {
  expect(sql).toMatch(/alter table public\.payee_handles enable row level security/);
  for (const verb of ["select", "insert", "update", "delete"]) {
    expect(sql).toMatch(new RegExp(`for ${verb} to authenticated`));
  }
  // Four policies, every one of them bound to the owner.
  expect(sql.match(/auth\.uid\(\) = profile_id/g)!.length).toBeGreaterThanOrEqual(4);
});

test("guests cannot publish a payment handle", () => {
  expect(sql).toMatch(/is_anonymous'\)::boolean, false\) = false/);
});

test("the stored handle must look like a VPA", () => {
  expect(sql).toMatch(/check \(upi_id ~ '\^\[a-zA-Z0-9\._-\]\{2,64\}@\[a-zA-Z\]\[a-zA-Z0-9\.\]\{1,63\}\$'\)/);
});

test("session_payee_upi answers only for a session the caller owes on", () => {
  const fn = sql.slice(sql.indexOf("function public.session_payee_upi"), sql.indexOf("revoke all on function public.session_payee_upi"));
  expect(fn).toMatch(/me\.profile_id = auth\.uid\(\)/);
  expect(fn).toMatch(/a\.status = 'in'/);
  expect(fn).toMatch(/not a\.settled/);
  expect(fn).toMatch(/me\.id <> s\.paid_by/);
  // Session-scoped, never club-scoped.
  expect(fn).toMatch(/a\.session_id = s\.id/);
  expect(fn).toMatch(/security definer/);
  expect(fn).toMatch(/set search_path = public/);
});

test("anon cannot call session_payee_upi", () => {
  expect(sql).toMatch(/revoke all on function public\.session_payee_upi\(uuid\) from public, anon/);
  expect(sql).toMatch(/grant execute on function public\.session_payee_upi\(uuid\) to authenticated/);
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
