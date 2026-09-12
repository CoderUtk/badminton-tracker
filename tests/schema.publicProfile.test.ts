import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "0052_public_player_profile.sql"),
  "utf8",
);

test("publication is opt-in and defaults off", () => {
  expect(sql).toMatch(/add column if not exists public_profile boolean not null default false/);
});

test("no table policy is loosened -- the only public surface is the function", () => {
  expect(sql).not.toMatch(/create policy/);
  expect(sql).not.toMatch(/drop policy/);
  expect(sql).not.toMatch(/grant select/i);
  // The single deliberate grant to unauthenticated callers.
  expect(sql.match(/to anon/g)).toHaveLength(1);
  expect(sql).toMatch(/grant execute on function public\.public_player_profile\(text\) to anon, authenticated/);
});

test("the reader is security definer with a pinned search_path", () => {
  const fn = sql.slice(sql.indexOf("function public.public_player_profile"), sql.indexOf("revoke all on function public.public_player_profile"));
  expect(fn).toMatch(/security definer/);
  expect(fn).toMatch(/set search_path = public/);
  expect(fn).toMatch(/stable/);
});

test("a private profile is indistinguishable from a missing one", () => {
  const fn = sql.slice(sql.indexOf("function public.public_player_profile"));
  expect(fn).toMatch(/and p\.public_profile;/);
  expect(fn).toMatch(/if v_id is null then return null; end if;/);
});

test("the payload is a fixed whitelist, with no contact details", () => {
  // Bounded to the return statement itself: slicing to end-of-file lets a
  // later function's text satisfy (or break) an assertion about the payload.
  const start = sql.indexOf("return jsonb_build_object");
  const built = sql.slice(start, sql.indexOf(";", start));
  expect(built).toMatch(/'username'/);
  expect(built).toMatch(/'displayName'/);
  expect(built).toMatch(/'avatarUrl'/);
  expect(built).toMatch(/'played'/);
  expect(built).toMatch(/'won'/);
  expect(built).toMatch(/'clubs'/);
  for (const leak of ["email", "phone", "upi", "created_by", "session"]) {
    expect(built.toLowerCase()).not.toContain(leak);
  }
});

test("club data is limited to name, rating and rank", () => {
  const fn = sql.slice(sql.indexOf("select jsonb_agg"), sql.indexOf("return jsonb_build_object"));
  expect(fn).toMatch(/'club', c\.name/);
  expect(fn).toMatch(/'rating', cp\.rating/);
  expect(fn).toMatch(/'rank'/);
  expect(fn).not.toMatch(/cp\.name/);
  expect(fn).not.toMatch(/profile_id,/);
});

test("the anon-facing read is bounded by club, not a full matches scan", () => {
  const fn = sql.slice(sql.indexOf("function public.public_player_profile"));
  // Without this the function is an unauthenticated request amplifier: a
  // sequential scan of matches with a jsonb probe per row, on every call.
  expect(fn).toMatch(/where m\.club_id = any \(v_club_ids\)/);
});

test("a guest session cannot publish a profile", () => {
  const fn = sql.slice(sql.indexOf("function public.set_public_profile"));
  expect(fn).toMatch(/is_anonymous'\)::boolean, false\) then/);
});

test("the owner switch touches only the caller's own row and is authenticated-only", () => {
  const fn = sql.slice(sql.indexOf("function public.set_public_profile"));
  expect(fn).toMatch(/if auth\.uid\(\) is null then/);
  expect(fn).toMatch(/update profiles set public_profile = coalesce\(p_public, false\) where id = auth\.uid\(\)/);
  expect(sql).toMatch(/revoke all on function public\.set_public_profile\(boolean\) from public, anon/);
  expect(sql).toMatch(/grant execute on function public\.set_public_profile\(boolean\) to authenticated/);
});

test("a profile with no username cannot be published", () => {
  expect(sql).toMatch(/Pick a username before making your profile public/);
});
