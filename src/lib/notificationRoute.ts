/**
 * Maps a notification's `data` payload to a route.
 *
 * The payload crosses a process boundary and arrives untyped — it may come
 * from an older build of the app or from a server trigger that has since
 * changed. Every field is checked; anything unrecognised returns null and the
 * tap just opens the app.
 */
export function notificationRoute(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  switch (d.type) {
    case "friend_request":
      return "/(app)/profile/friends";
    case "join_request":
      return typeof d.clubId === "string" && d.clubId
        ? `/(app)/clubs/requests/${d.clubId}`
        : null;
    case "session":
      return typeof d.sessionId === "string" && d.sessionId
        ? `/(app)/sessions/${d.sessionId}`
        : null;
    default:
      return null;
  }
}
