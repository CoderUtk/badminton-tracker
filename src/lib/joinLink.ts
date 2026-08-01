/** Path segment for a club join link. Callers wrap it with Linking.createURL. */
export function buildClubJoinPath(clubId: string): string {
  return `join/club/${clubId}`;
}

/**
 * Extract a join target from a deep link. Accepts a full URL with any scheme
 * or a bare path, so the same helper serves Linking callbacks and router
 * segments. Only clubs are supported — tournaments are local-only until
 * tournament cloud sync exists.
 *
 * Parsing strategy: For http/https, strip the authority (host:port) unless it
 * starts with "join" (treated as a subdomain path). For custom schemes, strip
 * scheme + ://. Then look for the "join/club/{id}" pattern in the resulting path.
 */
export function parseJoinTarget(url: string): { kind: "club"; id: string } | null {
  if (!url) return null;
  const withoutQuery = url.split("?")[0].split("#")[0];

  let path = withoutQuery;

  // Handle scheme and authority stripping:
  // - For http/https: strip authority (host:port) unless it starts with "join"
  // - For custom schemes: strip scheme + ://
  const httpsMatch = path.match(/^https?:\/\/([^/]+)\/?(.*)$/);
  if (httpsMatch) {
    const [, authority, pathAfter] = httpsMatch;
    const pathWithSlash = pathAfter ? "/" + pathAfter : "";
    if (authority.split(".")[0] === "join" || authority.split(":")[0] === "join") {
      // Authority starts with "join" subdomain, prepend it
      path = "join" + pathWithSlash;
    } else {
      // Strip authority, keep path
      path = pathAfter;
    }
  } else {
    // Check for custom scheme
    const schemeMatch = path.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.*)$/);
    if (schemeMatch) {
      path = schemeMatch[2];
    }
  }

  const parts = path.split("/").filter(Boolean);

  // Look for first occurrence of "join" followed by "club"
  let at = parts.indexOf("join");
  while (at !== -1) {
    const kind = parts[at + 1];
    const id = parts[at + 2];
    if (kind === "club" && id) {
      return { kind: "club", id };
    }
    at = parts.indexOf("join", at + 1);
  }

  return null;
}
