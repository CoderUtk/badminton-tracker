import { rosterCacheRow } from "../src/repos/clubRepo";

test("flattens an embedded profile avatar into the cache row", () => {
  expect(rosterCacheRow({
    id: "cp-1", club_id: "c-1", profile_id: "p-1", name: "Rahul", rating: 1500,
    profiles: { avatar_url: "https://example.test/a.jpg" },
  })).toEqual(["cp-1", "c-1", "p-1", "Rahul", "https://example.test/a.jpg", 1500]);
});

test("accepts the embedded profile arriving as a single-element array", () => {
  expect(rosterCacheRow({
    id: "cp-1", club_id: "c-1", profile_id: "p-1", name: "Rahul", rating: 1500,
    profiles: [{ avatar_url: "https://example.test/a.jpg" }],
  })[4]).toBe("https://example.test/a.jpg");
});

test("a roster-only player with no linked profile caches a null avatar", () => {
  expect(rosterCacheRow({
    id: "cp-2", club_id: "c-1", profile_id: null, name: "Guest Bob", rating: 1500, profiles: null,
  })[4]).toBeNull();
});

test("a linked profile that has not set an avatar caches null", () => {
  expect(rosterCacheRow({
    id: "cp-3", club_id: "c-1", profile_id: "p-3", name: "Sameer", rating: 1500,
    profiles: { avatar_url: null },
  })[4]).toBeNull();
});

test("a missing profiles key caches null rather than undefined", () => {
  const row = rosterCacheRow({ id: "cp-4", club_id: "c-1", profile_id: "p-4", name: "Anil", rating: 1500 });
  expect(row[4]).toBeNull();
});

test("carries the player's rating through to the cache row", () => {
  const row = rosterCacheRow({ id: "cp-5", club_id: "c-1", profile_id: "p-5", name: "Divya", rating: 1620 });
  expect(row[5]).toBe(1620);
});
