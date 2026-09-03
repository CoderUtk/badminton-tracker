import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { stampSw } from "../scripts/stamp-sw";

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
