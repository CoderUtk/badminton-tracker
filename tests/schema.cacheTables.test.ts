import { PROFILE_ANALYTICS_CACHE_DDL } from "../src/db/schema";

test("declares the profile cache with a single-row shape", () => {
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(/create table if not exists profile_cache/);
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(/id text primary key/);
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(/display_name_set integer/);
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(/username text/);
});

test("declares the analytics cache keyed by player name", () => {
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(/create table if not exists analytics_cache/);
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(/name text primary key/);
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(/fingerprint text not null/);
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(/payload text not null/);
});

test("is re-runnable", () => {
  const statements = PROFILE_ANALYTICS_CACHE_DDL
    .split(";").map((s: string) => s.trim()).filter(Boolean);
  expect(statements).toHaveLength(2);
  for (const s of statements) expect(s).toMatch(/if not exists/);
});
