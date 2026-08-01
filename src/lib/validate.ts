export const MAX_NAME = 50;

/** Validate a user-supplied name. Returns an error message, or null when valid. */
export function validateName(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return `${label} is required`;
  if (trimmed.length > MAX_NAME) return `${label} must be ${MAX_NAME} characters or less`;
  return null;
}
