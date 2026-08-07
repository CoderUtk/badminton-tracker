export const MAX_NAME = 50;

/**
 * Validate a user-supplied name. Returns an error message, or null when valid.
 *
 * `requireLetter` additionally rejects names with no letter at all ("123",
 * "..."), used for player display names. It matches any Unicode letter rather
 * than A-Za-z so non-Latin scripts stay valid. Club and tournament names do
 * not set it — "Summer 2026 Open" is legitimate.
 */
export function validateName(
  value: string,
  label: string,
  opts?: { requireLetter?: boolean },
): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return `${label} is required`;
  if (trimmed.length > MAX_NAME) return `${label} must be ${MAX_NAME} characters or less`;
  if (opts?.requireLetter && !/\p{L}/u.test(trimmed)) return `${label} must contain a letter`;
  return null;
}

export const MAX_USERNAME = 20;
export const MIN_USERNAME = 3;

// Mirrors public.is_valid_username in 0029_usernames.sql. Both must move
// together — the SQL side is the authority, this one only spares a round-trip.
const USERNAME_RE = /^[a-z0-9][a-z0-9_]{1,18}[a-z0-9]$/;

const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "support", "help", "root",
  "system", "moderator", "official", "badminton", "null", "undefined",
]);

/**
 * Validate a user-supplied username. Returns an error message, or null when
 * valid. Input is lowercased and trimmed first, so "Rahul_07" is normalised
 * rather than rejected — the canonical stored form is always lowercase.
 */
export function validateUsername(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (v.length === 0) return "Username is required";
  if (RESERVED_USERNAMES.has(v)) return "That username is reserved";
  if (!USERNAME_RE.test(v)) {
    return `Usernames are ${MIN_USERNAME}-${MAX_USERNAME} characters, using letters, numbers, and underscores`;
  }
  return null;
}
