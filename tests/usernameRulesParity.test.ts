import fs from "fs";
import path from "path";

import { validateUsername, MIN_USERNAME, MAX_USERNAME } from "../src/lib/validate";

/**
 * Guards the one seam this feature has no other protection for: the username
 * rules exist twice, once in Postgres (public.is_valid_username) and once in
 * src/lib/validate.ts. The SQL side is the authority; the TypeScript side only
 * spares a network round-trip. Nothing but a comment currently stops the two
 * from drifting apart, and drift is silent — the client would start accepting
 * handles the server rejects, and the user would see a confusing failure only
 * after hitting Save.
 *
 * Rather than duplicating the rules a third time here, this reads them out of
 * the migration that actually defines the function and checks that
 * validateUsername agrees on a corpus of inputs.
 *
 * Comparison happens on already-normalised inputs (lowercase, trimmed).
 * validateUsername normalises internally; on the server, set_username lowers
 * and trims before calling is_valid_username. So the two are only meant to
 * agree at the normalised layer, and that is what the corpus exercises.
 */

const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

/**
 * The newest migration defining is_valid_username. Reading the newest rather
 * than hardcoding 0029 is the point: if a later migration redefines the
 * function, this test follows it instead of silently checking a stale copy.
 */
function latestIsValidUsernameSource(): { file: string; sql: string } {
  const defining = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) =>
      fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8").includes("function public.is_valid_username"),
    );

  if (defining.length === 0) {
    throw new Error("No migration defines public.is_valid_username — did the function get renamed?");
  }
  const file = defining[defining.length - 1];
  return { file, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8") };
}

const { file: sourceFile, sql: sourceSql } = latestIsValidUsernameSource();

/** The regex literal from `p ~ '...'`. */
function extractPattern(sql: string): string {
  const m = sql.match(/p\s*~\s*'([^']+)'/);
  if (!m) throw new Error(`Could not find the regex in ${sourceFile} — has is_valid_username changed shape?`);
  return m[1];
}

/** The quoted words from `p not in ( ... )`. */
function extractReserved(sql: string): string[] {
  const block = sql.match(/p\s+not\s+in\s*\(([\s\S]*?)\)/);
  if (!block) throw new Error(`Could not find the reserved list in ${sourceFile} — has is_valid_username changed shape?`);
  const words = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (words.length === 0) throw new Error(`Reserved list in ${sourceFile} parsed as empty`);
  return words;
}

const sqlPattern = extractPattern(sourceSql);
const sqlReserved = extractReserved(sourceSql);
// The pattern is written in POSIX ARE but uses only constructs JS shares
// (anchors, classes, bounded repetition, non-capturing groups), so it can be
// evaluated directly. A future pattern using an ARE-only construct would throw
// here rather than pass quietly.
const sqlRe = new RegExp(sqlPattern);

/** What the server would say about an already-normalised candidate. */
function sqlAccepts(candidate: string): boolean {
  return sqlRe.test(candidate) && !sqlReserved.includes(candidate);
}

function clientAccepts(candidate: string): boolean {
  return validateUsername(candidate) === null;
}

// Extraction is the part that fails silently if the migration's shape changes,
// so assert it found something plausible before trusting any comparison below.
test("the migration's rules were actually extracted", () => {
  expect(sqlPattern.length).toBeGreaterThan(0);
  expect(sqlReserved).toContain("admin");
  expect(sqlReserved.length).toBeGreaterThanOrEqual(5);
});

test("the TS length constants match the bounds the SQL pattern encodes", () => {
  expect(sqlRe.test("a".repeat(MIN_USERNAME))).toBe(true);
  expect(sqlRe.test("a".repeat(MAX_USERNAME))).toBe(true);
  expect(sqlRe.test("a".repeat(MIN_USERNAME - 1))).toBe(false);
  expect(sqlRe.test("a".repeat(MAX_USERNAME + 1))).toBe(false);
});

test("every word the SQL reserves is reserved on the client too", () => {
  for (const word of sqlReserved) {
    expect(clientAccepts(word)).toBe(false);
    // A reserved word that is otherwise well-formed must be rejected *as
    // reserved*, not as malformed — otherwise adding a word to the SQL list
    // alone would go unnoticed here.
    if (sqlRe.test(word)) {
      expect(validateUsername(word)).toBe("That username is reserved");
    }
  }
});

test("client and SQL agree on every candidate in the corpus", () => {
  const corpus = [
    "",
    ...Array.from({ length: 23 }, (_, n) => "a".repeat(n)),
    "abc",
    "a_b",
    "a__b",
    "_ab",
    "ab_",
    "___",
    "a-b",
    "a b",
    "a!b",
    "a.b",
    "ab1",
    "1ab",
    "0_0",
    "9".repeat(20),
    `_${"a".repeat(19)}`,
    `${"a".repeat(19)}_`,
    ...sqlReserved,
  ];

  const disagreements = corpus
    .filter((c) => sqlAccepts(c) !== clientAccepts(c))
    .map((c) => `${JSON.stringify(c)}: SQL ${sqlAccepts(c) ? "accepts" : "rejects"}, client ${clientAccepts(c) ? "accepts" : "rejects"}`);

  expect(disagreements).toEqual([]);
});
