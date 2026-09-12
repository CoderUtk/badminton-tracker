import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "0049_match_rating_delta.sql"),
  "utf8",
);

test("adds a nullable rating_delta column, re-runnably", () => {
  expect(sql).toMatch(/add column if not exists rating_delta int/);
});

test("records the delta actually applied to side A", () => {
  expect(sql).toMatch(/new\.rating_delta := delta::int/);
});

test("leaves the delta null on every unrated path", () => {
  // Both early returns that mark a match rated without touching any rating.
  expect(sql.match(/new\.rating_delta := null/g)).toHaveLength(2);
});

test("keeps 0047's security posture", () => {
  const fn = sql.slice(sql.indexOf("function public.apply_match_rating"));
  expect(fn).toMatch(/security definer/);
  expect(fn).toMatch(/set search_path = public/);
  expect(sql).toMatch(/revoke execute on function public\.apply_match_rating\(\)\s+from public, anon, authenticated/);
});

test("keeps 0047's club-scope guard on every cited player", () => {
  expect(sql).toMatch(/cp\.club_id = new\.club_id/);
});

test("keeps the single symmetric rating update", () => {
  expect(sql).toMatch(/set rating = rating \+ case when id = any\(ids_a\) then delta else -delta end/);
});
