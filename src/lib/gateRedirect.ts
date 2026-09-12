/**
 * Route prefixes an anonymous (guest) Supabase session may stay on. Gate
 * redirects any anonymous session outside these to /guest. Kept as a pure
 * function of route segments (expo-router's useSegments() shape) so it's
 * testable without rendering the router.
 */
export function isGuestAllowedSegments(segments: string[]): boolean {
  if (segments[0] === "guest") return true;
  // Public player pages (0052). The whole point is that anyone can open one,
  // and a guest bounced to /guest would never see a link someone shared.
  if (segments[0] === "u") return true;
  if (segments[0] === "new-match") return true;
  if (segments[0] === "score") return true;
  if (segments[0] === "join" && segments[1] === "tournament" && segments[3] === "spectator") return true;
  return false;
}
