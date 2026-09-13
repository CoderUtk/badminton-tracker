import { readFileSync } from "fs";
import { join } from "path";

const src = (p: string) => readFileSync(join(__dirname, "..", "src", "lib", p), "utf8");

/**
 * Regression guard for a bug that shipped to production review: flipping the
 * notification default to ON turned scheduleInactivityReminder — which runs in
 * the mount effect, before any session — into a permission REQUEST, so the OS
 * dialog appeared over the splash screen ahead of the sign-in form. Users
 * decline that, and once canAskAgain flips the OS never asks again.
 *
 * Structural rather than behavioural because the failure is about WHERE the
 * request happens, which no unit test of either function alone can see.
 */
test("reminders.ts never requests the permission, only checks it", () => {
  const s = src("reminders.ts");
  expect(s).toMatch(/hasNotificationPermission/);
  expect(s).not.toMatch(/ensureNotificationPermission/);
});

test("only the session-gated primer and the signed-in register path may request", () => {
  const push = src("push.ts");
  // Two call sites, both behind a session check. Any third needs the same.
  expect(push.match(/ensureNotificationPermission\(\)/g)).toHaveLength(2);

  // registerPushToken must resolve the user BEFORE it can pop a dialog.
  const fn = push.slice(push.indexOf("export async function registerPushToken"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  expect(body.indexOf("if (!user) return false;"))
    .toBeLessThan(body.indexOf("ensureNotificationPermission"));
});

test("the primer refuses to run without a session", () => {
  const fn = src("push.ts").slice(src("push.ts").indexOf("export async function primeNotificationPermission"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  expect(body.indexOf("if (!user) return;"))
    .toBeLessThan(body.indexOf("ensureNotificationPermission"));
  // And only once per install.
  expect(body).toMatch(/remindersUndecided/);
});
