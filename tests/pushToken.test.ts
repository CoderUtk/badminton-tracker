import { pushTokenRow } from "../src/lib/pushToken";

test("builds a row for a supported platform", () => {
  const row = pushTokenRow("profile-1", "ExponentPushToken[abc]", "android");
  expect(row).toMatchObject({
    token: "ExponentPushToken[abc]",
    profile_id: "profile-1",
    platform: "android",
  });
  expect(typeof row?.updated_at).toBe("string");
});

test("rejects platforms the check constraint would reject", () => {
  // push_tokens.platform is `check (platform in ('ios','android'))`. Sending
  // anything else is a constraint violation at insert time, so it is caught
  // here instead.
  expect(pushTokenRow("p", "t", "web")).toBeNull();
  expect(pushTokenRow("p", "t", "macos")).toBeNull();
  expect(pushTokenRow("p", "t", "windows")).toBeNull();
});

test("rejects an empty token", () => {
  expect(pushTokenRow("p", "", "ios")).toBeNull();
});

test("rejects an empty profile id", () => {
  expect(pushTokenRow("", "t", "ios")).toBeNull();
});
