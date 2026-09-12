import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "0048_session_push.sql"),
  "utf8",
);

/** Just one function body: slicing to end-of-file would let a later
 *  function's SQL satisfy an assertion about an earlier one. */
const fn = (name: string) => {
  const start = sql.indexOf(`function public.${name}`);
  const end = sql.indexOf("end $$;", start);
  return sql.slice(start, end);
};

test("both notifiers are security definer with a pinned search_path", () => {
  for (const name of ["notify_session_created", "notify_attendance_in"]) {
    expect(fn(name)).toMatch(/security definer/);
    expect(fn(name)).toMatch(/set search_path = public/);
  }
});

test("a push failure cannot abort the insert that triggered it", () => {
  expect(sql.match(/exception when others then return new/g)).toHaveLength(2);
});

test("a session in the past does not invite anyone", () => {
  expect(fn("notify_session_created")).toMatch(/new\.starts_at <= now\(\) then return new/);
});

test("only club members are notified, never open-join link holders", () => {
  const f = fn("notify_session_created");
  expect(f).toMatch(/from club_members/);
  expect(f).not.toMatch(/from club_players/);
});

test("the creator is not notified about their own session", () => {
  expect(fn("notify_session_created")).toMatch(/profile_id <> new\.created_by/);
});

test("check-in notifies only the organiser", () => {
  const f = fn("notify_attendance_in");
  expect(f).toMatch(/array\[v_organiser\]/);
});

test("check-in ignores maybe/out and sessions that already started", () => {
  const f = fn("notify_attendance_in");
  expect(f).toMatch(/new\.status <> 'in' then return new/);
  expect(f).toMatch(/v_starts_at <= now\(\) then return new/);
});

test("the organiser checking themselves in is not announced", () => {
  expect(fn("notify_attendance_in")).toMatch(/v_joiner is not distinct from v_organiser/);
});

test("attendance fires on insert only, so toggling cannot spam the organiser", () => {
  const trigger = sql.slice(sql.indexOf("create trigger attendance_notify"));
  expect(trigger).toMatch(/after insert on public\.attendance/);
  expect(trigger).not.toMatch(/update/);
});

test("payloads route through the existing session notification type", () => {
  expect(sql.match(/'type', 'session', 'sessionId'/g)).toHaveLength(2);
});
