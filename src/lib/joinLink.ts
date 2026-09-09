/** Path segment for a club join link. Callers wrap it with Linking.createURL. */
export function buildClubJoinPath(clubId: string): string {
  return `join/club/${clubId}`;
}

export function buildTournamentJoinPath(tournamentId: string): string {
  return `join/tournament/${tournamentId}`;
}

export function buildTournamentScorerJoinPath(tournamentId: string): string {
  return `join/tournament/${tournamentId}/scorer`;
}

export function buildTournamentSpectatorJoinPath(tournamentId: string): string {
  return `join/tournament/${tournamentId}/spectator`;
}

export function buildSessionJoinPath(sessionId: string): string {
  return `join/session/${sessionId}`;
}

export type JoinRole = "player" | "scorer" | "spectator";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract a join target from a deep link. Accepts a full URL with any scheme
 * or a bare path, so the same helper serves Linking callbacks and router
 * segments.
 *
 * Parsing strategy: For http/https, strip the authority (host:port) unless it
 * starts with "join" (treated as a subdomain path). For custom schemes, strip
 * scheme + ://. Then look for the "join/club/{id}" or "join/tournament/{id}" pattern.
 */
export function parseJoinTarget(
  url: string,
): { kind: "club" | "tournament" | "session"; id: string; role: JoinRole } | null {
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

  // Look for first occurrence of "join" followed by "club", "tournament", or "session"
  let at = parts.indexOf("join");
  while (at !== -1) {
    const kind = parts[at + 1];
    const id = parts[at + 2];
    if ((kind === "club" || kind === "tournament" || kind === "session") && id) {
      // reject unresolved route placeholders like "[id]" and anything containing
      // brackets — a real target is always a concrete id, never a route param name.
      if (id.includes("[") || id.includes("]")) return null;
      // Sessions have no sub-roles: a slot is a slot. Any trailing segment is
      // ignored rather than parsed, so a mangled link still resolves.
      const role: JoinRole = kind === "session"
        ? "player"
        : parts[at + 3] === "scorer" ? "scorer"
        : parts[at + 3] === "spectator" ? "spectator"
        : "player";
      return { kind, id, role };
    }
    at = parts.indexOf("join", at + 1);
  }

  // No "join/..." segment found. A bare tournament id (pasted straight from
  // the guest spectate screen, no link wrapper) is still a valid target.
  if (parts.length === 1 && UUID_RE.test(parts[0])) {
    return { kind: "tournament", id: parts[0], role: "player" };
  }

  return null;
}

/** In-app route for a parsed join target — the single place that maps a role to its route suffix. */
export function joinRouteFor(target: { kind: "club" | "tournament" | "session"; id: string; role: JoinRole }): string {
  const suffix = target.role === "scorer" ? "/scorer" : target.role === "spectator" ? "/spectator" : "";
  return `/join/${target.kind}/${target.id}${suffix}`;
}
