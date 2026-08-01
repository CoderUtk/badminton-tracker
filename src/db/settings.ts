// Local key/value settings (e.g. offline display name). Appended to MIGRATIONS in db.ts.
export const SETTINGS_DDL = `
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;
