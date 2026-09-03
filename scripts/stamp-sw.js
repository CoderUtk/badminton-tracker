// Replaces the __SW_BUILD__ placeholder in the exported service worker with a
// unique id, so every deploy produces a different sw.js and the browser
// re-installs it (its `activate` then purges the previous shell cache).
const fs = require("fs");
const path = require("path");

/**
 * @param {string} swPath  path to the service worker file to stamp
 * @returns {string} the id written
 */
function stampSw(swPath) {
  const src = fs.readFileSync(swPath, "utf8");
  if (!src.includes("__SW_BUILD__")) {
    throw new Error(`${swPath} has no __SW_BUILD__ placeholder — did public/sw.js change?`);
  }
  const id = String(Date.now());
  fs.writeFileSync(swPath, src.replace(/__SW_BUILD__/g, id));
  return id;
}

module.exports = { stampSw };

if (require.main === module) {
  const target = path.join(__dirname, "..", "dist", "sw.js");
  const id = stampSw(target);
  console.log(`stamped ${target} -> ${id}`);
}
