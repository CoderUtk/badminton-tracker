/**
 * Cache for computed lifetime analytics.
 *
 * getPlayerAnalytics reads every match on the device and recomputes ~25
 * aggregates. That answer only changes when the completed-match set changes,
 * so gate it on a cheap aggregate rather than recomputing on every focus.
 *
 * getDb is imported dynamically inside each function rather than at module
 * scope: src/db/db.ts imports Platform from react-native, which the node test
 * environment cannot load. Keeping fingerprintOf free of that import is what
 * lets it be unit tested. src/db/db.ts uses the same technique for expo-sqlite.
 */
import { serializeAnalytics, deserializeAnalytics } from "../analytics/serialize";
import type { PlayerAnalytics } from "../analytics/player";

export type FingerprintInput = { n: number; newest: number; summaryLen: number };

/**
 * The local database, or null when there isn't one.
 *
 * Null covers three cases, all of which mean the same thing here — no cache,
 * compute directly: web (getDb returns null by design), a database that failed
 * to open, and the node test environment, where importing db.ts pulls in
 * react-native and throws. Caching is an optimisation; losing it must never
 * turn into a thrown error on a render path.
 */
async function cacheDb() {
  try {
    const { getDb } = await import("../db/db");
    return await getDb();
  } catch {
    return null;
  }
}

/**
 * `n` and `newest` catch the normal mutation — a match completing raises both.
 * `summaryLen` is a tripwire for a rewrite that changes neither. It is not a
 * hash and does not claim to be; it costs nothing over the same aggregate scan.
 */
export function fingerprintOf(i: FingerprintInput): string {
  return `${i.n}:${i.newest}:${i.summaryLen}`;
}

export async function currentFingerprint(): Promise<string | null> {
  const db = await cacheDb();
  if (!db) return null;
  const row = await db.getFirstAsync<{ n: number; newest: number; summary_len: number }>(
    `select count(*) as n,
            coalesce(max(created_at), 0) as newest,
            coalesce(sum(length(score_summary)), 0) as summary_len
     from matches where status = 'completed'`
  );
  if (!row) return null;
  return fingerprintOf({ n: row.n, newest: row.newest, summaryLen: row.summary_len });
}

export async function readCachedAnalytics(
  name: string, fingerprint: string
): Promise<PlayerAnalytics | null> {
  const db = await cacheDb();
  if (!db) return null;
  const row = await db.getFirstAsync<{ fingerprint: string; payload: string }>(
    "select fingerprint, payload from analytics_cache where name = ?", name
  );
  if (!row || row.fingerprint !== fingerprint) return null;
  // A corrupt payload reads as a miss. Never throw into a render path.
  return deserializeAnalytics(row.payload);
}

export async function writeCachedAnalytics(
  name: string, fingerprint: string, analytics: PlayerAnalytics
): Promise<void> {
  const db = await cacheDb();
  if (!db) return;
  await db.runAsync(
    `insert into analytics_cache (name, fingerprint, payload, computed_at)
     values (?, ?, ?, ?)
     on conflict(name) do update set
       fingerprint = excluded.fingerprint,
       payload = excluded.payload,
       computed_at = excluded.computed_at`,
    name, fingerprint, serializeAnalytics(analytics), Date.now()
  );
}
