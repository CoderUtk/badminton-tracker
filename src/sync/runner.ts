import NetInfo from "@react-native-community/netinfo";
import { supabase } from "../lib/supabase";
import { getDb } from "../db/db";
import { pushAll, SyncStore, SyncClient } from "./sync";
import { pullAll, type LocalEventWrite, type LocalMatchWrite, type PullClient, type PullEventRow, type PullMatchRow, type PullStore } from "./pull";
import { insertMany } from "../db/batch";
import { refreshClubs } from "../repos/clubRepo";
import { refreshSessions } from "../repos/sessionRepo";
import { getSetting, setSetting, MATCH_PULL_KEY } from "../repos/settingsRepo";
import { captureError } from "../lib/observability";

let running = false;

/** SyncStore backed by the local SQLite database. */
async function sqliteStore(): Promise<SyncStore | null> {
  const db = await getDb();
  if (!db) return null;
  return {
    unsyncedMatches: () =>
      db.getAllAsync("select * from matches where synced = 0 and club_id is not null"),
    unsyncedEvents: (matchId) =>
      db.getAllAsync(
        "select match_id, seq, event from match_events where match_id = ? and synced = 0 order by seq",
        matchId
      ),
    markMatchSynced: async (matchId) => {
      await db.runAsync("update matches set synced = 1 where id = ?", matchId);
    },
    markEventsSynced: async (matchId, upToSeq) => {
      await db.runAsync(
        "update match_events set synced = 1 where match_id = ? and seq <= ?",
        matchId, upToSeq
      );
    },
  };
}

const MATCH_COLS = [
  "id", "club_id", "session_id", "config", "side_a", "side_b",
  "status", "winner", "score_summary", "created_at", "synced",
];

/** PullStore backed by the local database. Mirrors sqliteStore's shape. */
async function sqlitePullStore(): Promise<PullStore | null> {
  const db = await getDb();
  if (!db) return null;
  return {
    localSyncState: async (ids) => {
      if (ids.length === 0) return {};
      const holes = ids.map(() => "?").join(", ");
      const rows = await db.getAllAsync<{ id: string; synced: number }>(
        `select id, synced from matches where id in (${holes})`,
        ...(ids as never[]),
      );
      const out: Record<string, 0 | 1> = {};
      for (const r of rows) out[r.id] = r.synced ? 1 : 0;
      return out;
    },
    replaceMatches: async (rows: LocalMatchWrite[]) => {
      // synced = 1: these rows came FROM the server, so pushAll must not pick
      // them back up. `insert or replace` rather than `or ignore` because a
      // re-pulled match brings a newer status/winner/score_summary.
      await db.withTransactionAsync(async () => {
        for (const r of rows) {
          await db.runAsync(
            `insert or replace into matches (${MATCH_COLS.join(", ")})
             values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            r.id, r.club_id, r.session_id, r.config, r.side_a, r.side_b,
            r.status, r.winner, r.score_summary, r.created_at,
          );
        }
      });
    },
    insertEvents: async (rows: LocalEventWrite[]) => {
      await db.withTransactionAsync(async () => {
        await insertMany(
          db, "match_events", ["match_id", "seq", "event", "synced"],
          rows.map((r) => [r.match_id, r.seq, r.event, 1]),
          "ignore",
        );
      });
    },
    getWatermark: () => getSetting(MATCH_PULL_KEY),
    setWatermark: (iso) => setSetting(MATCH_PULL_KEY, iso),
  };
}

export async function syncNow(): Promise<void> {
  if (running || !supabase) return;
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return;
  const store = await sqliteStore();
  if (!store) return;
  running = true;
  try {
    const client: SyncClient = {
      upsertMatch: async (row) =>
        supabase!.from("matches").upsert(row, { onConflict: "id" }),
      upsertEvents: async (rows) =>
        supabase!.from("match_events").upsert(rows, { onConflict: "match_id,seq", ignoreDuplicates: true }),
    };
    await pushAll(store, client, user.id);

    // Pull after push so a match this device just scored is already on the
    // server (and marked synced = 1 locally) before the pull looks at it.
    const pullStore = await sqlitePullStore();
    if (pullStore) {
      const pullClient: PullClient = {
        matchesSince: async (since, limit) => {
          let q = supabase!
            .from("matches")
            .select("id, club_id, session_id, config, side_a, side_b, status, winner, score_summary, created_at, updated_at")
            .order("updated_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(limit);
          if (since) q = q.gt("updated_at", since);
          const { data, error } = await q;
          return { data: (data as PullMatchRow[] | null), error };
        },
        eventsFor: async (matchIds) => {
          const { data, error } = await supabase!
            .from("match_events")
            .select("match_id, seq, event")
            .in("match_id", matchIds)
            .order("seq", { ascending: true });
          return { data: (data as PullEventRow[] | null), error };
        },
      };
      await pullAll(pullStore, pullClient);
    }

    await refreshClubs();
    await refreshSessions();
  } catch (e) {
    captureError(e, { area: "sync" });
    throw e;
  } finally {
    running = false;
  }
}

/** Sync when connectivity returns. Call once at app start. */
export function startSyncListener(): () => void {
  const unsub = NetInfo.addEventListener((s) => {
    if (s.isConnected) void syncNow();
  });
  void syncNow();
  return unsub;
}
