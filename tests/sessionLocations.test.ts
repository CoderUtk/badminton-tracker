const getAllAsync = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: null }));
jest.mock("../src/db/db", () => ({ getDb: async () => ({ getAllAsync: (...a: unknown[]) => getAllAsync(...a) }) }));

import { getSessionLocations } from "../src/repos/sessionRepo";

beforeEach(() => getAllAsync.mockReset());

test("returns a map of non-empty locations keyed by session id", async () => {
  getAllAsync.mockResolvedValue([
    { id: "s1", location: "Court 5" },
    { id: "s2", location: null },
    { id: "s3", location: "   " },
  ]);
  const map = await getSessionLocations(["s1", "s2", "s3"]);
  expect(map).toEqual(new Map([["s1", "Court 5"]]));
});

test("returns an empty map for an empty id list without querying", async () => {
  const map = await getSessionLocations([]);
  expect(map).toEqual(new Map());
  expect(getAllAsync).not.toHaveBeenCalled();
});
