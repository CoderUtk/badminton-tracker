import { MATCH_INDEXES_DDL } from "../src/db/schema";

test("indexes the three matches access patterns", () => {
  expect(MATCH_INDEXES_DDL).toMatch(
    /create index if not exists matches_session_created on matches \(session_id, created_at desc\)/
  );
  expect(MATCH_INDEXES_DDL).toMatch(
    /create index if not exists matches_club_created on matches \(club_id, created_at desc\)/
  );
  expect(MATCH_INDEXES_DDL).toMatch(
    /create index if not exists matches_created on matches \(created_at desc\)/
  );
});

test("uses if-not-exists so a re-run is safe", () => {
  const statements = MATCH_INDEXES_DDL.split(";").map((s) => s.trim()).filter(Boolean);
  expect(statements).toHaveLength(3);
  for (const s of statements) expect(s).toMatch(/if not exists/);
});

test("declares no table, only indexes", () => {
  expect(MATCH_INDEXES_DDL).not.toMatch(/create table/i);
  expect(MATCH_INDEXES_DDL).not.toMatch(/alter table/i);
});
