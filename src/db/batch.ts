/**
 * Multi-row INSERT helper.
 *
 * refreshClubs and refreshSessions previously issued one runAsync per row, so
 * a club with 200 players cost 200 JS->native bridge crossings and 200
 * statement prepares inside a single transaction. Batching collapses that to
 * one or two statements.
 *
 * SQL assembly is deliberately separated from execution: this file's pure
 * functions are unit tested in the node environment, which cannot load
 * expo-sqlite. Only insertMany touches the database.
 */
import type { SQLiteDatabase } from "expo-sqlite";

/**
 * SQLite's SQLITE_MAX_VARIABLE_NUMBER is 999 on older builds and 32766 on
 * newer ones. Rather than depend on which expo-sqlite ships, budget
 * conservatively — the win is already ~100x at the sizes this app sees.
 */
export const MAX_VARS = 900;

/** How to handle a primary-key/unique collision. "ignore" keeps the row already
 *  in the table — the pull relies on that to never clobber an unsynced local
 *  event with the server's copy of the same (match_id, seq). */
export type ConflictMode = "fail" | "ignore";

export function buildInsert(
  table: string,
  columns: string[],
  rowCount: number,
  conflict: ConflictMode = "fail",
): string {
  if (rowCount < 1) throw new Error("buildInsert requires at least one row");
  if (columns.length < 1) throw new Error("buildInsert requires at least one column");
  const group = `(${columns.map(() => "?").join(", ")})`;
  const groups = Array.from({ length: rowCount }, () => group).join(", ");
  const verb = conflict === "ignore" ? "insert or ignore" : "insert";
  return `${verb} into ${table} (${columns.join(", ")}) values ${groups}`;
}

export function chunkRows<T>(rows: T[], columnsPerRow: number): T[][] {
  if (rows.length === 0) return [];
  // Floor at 1 so a pathologically wide row still makes progress rather than
  // looping forever on a zero-length chunk.
  const size = Math.max(1, Math.floor(MAX_VARS / Math.max(1, columnsPerRow)));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Inserts every row in as few statements as the variable budget allows.
 *
 * Deliberately does NOT open a transaction: callers already run inside one,
 * and nesting transactions in expo-sqlite surfaces as "cannot rollback - no
 * transaction is active", which hides the error that actually caused it.
 */
export async function insertMany(
  db: SQLiteDatabase,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflict: ConflictMode = "fail",
): Promise<void> {
  if (rows.length === 0) return;
  for (const chunk of chunkRows(rows, columns.length)) {
    await db.runAsync(
      buildInsert(table, columns, chunk.length, conflict),
      ...(chunk.flat() as never[]),
    );
  }
}
