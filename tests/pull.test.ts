import {
  pullAll, decodeCursor, encodeCursor,
  type PullClient, type PullCursor, type PullEventRow, type PullMatchRow, type PullStore,
  type LocalEventWrite, type LocalMatchWrite,
} from "../src/sync/pull";

function makeRemote(id: string, updatedAt: string, status = "completed"): PullMatchRow {
  return {
    id,
    club_id: "club1",
    session_id: null,
    config: { matchType: "doubles" },
    side_a: [{ club_player_id: null, name: "A" }],
    side_b: [{ club_player_id: null, name: "B" }],
    status,
    winner: "A",
    score_summary: { games: [{ A: 21, B: 15 }] },
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: updatedAt,
  };
}

interface EventCall { ids: string[]; offset: number; limit: number }

/**
 * A harness that really implements the server's contract: matches ordered by
 * (updated_at, id) and returned strictly after the cursor, events ordered by
 * (match_id, seq) and sliced by offset/limit. Anything the paging logic gets
 * wrong shows up as missing rows rather than as a passing test.
 */
function memory(opts: {
  rows?: PullMatchRow[];
  events?: PullEventRow[];
  local?: Record<string, 0 | 1>;
  watermark?: string | null;
  matchError?: unknown;
  eventError?: unknown;
}) {
  const written: LocalMatchWrite[] = [];
  const events: LocalEventWrite[] = [];
  let watermark = opts.watermark ?? null;
  const cursorCalls: (PullCursor | null)[] = [];
  const eventCalls: EventCall[] = [];

  const sortedRows = [...(opts.rows ?? [])].sort((a, b) =>
    a.updated_at === b.updated_at
      ? a.id.localeCompare(b.id)
      : a.updated_at.localeCompare(b.updated_at));

  const sortedEvents = [...(opts.events ?? [])].sort((a, b) =>
    a.match_id === b.match_id ? a.seq - b.seq : a.match_id.localeCompare(b.match_id));

  const after = (r: PullMatchRow, c: PullCursor) =>
    r.updated_at > c.updatedAt || (r.updated_at === c.updatedAt && r.id > c.id);

  const client: PullClient = {
    matchesSince: async (cursor, limit) => {
      cursorCalls.push(cursor);
      if (opts.matchError) return { data: null, error: opts.matchError };
      const eligible = cursor ? sortedRows.filter((r) => after(r, cursor)) : sortedRows;
      return { data: eligible.slice(0, limit), error: null };
    },
    eventsFor: async (ids, offset, limit) => {
      eventCalls.push({ ids, offset, limit });
      if (opts.eventError) return { data: null, error: opts.eventError };
      const set = new Set(ids);
      const matching = sortedEvents.filter((e) => set.has(e.match_id));
      return { data: matching.slice(offset, offset + limit), error: null };
    },
  };

  const store: PullStore = {
    localSyncState: async (ids) => {
      const out: Record<string, 0 | 1> = {};
      for (const id of ids) {
        const v = opts.local?.[id];
        if (v !== undefined) out[id] = v;
      }
      return out;
    },
    replaceMatches: async (rows) => { written.push(...rows); },
    insertEvents: async (rows) => { events.push(...rows); },
    getWatermark: async () => watermark,
    setWatermark: async (v) => { watermark = v; },
  };

  return {
    store, client, written, events, cursorCalls, eventCalls,
    eventIds: () => eventCalls.map((c) => c.ids),
    mark: () => watermark,
  };
}

describe("cursor encoding", () => {
  it("round-trips a composite cursor", () => {
    const c = { updatedAt: "2026-08-02T00:00:00.000Z", id: "8f14e45f-ceea-467a-9f11-3b8f6ac1e111" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("treats a legacy bare timestamp as an empty id so its rows are re-read", () => {
    expect(decodeCursor("2026-08-02T00:00:00.000Z"))
      .toEqual({ updatedAt: "2026-08-02T00:00:00.000Z", id: "" });
  });

  it("treats an absent or empty watermark as no cursor", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });
});

describe("pullAll", () => {
  it("writes a remote match the device has never seen", async () => {
    const m = memory({ rows: [makeRemote("m1", "2026-08-02T00:00:00.000Z")] });
    const result = await pullAll(m.store, m.client);

    expect(result.pulledMatches).toBe(1);
    expect(m.written).toHaveLength(1);
    expect(m.written[0].id).toBe("m1");
  });

  it("serialises json columns as text and created_at as epoch ms", async () => {
    const m = memory({ rows: [makeRemote("m1", "2026-08-02T00:00:00.000Z")] });
    await pullAll(m.store, m.client);

    const row = m.written[0];
    expect(row.config).toBe(JSON.stringify({ matchType: "doubles" }));
    expect(row.score_summary).toBe(JSON.stringify({ games: [{ A: 21, B: 15 }] }));
    expect(row.created_at).toBe(Date.parse("2026-08-01T10:00:00.000Z"));
  });

  it("keeps score_summary null rather than the string \"null\"", async () => {
    const remote = makeRemote("m1", "2026-08-02T00:00:00.000Z", "forfeited");
    remote.score_summary = null;
    const m = memory({ rows: [remote] });
    await pullAll(m.store, m.client);

    expect(m.written[0].score_summary).toBeNull();
  });

  it("replaces a local row that is already synced", async () => {
    const m = memory({
      rows: [makeRemote("m1", "2026-08-02T00:00:00.000Z")],
      local: { m1: 1 },
    });
    const result = await pullAll(m.store, m.client);

    expect(result.pulledMatches).toBe(1);
    expect(m.written.map((r) => r.id)).toEqual(["m1"]);
  });

  it("skips a local row that has not been pushed yet", async () => {
    const m = memory({
      rows: [makeRemote("m1", "2026-08-02T00:00:00.000Z")],
      local: { m1: 0 },
    });
    const result = await pullAll(m.store, m.client);

    expect(result.skipped).toBe(1);
    expect(result.pulledMatches).toBe(0);
    expect(m.written).toEqual([]);
  });

  it("advances the watermark even when all rows in a page are skipped", async () => {
    const m = memory({
      rows: [makeRemote("m1", "2026-08-02T00:00:00.000Z")],
      local: { m1: 0 },
    });
    const result = await pullAll(m.store, m.client);

    expect(result.skipped).toBe(1);
    expect(m.written).toEqual([]);
    expect(m.mark()).toBe("2026-08-02T00:00:00.000Z|m1");
  });

  it("does not request events for a skipped match", async () => {
    const m = memory({
      rows: [makeRemote("m1", "2026-08-02T00:00:00.000Z"), makeRemote("m2", "2026-08-02T00:00:01.000Z")],
      local: { m1: 0 },
      events: [{ match_id: "m1", seq: 0, event: { type: "RALLY_WON" } },
               { match_id: "m2", seq: 0, event: { type: "RALLY_WON" } }],
    });
    await pullAll(m.store, m.client);

    expect(m.eventIds()).toEqual([["m2"]]);
    expect(m.events.map((e) => e.match_id)).toEqual(["m2"]);
  });

  it("serialises pulled events as text", async () => {
    const m = memory({
      rows: [makeRemote("m1", "2026-08-02T00:00:00.000Z")],
      events: [{ match_id: "m1", seq: 3, event: { type: "RALLY_WON", by: "A" } }],
    });
    const result = await pullAll(m.store, m.client);

    expect(result.pulledEvents).toBe(1);
    expect(m.events[0]).toEqual({
      match_id: "m1", seq: 3, event: JSON.stringify({ type: "RALLY_WON", by: "A" }),
    });
  });

  it("pages until a short page comes back, carrying the cursor forward", async () => {
    const m = memory({
      rows: [
        makeRemote("m1", "2026-08-02T00:00:00.000Z"),
        makeRemote("m2", "2026-08-02T00:00:01.000Z"),
        makeRemote("m3", "2026-08-02T00:00:02.000Z"),
      ],
    });
    const result = await pullAll(m.store, m.client, 2);

    expect(result.pulledMatches).toBe(3);
    expect(m.cursorCalls).toEqual([
      null,
      { updatedAt: "2026-08-02T00:00:01.000Z", id: "m2" },
    ]);
    expect(m.mark()).toBe("2026-08-02T00:00:02.000Z|m3");
  });

  // The regression the keyset cursor exists for. 0041's `add column ... default
  // now()` stamps every pre-existing row with one identical updated_at, so a
  // timestamp-only watermark (updated_at > T) skips everything past the page
  // cut, forever.
  it("keeps paging through rows that all share one updated_at", async () => {
    const T = "2026-08-02T00:00:00.000Z";
    const m = memory({
      rows: [
        makeRemote("m1", T), makeRemote("m2", T), makeRemote("m3", T),
        makeRemote("m4", T), makeRemote("m5", T),
      ],
    });
    const result = await pullAll(m.store, m.client, 2);

    expect(result.pulledMatches).toBe(5);
    expect(m.written.map((r) => r.id)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
    expect(m.mark()).toBe(`${T}|m5`);
  });

  it("resumes mid-timestamp from a stored composite cursor", async () => {
    const T = "2026-08-02T00:00:00.000Z";
    const m = memory({
      rows: [makeRemote("m1", T), makeRemote("m2", T), makeRemote("m3", T)],
      watermark: `${T}|m1`,
    });
    const result = await pullAll(m.store, m.client);

    expect(m.cursorCalls[0]).toEqual({ updatedAt: T, id: "m1" });
    expect(result.pulledMatches).toBe(2);
    expect(m.written.map((r) => r.id)).toEqual(["m2", "m3"]);
  });

  it("starts from the stored watermark", async () => {
    const m = memory({ watermark: "2026-08-01T00:00:00.000Z|m0" });
    await pullAll(m.store, m.client);

    expect(m.cursorCalls).toEqual([{ updatedAt: "2026-08-01T00:00:00.000Z", id: "m0" }]);
  });

  // A single .in(ids) fetch is capped server-side, so an unpaged read silently
  // truncates every match's event log and replay produces a wrong scoreline.
  it("pages the event fetch until a short page comes back", async () => {
    const m = memory({
      rows: [makeRemote("m1", "2026-08-02T00:00:00.000Z"), makeRemote("m2", "2026-08-02T00:00:01.000Z")],
      events: [
        { match_id: "m1", seq: 0, event: { n: 0 } },
        { match_id: "m1", seq: 1, event: { n: 1 } },
        { match_id: "m1", seq: 2, event: { n: 2 } },
        { match_id: "m2", seq: 0, event: { n: 3 } },
        { match_id: "m2", seq: 1, event: { n: 4 } },
      ],
    });
    const result = await pullAll(m.store, m.client, 200, 2);

    expect(m.eventCalls.map((c) => c.offset)).toEqual([0, 2, 4]);
    expect(result.pulledEvents).toBe(5);
    expect(m.events.map((e) => `${e.match_id}:${e.seq}`))
      .toEqual(["m1:0", "m1:1", "m1:2", "m2:0", "m2:1"]);
  });

  it("leaves the watermark alone and reports when the match query fails", async () => {
    const err = new Error("offline");
    const m = memory({ watermark: "2026-08-01T00:00:00.000Z|m0", matchError: err });
    const result = await pullAll(m.store, m.client);

    expect(result.pulledMatches).toBe(0);
    expect(result.error).toBe(err);
    expect(m.mark()).toBe("2026-08-01T00:00:00.000Z|m0");
  });

  it("leaves the watermark alone and reports when the event query fails", async () => {
    const err = new Error("offline");
    const m = memory({
      rows: [makeRemote("m1", "2026-08-02T00:00:00.000Z")],
      watermark: null,
      eventError: err,
    });
    const result = await pullAll(m.store, m.client);

    expect(m.mark()).toBeNull();
    expect(result.error).toBe(err);
  });

  it("does nothing at all when there is nothing new", async () => {
    const m = memory({});
    const result = await pullAll(m.store, m.client);

    expect(result).toEqual({ pulledMatches: 0, pulledEvents: 0, skipped: 0 });
    expect(m.written).toEqual([]);
    expect(m.eventCalls).toEqual([]);
  });
});
