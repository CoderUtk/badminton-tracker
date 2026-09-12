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

test("applies the delta symmetrically to both sides", () => {
  expect(sql).toMatch(/set rating = rating \+ delta where id = any\(ids_a\)/);
  expect(sql).toMatch(/set rating = rating - delta where id = any\(ids_b\)/);
});
