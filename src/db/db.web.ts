import type { SQLiteDatabase } from "expo-sqlite";

/**
 * Web build of getDb. Metro resolves this file instead of db.ts on web, which
 * keeps expo-sqlite (and its wasm asset) out of the web bundle entirely —
 * a runtime `Platform.OS === "web"` check in db.ts isn't enough because
 * `await import("expo-sqlite")` still gets statically bundled by Metro.
 */
export async function getDb(): Promise<SQLiteDatabase | null> {
  return null;
}
