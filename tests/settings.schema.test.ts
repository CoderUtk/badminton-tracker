import { SETTINGS_DDL } from "../src/db/settings";
test("settings DDL declares app_settings", () => {
  expect(SETTINGS_DDL).toMatch(/CREATE TABLE IF NOT EXISTS app_settings/);
  expect(SETTINGS_DDL).toMatch(/key TEXT PRIMARY KEY/);
});
