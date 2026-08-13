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
 * ONLY FINISHED MATCHES ARE PULLED. The client query filters
 * `status in ('completed', 'forfeited')` (see runner.ts). The local `matches`
 * table is the device's own scoring state: app/(app)/matches/index.tsx offers
 * Resume and End match for any `status = 'live'` row. A live match pulled from
 * another device would therefore be resumable here, appending events at
 * `seq = events.length` and forking the log against the owning device, and
 * ending it would set `synced = 0` on a row this user did not create, which
 * `pushAll` then upserts with `created_by = userId` — rejected forever by the
 * "creator updates own match" RLS policy. Excluding live rows removes the
 * hazard entirely; a match that finishes later is pulled when its `updated_at`
 * bumps.
 *
 * Paging uses a keyset cursor on the composite key `(updated_at, id)`, not a
 * bare `updated_at > since`. Rows can share a timestamp — in fact every row
 * that existed when 0041_matches_updated_at.sql ran shares one, because
 * `add column ... default now()` stores a single value for all of them — so a
 * timestamp-only watermark drops every row past the page cut at that timestamp,
 * permanently. See PullCursor.
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

/**
 * Where the last pull stopped, as a point in the total order `(updated_at, id)`.
 * The next page is everything strictly after it:
 *
 *   updated_at > updatedAt or (updated_at = updatedAt and id > id)
 *
 * Stored as one settings string, `${updatedAt}|${id}` — see encodeCursor. The
 * split is on the FIRST "|", which is unambiguous because neither an ISO 8601
 * timestamp nor a uuid can contain that character.
 */
export interface PullCursor {
  /** ISO 8601 value of matches.updated_at for the last row written. */
  updatedAt: string;
  /** matches.id of that row — the tiebreak within one updated_at. */
  id: string;
}

export interface PullClient {
  /**
   * Finished matches strictly after `cursor` in `(updated_at, id)` order,
   * ordered the same way, at most `limit`. A null cursor means "from the start".
   */
  matchesSince(
    cursor: PullCursor | null,
    limit: number,
  ): Promise<{ data: PullMatchRow[] | null; error: unknown }>;
  /**
   * Events for the given match ids, ordered by `(match_id, seq)`, skipping the
   * first `offset` rows and returning at most `limit`. The ordering must be by
   * the composite key: ordering by `seq` alone interleaves matches, so a capped
   * response returns the low seqs of every match and truncates each log.
   */
  eventsFor(
    matchIds: string[],
    offset: number,
    limit: number,
  ): Promise<{ data: PullEventRow[] | null; error: unknown }>;
}

/** What's known locally about one match id: its `synced` flag and its local `created_at` (epoch ms). */
export interface LocalMatchState {
  synced: 0 | 1;
  createdAt: number;
}

export interface PullStore {
  /**
   * Local state for each id that exists locally. Absent key = no local row.
   *
   * `createdAt` is the device's own `created_at` for that row. A row this
   * device has already seen keeps that value forever: the server's
   * `created_at` for an old row is only the time it happened to sync, not the
   * time it was played (see SyncMatchRow.created_at in sync.ts), so pull.ts
   * substitutes this value back in rather than trusting the server's column
   * for a row that already exists locally.
   */
  localSyncState(ids: string[]): Promise<Record<string, LocalMatchState>>;
  /** Insert-or-replace, so a re-pulled match picks up its new status/summary. */
  replaceMatches(rows: LocalMatchWrite[]): Promise<void>;
  /** Insert-or-ignore, so a local row at the same (match_id, seq) survives. */
  insertEvents(rows: LocalEventWrite[]): Promise<void>;
  /** The encoded cursor from the last completed page, or null on a fresh device. */
  getWatermark(): Promise<string | null>;
  setWatermark(encodedCursor: string): Promise<void>;
}

export interface PullResult {
  pulledMatches: number;
  pulledEvents: number;
  /** Remote rows left alone because the local copy was still unsynced. */
  skipped: number;
  /**
   * Set when the pull stopped early because a query failed. pull.ts has no
   * imports and so cannot report it; runner.ts routes this into captureError.
   */
  error?: unknown;
}

const DEFAULT_PAGE = 200;
/**
 * Hosted Supabase caps a response at 1000 rows by default, and a capped page is
 * indistinguishable from a complete one, so the event fetch pages explicitly.
 */
const DEFAULT_EVENT_PAGE = 500;

/** `${updatedAt}|${id}` — see PullCursor for why the separator is unambiguous. */
export function encodeCursor(cursor: PullCursor): string {
  return `${cursor.updatedAt}|${cursor.id}`;
}

/**
 * Inverse of encodeCursor. A stored value with no "|" is a pre-keyset watermark
 * (a bare timestamp); it decodes with an empty id, which sorts before every
 * uuid, so the rows at that timestamp are re-read rather than skipped.
 */
export function decodeCursor(raw: string | null): PullCursor | null {
  if (raw === null || raw === "") return null;
  const cut = raw.indexOf("|");
  if (cut < 0) return { updatedAt: raw, id: "" };
  return { updatedAt: raw.slice(0, cut), id: raw.slice(cut + 1) };
}

/**
 * `localCreatedAt` is set only when this device already has a local row for
 * `row.id` (see LocalMatchState.createdAt) — in that case the local value
 * wins over the server's `created_at`, which for an already-synced row is
 * just the time it happened to sync, not the time it was played.
 */
function toLocal(row: PullMatchRow, localCreatedAt: number | undefined): LocalMatchWrite {
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
    created_at: localCreatedAt ?? Date.parse(row.created_at),
  };
}

/**
 * Every event for `ids`, paging until a short page comes back. Returns null on
 * the first error, so the caller can leave the watermark where it is.
 */
async function fetchAllEvents(
  client: PullClient,
  ids: string[],
  eventPageSize: number,
): Promise<{ rows: PullEventRow[] | null; error: unknown }> {
  const all: PullEventRow[] = [];
  for (let offset = 0; ; offset += eventPageSize) {
    const { data, error } = await client.eventsFor(ids, offset, eventPageSize);
    if (error || !data) return { rows: null, error: error ?? new Error("pull: no event data") };
    all.push(...data);
    if (data.length < eventPageSize) return { rows: all, error: null };
  }
}

/**
 * Reads every finished match the caller can see that changed since the stored
 * cursor, writes it and its events locally, then advances the cursor.
 *
 * The cursor only moves after a page has been fully written, so any failure
 * leaves it where it was and the next run re-reads that page. Re-reading is
 * harmless: replaceMatches is idempotent and insertEvents ignores conflicts.
 */
export async function pullAll(
  store: PullStore,
  client: PullClient,
  pageSize: number = DEFAULT_PAGE,
  eventPageSize: number = DEFAULT_EVENT_PAGE,
): Promise<PullResult> {
  const result: PullResult = { pulledMatches: 0, pulledEvents: 0, skipped: 0 };
  let cursor = decodeCursor(await store.getWatermark());

  for (;;) {
    const { data, error } = await client.matchesSince(cursor, pageSize);
    if (error || !data) {
      result.error = error ?? new Error("pull: no match data");
      return result;
    }
    if (data.length === 0) return result;

    const ids = data.map((r) => r.id);
    const local = await store.localSyncState(ids);
    const writable = data.filter((r) => local[r.id]?.synced !== 0);
    result.skipped += data.length - writable.length;

    if (writable.length) {
      await store.replaceMatches(
        writable.map((r) => toLocal(r, local[r.id]?.createdAt)),
      );

      const { rows: events, error: eErr } = await fetchAllEvents(
        client, writable.map((r) => r.id), eventPageSize,
      );
      // Stop without advancing the cursor: the match rows just written are
      // idempotent, but their events are not there yet, and a replay against a
      // partial log would be wrong. The next run redoes this page.
      if (eErr || !events) {
        result.error = eErr;
        return result;
      }
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

    // data is ordered by (updated_at, id), so the last row is the page's high
    // water mark in that same order. Advance even when every row was skipped:
    // those rows are locally newer, and re-reading them forever would stall the
    // pull.
    const last = data[data.length - 1];
    cursor = { updatedAt: last.updated_at, id: last.id };
    await store.setWatermark(encodeCursor(cursor));

    if (data.length < pageSize) return result;
  }
}
