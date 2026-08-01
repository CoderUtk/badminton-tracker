/**
 * A deep link tapped while signed out. The root Gate redirects to sign-in and
 * would otherwise drop the destination, so it parks here and is replayed once
 * after authentication. In-memory only: a cold start delivers the URL again
 * through Linking.getInitialURL, so nothing needs to persist.
 */
let pending: string | null = null;

export function setPendingLink(path: string): void {
  pending = path;
}

/** Read and clear the pending path. Single-use so a link never replays twice. */
export function consumePendingLink(): string | null {
  const value = pending;
  pending = null;
  return value;
}
