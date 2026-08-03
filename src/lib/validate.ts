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
