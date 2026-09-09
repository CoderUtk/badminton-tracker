import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "0046_open_sessions.sql"),
  "utf8",
);

test("adds the two session columns, defaulting closed", () => {
  expect(sql).toMatch(/add column open_join\s+boolean not null default false/);
  expect(sql).toMatch(/add column max_players int/);
  expect(sql).toMatch(/max_players between 1 and 100/);
});

test("join_open_session locks the session row before counting", () => {
  // The capacity check is only correct under a row lock: without it two
  // callers racing for the last slot both read the same count and both win.
  // This assertion is the only automated guard on that, since the behaviour
  // cannot be exercised without a live Postgres.
  const fn = sql.slice(sql.indexOf("function public.join_open_session"));
  expect(fn).toMatch(/for update/);
  expect(fn.indexOf("for update")).toBeLessThan(fn.indexOf("count("));
});

test("every new function is security definer with a pinned search_path", () => {
  const definitions = sql.match(/create or replace function public\.\w+[\s\S]*?\$\$/g) ?? [];
  // can_manage_session, can_manage_session_cost, set_session_open_join,
  // session_open_preview, join_open_session, leave_open_session.
  expect(definitions.length).toBe(6);
  for (const d of definitions) {
    expect(d).toMatch(/security definer/);
    expect(d).toMatch(/set search_path = public/);
  }
});

test("execute is revoked from anon and granted only to authenticated", () => {
  for (const fn of [
    "session_open_preview", "join_open_session",
    "leave_open_session", "set_session_open_join", "can_manage_session",
  ]) {
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}[^;]*from public, anon`));
    expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}[^;]*to authenticated`));
  }
});

test("the preview discloses no player names", () => {
  const fn = sql.slice(
    sql.indexOf("function public.session_open_preview"),
    sql.indexOf("function public.join_open_session"),
  );
  // The join to club_players is required to resolve auth.uid() for already_in.
  // What must never appear is a player NAME in the returns table or the select
  // list — the spec's guarantee is "a count, not a guest list".
  expect(fn).toMatch(/count\(/);
  expect(fn).not.toMatch(/p\.name/);
  expect(fn).not.toMatch(/player_name/);
  expect(fn).not.toMatch(/array_agg/);
});

test("keeps can_manage_session_cost resolvable for 0045's RPCs", () => {
  expect(sql).toMatch(/create or replace function public\.can_manage_session_cost/);
});
