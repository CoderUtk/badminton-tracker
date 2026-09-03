import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { stampSw } from "../scripts/stamp-sw";
import { shouldShowIosInstallHint, IOS_HINT_DISMISSED_KEY } from "../src/lib/pwa";

function tmpFile(contents: string): string {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sw-")), "sw.js");
  fs.writeFileSync(p, contents);
  return p;
}

describe("stampSw", () => {
  it("replaces every __SW_BUILD__ with a numeric id and returns it", () => {
    const p = tmpFile("const A='__SW_BUILD__'; const B='courtside-shell-__SW_BUILD__';");
    const id = stampSw(p);
    expect(id).toMatch(/^\d+$/);
    const out = fs.readFileSync(p, "utf8");
    expect(out).not.toContain("__SW_BUILD__");
    expect(out).toContain(`'${id}'`);
    expect(out).toContain(`courtside-shell-${id}`);
  });

  it("throws when the file has no __SW_BUILD__ placeholder", () => {
    const p = tmpFile("const A = 'already-stamped-123';");
    expect(() => stampSw(p)).toThrow(/__SW_BUILD__/);
  });
});

const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IOS_CHROME_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

describe("shouldShowIosInstallHint", () => {
  it("true for fresh iOS Safari", () => {
    expect(shouldShowIosInstallHint({ userAgent: IOS_SAFARI_UA, standalone: false, dismissed: false })).toBe(true);
  });
  it("false when already installed (standalone)", () => {
    expect(shouldShowIosInstallHint({ userAgent: IOS_SAFARI_UA, standalone: true, dismissed: false })).toBe(false);
  });
  it("false when previously dismissed", () => {
    expect(shouldShowIosInstallHint({ userAgent: IOS_SAFARI_UA, standalone: false, dismissed: true })).toBe(false);
  });
  it("false for Chrome on iOS (CriOS)", () => {
    expect(shouldShowIosInstallHint({ userAgent: IOS_CHROME_UA, standalone: false, dismissed: false })).toBe(false);
  });
  it("false for Android Chrome", () => {
    expect(shouldShowIosInstallHint({ userAgent: ANDROID_UA, standalone: false, dismissed: false })).toBe(false);
  });
  it("false for desktop", () => {
    expect(shouldShowIosInstallHint({ userAgent: DESKTOP_UA, standalone: false, dismissed: false })).toBe(false);
  });
  it("exports the localStorage key", () => {
    expect(IOS_HINT_DISMISSED_KEY).toBe("ios_install_hint_dismissed");
  });
});
