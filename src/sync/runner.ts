import NetInfo from "@react-native-community/netinfo";
import { supabase } from "../lib/supabase";
import { getDb } from "../db/db";
import { pushAll, SyncStore, SyncClient } from "./sync";
import { refreshClubs } from "../repos/clubRepo";
import { refreshSessions } from "../repos/sessionRepo";
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
