/** Path segment for a club join link. Callers wrap it with Linking.createURL. */
export function buildClubJoinPath(clubId: string): string {
  return `join/club/${clubId}`;
}

/**
 * Extract a join target from a deep link. Accepts a full URL with any scheme
 * or a bare path, so the same helper serves Linking callbacks and router
 * segments. Only clubs are supported — tournaments are local-only until
 * tournament cloud sync exists.
 */
export function parseJoinTarget(url: string): { kind: "club"; id: string } | null {
  if (!url) return null;
  const withoutQuery = url.split("?")[0].split("#")[0];
  // Drop any scheme + authority, e.g. "badminton://" or "https://example.com".
  // Only remove authority if it contains a dot (looks like a domain).
  const path = withoutQuery.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*\.[^/]*\//, "");
  const parts = path.split("/").filter(Boolean);
  const at = parts.indexOf("join");
  if (at === -1) return null;
  const kind = parts[at + 1];
  const id = parts[at + 2];
  if (kind !== "club" || !id) return null;
  return { kind: "club", id };
}
