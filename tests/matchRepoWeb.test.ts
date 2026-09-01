// This suite imports src/repos/matchRepo.web.ts explicitly (jest has no metro
// platform resolution). The existing suite keeps importing "matchRepo" -> .ts.

let mockSupabase: ReturnType<typeof makeFake> | null;
jest.mock("../src/lib/supabase", () => ({
  get supabase() {
    return mockSupabase;
  },
}));

jest.mock("../src/lib/observability", () => ({ captureError: jest.fn() }));

/**
 * Minimal stand-in for the supabase-js query builder. Every chain method
 * returns the same thenable object; the terminal value is `result`. Mutating
 * calls and predicate calls (eq/gt) are pushed to `calls` for assertions.
 */
function makeFake(opts: {
  user?: { id: string } | null;
  row?: any;
  events?: any[];
  error?: { message: string };
}) {
  const calls: any[][] = [];
  const err = opts.error ?? null;
  const build = (result: any) => {
    const p: any = {
      insert: (v: any) => (calls.push(["insert", v]), p),
      upsert: (v: any, o: any) => (calls.push(["upsert", v, o]), p),
      update: (v: any) => (calls.push(["update", v]), p),
      delete: () => (calls.push(["delete"]), p),
      select: () => p,
      eq: (col: string, val: any) => (calls.push(["eq", col, val]), p),
      gt: (col: string, val: any) => (calls.push(["gt", col, val]), p),
      order: () => p,
      limit: () => p,
      maybeSingle: () => Promise.resolve(result),
      then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
    };
    return p;
  };
  return {
    calls,
    auth: { getUser: () => Promise.resolve({ data: { user: opts.user ?? null }, error: null }) },
    from: (table: string) =>
      table === "guest_match_events"
        ? build({ data: err ? null : opts.events ?? [], error: err })
        : build({ data: err ? null : opts.row ?? null, error: err }),
  };
}

import { mapRow, createMatch, loadEvents, getMatch, removeEventsAfter } from "../src/repos/matchRepo.web";
import { captureError } from "../src/lib/observability";
import { defaultConfig } from "../src/engine";

afterEach(() => {
  mockSupabase = null;
  (captureError as jest.Mock).mockClear();
});

test("mapRow converts created_at to epoch ms and passes jsonb through", () => {
  const rec = mapRow({
    id: "m1",
    config: { matchType: "singles" },
    side_a: [{ club_player_id: null, name: "Ann" }],
    side_b: [{ club_player_id: null, name: "Bob" }],
    status: "completed",
    winner: null,
    score_summary: { games: [{ A: 21, B: 15 }] },
    created_at: "2026-09-01T10:00:00.000Z",
  });
  expect(rec.created_at).toBe(Date.parse("2026-09-01T10:00:00.000Z"));
  expect(rec.club_id).toBeNull();
  expect(rec.winner).toBeNull();
  expect(rec.side_a[0].name).toBe("Ann");
  expect(rec.score_summary?.games[0]).toEqual({ A: 21, B: 15 });
});

test("createMatch throws a friendly error when the anon session is not ready", async () => {
  mockSupabase = makeFake({ user: null });
  await expect(
    createMatch(defaultConfig({ matchType: "singles", teams: { A: [{ id: "a0", name: "Ann" }], B: [{ id: "b0", name: "Bob" }] }, pointsToWin: 21, cap: 30, intervalAt: 11, bestOf: 3, firstServer: { team: "A", playerIndex: 0 } }), [], [], null, null)
  ).rejects.toThrow(/signing you in/i);
});

test("createMatch inserts a row with created_by and returns the id", async () => {
  mockSupabase = makeFake({ user: { id: "user-1" } });
  const id = await createMatch(
    defaultConfig({ matchType: "singles", teams: { A: [{ id: "a0", name: "Ann" }], B: [{ id: "b0", name: "Bob" }] }, pointsToWin: 21, cap: 30, intervalAt: 11, bestOf: 3, firstServer: { team: "A", playerIndex: 0 } }),
    [{ club_player_id: null, name: "Ann" }],
    [{ club_player_id: null, name: "Bob" }],
    null,
    null
  );
  expect(typeof id).toBe("string");
  const insert = mockSupabase!.calls.find((c) => c[0] === "insert");
  expect(insert?.[1]).toMatchObject({ id, created_by: "user-1" });
});

test("loadEvents returns the parsed event of each row in seq order", async () => {
  mockSupabase = makeFake({ events: [{ event: { type: "MATCH_STARTED" } }, { event: { type: "POINT" } }] });
  const events = await loadEvents("m1");
  expect(events).toEqual([{ type: "MATCH_STARTED" }, { type: "POINT" }]);
});

test("loadEvents fails soft: returns [] and logs when the query errors", async () => {
  mockSupabase = makeFake({ error: { message: "boom" } });
  expect(await loadEvents("m1")).toEqual([]);
  expect(captureError as jest.Mock).toHaveBeenCalledWith(expect.any(Error), { area: "matchRepo.web" });
});

test("getMatch fails soft: returns null and logs when the query errors", async () => {
  mockSupabase = makeFake({ error: { message: "boom" } });
  expect(await getMatch("m1")).toBeNull();
  expect(captureError as jest.Mock).toHaveBeenCalledWith(expect.any(Error), { area: "matchRepo.web" });
});

test("removeEventsAfter targets the match and only rows past the kept seq", async () => {
  mockSupabase = makeFake({});
  await removeEventsAfter("m1", 7);
  expect(mockSupabase!.calls).toContainEqual(["eq", "match_id", "m1"]);
  expect(mockSupabase!.calls).toContainEqual(["gt", "seq", 7]);
});

// ---- Task 3 ----
import { updateLiveScore, endMatchEarly, listMatches } from "../src/repos/matchRepo.web";
import type { MatchState } from "../src/engine";

/** Bare MatchState good enough for the repo's summary/winner logic. */
function stateFixture(over: Partial<MatchState>): MatchState {
  return {
    phase: "playing",
    score: { A: 0, B: 0 },
    gamesWon: { A: 0, B: 0 },
    gameHistory: [],
    winner: null,
    ...over,
  } as MatchState;
}

test("updateLiveScore writes score_summary and targets live rows only", async () => {
  mockSupabase = makeFake({});
  await updateLiveScore("m1", stateFixture({ score: { A: 5, B: 3 }, gameHistory: [] }));
  const update = mockSupabase!.calls.find((c) => c[0] === "update");
  expect(update?.[1]).toHaveProperty("score_summary");
  expect(update?.[1]).not.toHaveProperty("status");
  expect(mockSupabase!.calls).toContainEqual(["eq", "status", "live"]);
});

test("endMatchEarly falls back to the current game leader when games are level", async () => {
  mockSupabase = makeFake({});
  await endMatchEarly(
    "m1",
    stateFixture({ phase: "playing", score: { A: 15, B: 9 }, gamesWon: { A: 0, B: 0 }, winner: null }),
  );
  const update = mockSupabase!.calls.find((c) => c[0] === "update");
  expect(update?.[1]).toMatchObject({ status: "completed", winner: "A" });
  expect(update?.[1].score_summary.games).toContainEqual({ A: 15, B: 9 });
});

test("listMatches returns [] when the anon session is not ready", async () => {
  mockSupabase = makeFake({ user: null });
  expect(await listMatches()).toEqual([]);
});

test("listMatches scopes the query to the current user", async () => {
  mockSupabase = makeFake({ user: { id: "user-9" }, row: [] });
  await listMatches();
  expect(mockSupabase!.calls).toContainEqual(["eq", "created_by", "user-9"]);
});
