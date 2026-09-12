import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "0050_recurring_sessions.sql"),
  "utf8",
);

test("adds repeat_weekly re-runnably, defaulting off", () => {
  expect(sql).toMatch(/add column if not exists repeat_weekly boolean not null default false/);
});

test("only the organiser may set the flag", () => {
  const fn = sql.slice(sql.indexOf("function public.set_session_repeat"));
  expect(fn).toMatch(/if not can_manage_session\(p_session_id\) then/);
  expect(fn).toMatch(/security definer/);
  expect(fn).toMatch(/set search_path = public/);
});

test("the materialiser carries the flag forward so the series continues", () => {
  const fn = sql.slice(sql.indexOf("function public.materialise_weekly_sessions"));
  expect(fn).toMatch(/insert into sessions \(club_id, starts_at, ends_at, location, courts,\s+created_by, repeat_weekly\)/);
  expect(fn).toMatch(/s\.starts_at \+ interval '7 days'/);
});

test("a series stops when the occurrence that just passed had no check-ins", () => {
  const fn = sql.slice(sql.indexOf("function public.materialise_weekly_sessions"));
  expect(fn).toMatch(/exists \(select 1 from attendance a[\s\S]*?a\.status = 'in'\)/);
});

test("cancelled nights do not regenerate", () => {
  expect(sql).toMatch(/s\.status <> 'cancelled'/);
});

test("re-running the job inserts nothing at a slot that is already filled", () => {
  const fn = sql.slice(sql.indexOf("function public.materialise_weekly_sessions"));
  expect(fn).toMatch(/not exists \(select 1 from sessions n[\s\S]*?n\.starts_at = s\.starts_at \+ interval '7 days'\)/);
});

test("no client may run the materialiser", () => {
  expect(sql).toMatch(/revoke execute on function public\.materialise_weekly_sessions\(\)\s+from public, anon, authenticated/);
});

test("scheduled hourly under its own job name", () => {
  expect(sql).toMatch(/cron\.schedule\(\s*'materialise-weekly-sessions',\s*'23 \* \* \* \*'/);
});
