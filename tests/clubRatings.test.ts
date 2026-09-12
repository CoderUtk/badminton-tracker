import { listMyClubRatings } from "../src/repos/clubRepo";

jest.mock("../src/lib/supabase", () => ({ supabase: { from: jest.fn() } }));
jest.mock("../src/repos/profileRepo", () => ({ getMyProfile: jest.fn() }));

import { supabase } from "../src/lib/supabase";
import { getMyProfile } from "../src/repos/profileRepo";

const mockedGetMyProfile = getMyProfile as jest.Mock;
const mockedFrom = supabase!.from as jest.Mock;

beforeEach(() => {
  mockedGetMyProfile.mockReset();
  mockedFrom.mockReset();
});

test("returns one rating row per club, mapping the embedded club object", async () => {
  mockedGetMyProfile.mockResolvedValue({ id: "profile-1" });
  mockedFrom.mockReturnValue({
    select: () => ({
      eq: () => Promise.resolve({
        data: [
          { rating: 1512, clubs: { id: "club-a", name: "Alpha" } },
          { rating: 1488, clubs: { id: "club-b", name: "Beta" } },
        ],
        error: null,
      }),
    }),
  });

  const result = await listMyClubRatings();
  expect(result).toEqual([
    { clubId: "club-a", clubName: "Alpha", rating: 1512 },
    { clubId: "club-b", clubName: "Beta", rating: 1488 },
  ]);
});

test("unwraps an array-form embedded club (PostgREST cardinality quirk)", async () => {
  mockedGetMyProfile.mockResolvedValue({ id: "profile-1" });
  mockedFrom.mockReturnValue({
    select: () => ({
      eq: () => Promise.resolve({
        data: [{ rating: 1500, clubs: [{ id: "club-a", name: "Alpha" }] }],
        error: null,
      }),
    }),
  });

  const result = await listMyClubRatings();
  expect(result).toEqual([{ clubId: "club-a", clubName: "Alpha", rating: 1500 }]);
});

test("returns an empty array when signed out", async () => {
  mockedGetMyProfile.mockResolvedValue(null);
  const result = await listMyClubRatings();
  expect(result).toEqual([]);
  expect(mockedFrom).not.toHaveBeenCalled();
});

test("returns an empty array on a query error", async () => {
  mockedGetMyProfile.mockResolvedValue({ id: "profile-1" });
  mockedFrom.mockReturnValue({
    select: () => ({
      eq: () => Promise.resolve({ data: null, error: new Error("network") }),
    }),
  });
  const result = await listMyClubRatings();
  expect(result).toEqual([]);
});
