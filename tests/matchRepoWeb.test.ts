// This suite imports src/repos/matchRepo.web.ts explicitly (jest has no metro
// platform resolution). The existing suite keeps importing "matchRepo" -> .ts.
jest.mock("react-native", () => ({ Platform: { OS: "web" } }));

let mockSupabase: ReturnType<typeof makeFake> | null;
jest.mock("../src/lib/supabase", () => ({
  get supabase() {
    return mockSupabase;
  },
}));

/**
 * Minimal stand-in for the supabase-js query builder. Every chain method
 * returns the same thenable object; the terminal value is `result`. Mutating
 * calls are pushed to `calls` for assertions.
 */
function makeFake(opts: { user?: { id: string } | null; row?: any; events?: any[] }) {
  const calls: any[][] = [];
  const build = (result: any) => {
    const p: any = {
      insert: (v: any) => (calls.push(["insert", v]), p),
      upsert: (v: any, o: any) => (calls.push(["upsert", v, o]), p),
      update: (v: any) => (calls.push(["update", v]), p),
      delete: () => (calls.push(["delete"]), p),
      select: () => p,
      eq: () => p,
      gt: () => p,
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
        ? build({ data: opts.events ?? [], error: null })
        : build({ data: opts.row ?? null, error: null }),
  };
}

import { mapRow, createMatch, loadEvents } from "../src/repos/matchRepo.web";
import { defaultConfig } from "../src/engine";

afterEach(() => {
  mockSupabase = null;
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
