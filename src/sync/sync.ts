/**
 * Push-based sync of the local event log to Supabase.
 *
 * The remote log is append-only and keyed on (match_id, seq), so pushes are
 * idempotent: re-sending an already-synced row conflicts on the PK and is
 * ignored. Rows are pushed in seq order per match; a failure stops that match
 * and leaves the rest of its rows unsynced for the next run.
 */

export interface SyncRow {
  match_id: string;
  seq: number;
  event: string;
}

export interface SyncMatchRow {
  id: string;
  club_id: string | null;
  session_id: string | null;
  config: string;
  side_a: string;
  side_b: string;
  status: string;
  winner: string | null;
  score_summary: string | null;
}

/** Minimal surface of the Supabase client that sync needs — mockable in tests. */
export interface SyncClient {
  upsertMatch(row: Record<string, unknown>): Promise<{ error: unknown }>;
  upsertEvents(rows: Record<string, unknown>[]): Promise<{ error: unknown }>;
}

export interface SyncStore {
  unsyncedMatches(): Promise<SyncMatchRow[]>;
  unsyncedEvents(matchId: string): Promise<SyncRow[]>;
  markMatchSynced(matchId: string): Promise<void>;
  markEventsSynced(matchId: string, upToSeq: number): Promise<void>;
}

export interface SyncResult {
  pushedMatches: number;
  pushedEvents: number;
  failed: string[]; // match ids that could not be fully pushed
}

export async function pushAll(
  store: SyncStore,
  client: SyncClient,
  userId: string
): Promise<SyncResult> {
  const result: SyncResult = { pushedMatches: 0, pushedEvents: 0, failed: [] };
  const matches = await store.unsyncedMatches();
  for (const m of matches) {
    const { error: mErr } = await client.upsertMatch({
      id: m.id,
      club_id: m.club_id,
      session_id: m.session_id,
      config: JSON.parse(m.config),
      side_a: JSON.parse(m.side_a),
      side_b: JSON.parse(m.side_b),
      status: m.status,
      winner: m.winner,
      score_summary: m.score_summary ? JSON.parse(m.score_summary) : null,
      created_by: userId,
    });
    if (mErr) {
      result.failed.push(m.id);
      continue;
    }
    const events = await store.unsyncedEvents(m.id);
    const sorted = [...events].sort((a, b) => a.seq - b.seq);
    if (sorted.length) {
      const { error: eErr } = await client.upsertEvents(
        sorted.map((e) => ({ match_id: e.match_id, seq: e.seq, event: JSON.parse(e.event) }))
      );
      if (eErr) {
        result.failed.push(m.id);
        continue;
      }
      await store.markEventsSynced(m.id, sorted[sorted.length - 1].seq);
      result.pushedEvents += sorted.length;
    }
    await store.markMatchSynced(m.id);
    result.pushedMatches++;
  }
  return result;
}
