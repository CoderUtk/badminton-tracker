/**
 * Pull-side counterpart to sync.ts.
 *
 * Sync was push-only for matches, so the local `matches` table only ever held
 * what this device scored. Anyone who joined an existing club saw its
 * leaderboard as empty, because the club screen aggregates that local table
 * (app/(app)/clubs/[id].tsx -> getClubStats -> listMatchesForClub).
 *
 * Two rules make the pull safe to run alongside the push:
 *
 *   - A local match with `synced = 0` is still owed to the server, so its local
 *     copy is newer than anything the server can return. Those are skipped, not
 *     overwritten.
 *   - Local events are inserted with `or ignore` (see PullStore.insertEvents),
 *     so an unsynced local event at some (match_id, seq) always wins over the
 *     server's row at the same key. `match_events` is append-only on both sides.
 *
 * Pure by construction: every read and write arrives through the two interfaces
 * below, because the Jest environment is node and can load neither expo-sqlite
 * nor react-native.
 */

export interface PullMatchRow {
  id: string;
  club_id: string;
  session_id: string | null;
  config: unknown;
  side_a: unknown;
  side_b: unknown;
  status: string;
  winner: string | null;
  score_summary: unknown;
  created_at: string;
  /** The watermark column added in 0041_matches_updated_at.sql. */
  updated_at: string;
}

export interface PullEventRow {
  match_id: string;
  seq: number;
  event: unknown;
}

/** A row shaped for the local `matches` table: json as text, times as epoch ms. */
export interface LocalMatchWrite {
  id: string;
  club_id: string;
  session_id: string | null;
  config: string;
  side_a: string;
  side_b: string;
  status: string;
  winner: string | null;
  score_summary: string | null;
  created_at: number;
}

export interface LocalEventWrite {
  match_id: string;
  seq: number;
  event: string;
}

export interface PullClient {
  /** Rows with updated_at > since, ordered by (updated_at, id), at most `limit`. */
  matchesSince(since: string | null, limit: number): Promise<{ data: PullMatchRow[] | null; error: unknown }>;
  eventsFor(matchIds: string[]): Promise<{ data: PullEventRow[] | null; error: unknown }>;
}

export interface PullStore {
  /** The `synced` flag for each id that exists locally. Absent key = no local row. */
  localSyncState(ids: string[]): Promise<Record<string, 0 | 1>>;
  /** Insert-or-replace, so a re-pulled match picks up its new status/summary. */
  replaceMatches(rows: LocalMatchWrite[]): Promise<void>;
  /** Insert-or-ignore, so a local row at the same (match_id, seq) survives. */
  insertEvents(rows: LocalEventWrite[]): Promise<void>;
  getWatermark(): Promise<string | null>;
  setWatermark(iso: string): Promise<void>;
}

export interface PullResult {
  pulledMatches: number;
  pulledEvents: number;
  /** Remote rows left alone because the local copy was still unsynced. */
  skipped: number;
}

const DEFAULT_PAGE = 200;

function toLocal(row: PullMatchRow): LocalMatchWrite {
  return {
    id: row.id,
    club_id: row.club_id,
    session_id: row.session_id,
    config: JSON.stringify(row.config),
    side_a: JSON.stringify(row.side_a),
    side_b: JSON.stringify(row.side_b),
    status: row.status,
    winner: row.winner,
    // A live match has no summary yet; JSON.stringify(null) would write the
    // four-character string "null", which rowToRecord would then parse into a
    // summary-shaped nothing instead of a real null.
    score_summary: row.score_summary === null || row.score_summary === undefined
      ? null
      : JSON.stringify(row.score_summary),
    created_at: Date.parse(row.created_at),
  };
}

/**
 * Reads every match the caller can see that changed since the stored watermark,
 * writes it and its events locally, then advances the watermark.
 *
 * The watermark only moves after a page has been fully written, so any failure
 * leaves it where it was and the next run re-reads that page. Re-reading is
 * harmless: replaceMatches is idempotent and insertEvents ignores conflicts.
 */
export async function pullAll(
  store: PullStore,
  client: PullClient,
  pageSize: number = DEFAULT_PAGE,
): Promise<PullResult> {
  const result: PullResult = { pulledMatches: 0, pulledEvents: 0, skipped: 0 };
  let since = await store.getWatermark();

  for (;;) {
    const { data, error } = await client.matchesSince(since, pageSize);
    if (error || !data) return result;
    if (data.length === 0) return result;

    const ids = data.map((r) => r.id);
    const local = await store.localSyncState(ids);
    const writable = data.filter((r) => local[r.id] !== 0);
    result.skipped += data.length - writable.length;

    if (writable.length) {
      await store.replaceMatches(writable.map(toLocal));

      const { data: events, error: eErr } = await client.eventsFor(writable.map((r) => r.id));
      // Stop without advancing the watermark: the match rows just written are
      // idempotent, but their events are not there yet, and a replay against a
      // partial log would be wrong. The next run redoes this page.
      if (eErr || !events) return result;
      if (events.length) {
        await store.insertEvents(events.map((e) => ({
          match_id: e.match_id,
          seq: e.seq,
          event: JSON.stringify(e.event),
        })));
        result.pulledEvents += events.length;
      }
      result.pulledMatches += writable.length;
    }

    // data is ordered by updated_at, so the last row carries the page's high
    // water mark. Advance even when every row was skipped: those rows are
    // locally newer, and re-reading them forever would stall the pull.
    since = data[data.length - 1].updated_at;
    await store.setWatermark(since);

    if (data.length < pageSize) return result;
  }
}
