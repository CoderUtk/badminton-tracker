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

test("execute is revoked from anon and granted only to authenticated, per exact signature", () => {
  // Matched on the exact signature (name + arg list), not a bare name prefix:
  // "can_manage_session" alone would also match "can_manage_session_cost(uuid)"
  // lines, so deleting the can_manage_session(uuid) grant/revoke pair would go
  // unnoticed by a looser match.
  const signatures = [
    "session_open_preview(uuid)",
    "join_open_session(uuid)",
    "leave_open_session(uuid)",
    "set_session_open_join(uuid, boolean, int)",
    "can_manage_session(uuid)",
  ];
  for (const sig of signatures) {
    expect(sql).toContain(`revoke all on function public.${sig} from public, anon;`);
    expect(sql).toContain(`grant execute on function public.${sig} to authenticated;`);
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

test("session_open_preview is gated on open_join — a closed session returns no rows", () => {
  const fn = sql.slice(
    sql.indexOf("function public.session_open_preview"),
    sql.indexOf("function public.join_open_session"),
  );
  expect(fn).toMatch(/where\s+s\.id\s*=\s*p_session_id\s+and\s+s\.open_join/);
});

test("keeps can_manage_session_cost resolvable for 0045's RPCs", () => {
  expect(sql).toMatch(/create or replace function public\.can_manage_session_cost/);
});

test("join_open_session tolerates a concurrent first-ever join instead of raising unique_violation", () => {
  const fn = sql.slice(sql.indexOf("function public.join_open_session"));
  expect(fn).toMatch(/on conflict \(club_id, profile_id\) do nothing/);
});

test("join_open_session rejects a session that is not scheduled or live", () => {
  const fn = sql.slice(
    sql.indexOf("function public.join_open_session"),
    sql.indexOf("function public.leave_open_session"),
  );
  expect(fn).toMatch(/v_status not in \('scheduled', 'live'\)/);
});

test("join_open_session and leave_open_session both reject an unauthenticated caller", () => {
  const joinFn = sql.slice(
    sql.indexOf("function public.join_open_session"),
    sql.indexOf("function public.leave_open_session"),
  );
  const leaveFn = sql.slice(sql.indexOf("function public.leave_open_session"));
  expect(joinFn).toMatch(/if auth\.uid\(\) is null then raise exception/);
  expect(leaveFn).toMatch(/if auth\.uid\(\) is null then raise exception/);
});

test("leave_open_session rejects a session that is not scheduled or live", () => {
  // Mirrors join_open_session's status gate (see FIX 1): without this, a
  // joiner can set themselves 'out' after the session is done and the
  // organiser has entered the cost, shrinking the divisor 0045 uses to split
  // it and silently raising everyone else's share.
  const fn = sql.slice(sql.indexOf("function public.leave_open_session"));
  expect(fn).toMatch(/v_status is null or v_status not in \('scheduled', 'live'\)/);
});

test("leave_open_session raises when the caller was never in the session", () => {
  const fn = sql.slice(sql.indexOf("function public.leave_open_session"));
  expect(fn).toMatch(/if not found then/);
});

test("join_open_session and leave_open_session both reject an anonymous (guest) caller", () => {
  // On this codebase `authenticated` includes anonymous/guest sessions (see
  // 0018_anon_rls_restrictions.sql's header), so the `to authenticated` grant
  // on these functions is not enough by itself — a freely-mintable guest
  // session could otherwise call signInAnonymously() and then join_open_session
  // directly, consuming a real capacity slot and diluting 0045's cost split.
  const joinFn = sql.slice(
    sql.indexOf("function public.join_open_session"),
    sql.indexOf("function public.leave_open_session"),
  );
  const leaveFn = sql.slice(sql.indexOf("function public.leave_open_session"));
  const guard = /coalesce\(\(auth\.jwt\(\)->>'is_anonymous'\)::boolean, false\)/;
  expect(joinFn).toMatch(guard);
  expect(leaveFn).toMatch(guard);
});

test("session_open_preview excludes an anonymous (guest) caller from its WHERE clause", () => {
  // Same guest-role concern as join/leave_open_session, but this is a `language
  // sql` function with no room to raise — an anonymous caller must get zero
  // rows back, exactly like a closed/revoked link, rather than a preview.
  const fn = sql.slice(
    sql.indexOf("function public.session_open_preview"),
    sql.indexOf("function public.join_open_session"),
  );
  expect(fn).toMatch(
    /where\s+s\.id\s*=\s*p_session_id\s+and\s+s\.open_join[\s\S]*?coalesce\(\(auth\.jwt\(\)->>'is_anonymous'\)::boolean, false\) = false/,
  );
});
