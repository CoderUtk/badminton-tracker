export interface PushTokenRow {
  token: string;
  profile_id: string;
  platform: "ios" | "android";
  updated_at: string;
}

/**
 * push_tokens.platform is `check (platform in ('ios','android'))`. Returning
 * null for anything else keeps a constraint violation out of the insert path.
 */
export function pushTokenRow(
  profileId: string,
  token: string,
  platform: string,
): PushTokenRow | null {
  if (!profileId || !token) return null;
  if (platform !== "ios" && platform !== "android") return null;
  return {
    token,
    profile_id: profileId,
    platform,
    updated_at: new Date().toISOString(),
  };
}
