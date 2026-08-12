import { pushAll, SyncClient, SyncMatchRow, SyncRow, SyncStore } from "../src/sync/sync";

const MATCH_TIME = Date.parse("2026-08-01T10:00:00.000Z");

function makeMatch(id: string): SyncMatchRow {
  return {
    id,
    created_at: MATCH_TIME,
    club_id: "club1",
    session_id: null,
    config: JSON.stringify({ matchType: "doubles" }),
    side_a: JSON.stringify([{ club_player_id: null, name: "A" }]),
    side_b: JSON.stringify([{ club_player_id: null, name: "B" }]),
    status: "completed",
    winner: "A",
    score_summary: JSON.stringify({ games: [{ A: 21, B: 15 }] }),
  };
}

function makeEvents(matchId: string, count: number): SyncRow[] {
  return Array.from({ length: count }, (_, i) => ({
    match_id: matchId,
    seq: i,
    event: JSON.stringify({ type: "RALLY_WON", by: "A", at: i }),
  }));
}

function memoryStore(
  matches: SyncMatchRow[],
  eventsByMatch: Record<string, SyncRow[]>
) {
  const syncedMatches = new Set<string>();
  const syncedUpTo: Record<string, number> = {};
  const store: SyncStore = {
    unsyncedMatches: async () => matches.filter((m) => !syncedMatches.has(m.id)),
    unsyncedEvents: async (id) =>
      (eventsByMatch[id] ?? []).filter((e) => e.seq > (syncedUpTo[id] ?? -1)),
    markMatchSynced: async (id) => {
      syncedMatches.add(id);
    },
    markEventsSynced: async (id, upTo) => {
      syncedUpTo[id] = upTo;
    },
  };
  return { store, syncedMatches, syncedUpTo };
}

function okClient(): SyncClient & { matchCalls: unknown[]; eventCalls: unknown[][] } {
  const c = {
    matchCalls: [] as unknown[],
    eventCalls: [] as unknown[][],
    upsertMatch: async (row: Record<string, unknown>) => {
      c.matchCalls.push(row);
      return { error: null };
    },
    upsertEvents: async (rows: Record<string, unknown>[]) => {
      c.eventCalls.push(rows);
      return { error: null };
    },
  };
  return c;
}

describe("pushAll", () => {
  test("pushes matches then events in seq order and marks synced", async () => {
    const events = makeEvents("m1", 5);
    // shuffle to prove ordering is restored
    const { store, syncedMatches, syncedUpTo } = memoryStore(
      [makeMatch("m1")],
      { m1: [events[3], events[0], events[4], events[1], events[2]] }
    );
    const client = okClient();
    const res = await pushAll(store, client, "user1");

    expect(res).toEqual({ pushedMatches: 1, pushedEvents: 5, failed: [] });
    expect(syncedMatches.has("m1")).toBe(true);
    expect(syncedUpTo.m1).toBe(4);
    const seqs = (client.eventCalls[0] as { seq: number }[]).map((r) => r.seq);
    expect(seqs).toEqual([0, 1, 2, 3, 4]);
    expect((client.matchCalls[0] as { created_by: string }).created_by).toBe("user1");
  });

  // Without this the server row gets `default now()` from whenever the push
  // landed, and the pull writes that back over the true local match time.
  test("pushes the local match time so the server does not stamp its own", async () => {
    const { store } = memoryStore([makeMatch("m1")], { m1: [] });
    const client = okClient();
    await pushAll(store, client, "user1");

    expect((client.matchCalls[0] as { created_at: string }).created_at)
      .toBe("2026-08-01T10:00:00.000Z");
  });

  test("re-running after success pushes nothing (idempotent)", async () => {
    const { store } = memoryStore([makeMatch("m1")], { m1: makeEvents("m1", 3) });
    const client = okClient();
    await pushAll(store, client, "u");
    const res2 = await pushAll(store, client, "u");
    expect(res2).toEqual({ pushedMatches: 0, pushedEvents: 0, failed: [] });
    expect(client.matchCalls).toHaveLength(1);
  });

  test("match upsert failure leaves match and events unsynced for next run", async () => {
    const { store, syncedMatches } = memoryStore([makeMatch("m1")], { m1: makeEvents("m1", 2) });
    let fail = true;
    const client: SyncClient = {
      upsertMatch: async () => ({ error: fail ? new Error("network") : null }),
      upsertEvents: async () => ({ error: null }),
    };
    const res1 = await pushAll(store, client, "u");
    expect(res1.failed).toEqual(["m1"]);
    expect(syncedMatches.has("m1")).toBe(false);

    fail = false;
    const res2 = await pushAll(store, client, "u");
    expect(res2).toEqual({ pushedMatches: 1, pushedEvents: 2, failed: [] });
  });

  test("event push failure keeps match unsynced so events retry", async () => {
    const { store, syncedMatches, syncedUpTo } = memoryStore(
      [makeMatch("m1")], { m1: makeEvents("m1", 2) }
    );
    const client: SyncClient = {
      upsertMatch: async () => ({ error: null }),
      upsertEvents: async () => ({ error: new Error("timeout") }),
    };
    const res = await pushAll(store, client, "u");
    expect(res.failed).toEqual(["m1"]);
    expect(syncedMatches.has("m1")).toBe(false);
    expect(syncedUpTo.m1).toBeUndefined();
  });

  test("one failing match does not block others", async () => {
    const { store } = memoryStore(
      [makeMatch("bad"), makeMatch("good")],
      { bad: makeEvents("bad", 1), good: makeEvents("good", 1) }
    );
    const client: SyncClient = {
      upsertMatch: async (row) => ({ error: row.id === "bad" ? new Error("boom") : null }),
      upsertEvents: async () => ({ error: null }),
    };
    const res = await pushAll(store, client, "u");
    expect(res.failed).toEqual(["bad"]);
    expect(res.pushedMatches).toBe(1);
  });
});
