import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "0047_player_rating.sql"),
  "utf8",
);

test("adds the rated column, defaulting false", () => {
  expect(sql).toMatch(/add column rated\s+boolean not null default false/);
});

test("apply_match_rating is security definer with a pinned search_path", () => {
  const fn = sql.slice(sql.indexOf("function public.apply_match_rating"));
  expect(fn).toMatch(/security definer/);
  expect(fn).toMatch(/set search_path = public/);
});

test("execute is revoked from public, anon, and authenticated", () => {
  expect(sql).toMatch(/revoke execute on function public\.apply_match_rating\(\)\s+from public, anon, authenticated/);
});

test("trigger fires before update, guarded on completed status and not-yet-rated", () => {
  const trigger = sql.slice(sql.indexOf("create trigger matches_apply_rating"));
  expect(trigger).toMatch(/before update on public\.matches/);
  expect(trigger).toMatch(/when \(new\.status = 'completed' and not old\.rated\)/);
});

test("uses the standard ELO expected-score formula", () => {
  expect(sql).toMatch(/1 \/ \(1 \+ power\(10, \(rating_b - rating_a\) \/ 400\)\)/);
});

test("applies the delta symmetrically to both sides in a single update (no deadlock window)", () => {
  expect(sql).toMatch(/set rating = rating \+ case when id = any\(ids_a\) then delta else -delta end/);
  expect(sql).toMatch(/where id = any\(ids_a\) or id = any\(ids_b\)/);
});

test("guards against ids outside the match's club before rating (guest-match fallback)", () => {
  const fn = sql.slice(sql.indexOf("function public.apply_match_rating"));
  expect(fn).toMatch(/cp\.club_id = new\.club_id/);
});

test("empty-array guard is present", () => {
  expect(sql).toMatch(/array_length\(ids_a, 1\) is null/);
});

test("function branches on tg_op to handle INSERT (no old.rated) and UPDATE separately", () => {
  const fn = sql.slice(sql.indexOf("function public.apply_match_rating"));
  expect(fn).toMatch(/if tg_op = 'UPDATE' and old\.rated then/);
});

test("insert trigger fires before insert, guarded on completed status", () => {
  const insertTrigger = sql.slice(sql.indexOf("create trigger matches_apply_rating_insert"));
  expect(insertTrigger).toMatch(/before insert on public\.matches/);
  expect(insertTrigger).toMatch(/when \(new\.status = 'completed'\)/);
});
