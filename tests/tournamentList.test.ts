const from = jest.fn();
const listClubs = jest.fn();

jest.mock("../src/lib/supabase", () => ({ supabase: { from: (...a: unknown[]) => from(...a) } }));
jest.mock("../src/repos/clubRepo", () => ({ listClubs: () => listClubs() }));
// Factory mocks stop the real modules loading at all. Both reach react-native
// or expo-sqlite at module scope, which ts-jest cannot parse in the node env,
// and neither is involved in reading the tournament list.
jest.mock("../src/db/db", () => ({ getDb: async () => null }));
jest.mock("../src/repos/matchRepo", () => ({ createMatch: jest.fn() }));

import { listAllTournaments } from "../src/repos/tournamentRepo";

/** Mimics the postgrest builder chain: .select().in().order() resolves. */
const query = (result: { data?: unknown[]; error?: { message: string } }) => ({
  select: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  order: jest.fn().mockResolvedValue(result),
});

beforeEach(() => { from.mockReset(); listClubs.mockReset(); });

test("returns nothing and never queries when the user has no clubs", async () => {
  listClubs.mockResolvedValue([]);

  expect(await listAllTournaments()).toEqual([]);
  // Load-bearing: .eq("club_id", "") on a uuid column is a Postgres type error,
  // which is how an empty club cache used to render as "No tournaments yet."
  expect(from).not.toHaveBeenCalled();
});

test("spans every club the user belongs to, not just the first", async () => {
  listClubs.mockResolvedValue([
    { id: "c1", name: "Smash Club" },
    { id: "c2", name: "Net Gains" },
  ]);
  const q = query({ data: [{ id: "t1", club_id: "c2", name: "Cup" }] });
  from.mockReturnValue(q);

  const rows = await listAllTournaments();

  expect(q.in).toHaveBeenCalledWith("club_id", ["c1", "c2"]);
  // Row comes from the second club — the case clubs[0] used to hide entirely.
  expect(rows[0].clubName).toBe("Net Gains");
});

test("throws instead of returning an empty list when the read fails", async () => {
  listClubs.mockResolvedValue([{ id: "c1", name: "Smash Club" }]);
  from.mockReturnValue(query({ error: { message: "invalid input syntax for type uuid" } }));

  await expect(listAllTournaments()).rejects.toThrow("invalid input syntax for type uuid");
});
