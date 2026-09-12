const prefetch = jest.fn().mockResolvedValue(true);
jest.mock("react-native", () => ({ Image: { prefetch: (u: string) => prefetch(u) } }));

import { avatarMap, preloadAvatars } from "../../src/lib/share/avatars";
import type { ClubPlayer } from "../../src/repos/clubRepo";

function player(id: string, name: string, avatar_url: string | null): ClubPlayer {
  return { id, club_id: "c-1", profile_id: avatar_url ? "p-1" : null, name, avatar_url, rating: 1500 };
}

afterEach(() => prefetch.mockClear());

test("avatarMap keys by player id, not name", () => {
  const map = avatarMap([player("cp-1", "Rahul", "u1"), player("cp-2", "Rahul", "u2")]);
  expect(map).toEqual({ "cp-1": "u1", "cp-2": "u2" });
});

test("avatarMap keeps players with no avatar, mapped to null", () => {
  expect(avatarMap([player("cp-3", "Bob", null)])).toEqual({ "cp-3": null });
});

test("avatarMap of an empty roster is an empty map", () => {
  expect(avatarMap([])).toEqual({});
});

test("preloadAvatars prefetches each real url exactly once", async () => {
  await preloadAvatars(["u1", "u2", "u1"]);
  expect(prefetch).toHaveBeenCalledTimes(2);
});

test("preloadAvatars skips null and undefined without calling prefetch", async () => {
  await preloadAvatars([null, undefined]);
  expect(prefetch).not.toHaveBeenCalled();
});

test("preloadAvatars resolves even when a prefetch rejects", async () => {
  prefetch.mockRejectedValueOnce(new Error("offline"));
  await expect(preloadAvatars(["u1"])).resolves.toBeUndefined();
});
