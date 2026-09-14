/**
 * The service worker is plain browser JS with no bundler entry, so it is
 * loaded as source into a hand-built fake of the few globals it touches.
 *
 * What is under test is one rule, and it is the rule that took the production
 * site down: vercel.json rewrites every unmatched path to "/", so a missing or
 * not-yet-propagated asset answers with index.html at status 200. `res.ok`
 * therefore cannot distinguish "here is your file" from "here is the app
 * shell", and caching an app shell under the content-hashed entry-bundle URL
 * serves HTML where JavaScript should be — a blank page, permanently, for
 * every browser holding that entry.
 */
import { readFileSync } from "fs";
import { join } from "path";

type Res = {
  ok: boolean;
  type: string;
  headers: { get(k: string): string | null };
  clone(): Res;
  text(): Promise<string>;
};

const res = (contentType: string, ok = true): Res => {
  const r: Res = {
    ok,
    type: "basic",
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? contentType : null) },
    clone: () => r,
    text: async () => "",
  };
  return r;
};
const HTML = () => res("text/html; charset=utf-8");
const JS = () => res("application/javascript; charset=utf-8");

const BUNDLE = "/_expo/static/js/web/entry-abc123.def456.js";

/**
 * Keys by pathname so a seeded "/_expo/....js" and a lookup by Request are the
 * same entry — keying by the raw argument made the poisoned-entry test pass
 * because the lookup MISSED, not because the worker refused the hit.
 */
class FakeCache {
  store = new Map<string, Res>();
  private key(req: string | { url: string }) {
    const url = typeof req === "string" ? req : req.url;
    return url.startsWith("http") ? new URL(url).pathname : url;
  }
  async put(req: string | { url: string }, r: Res) { this.store.set(this.key(req), r); }
  async add(req: string) { throw new Error(`cache.add(${req}) is unguarded — use fetch + put behind a type check`); }
  async addAll() { /* shell precache, not under test */ }
  async match(req: string | { url: string }) { return this.store.get(this.key(req)); }
}

/** Loads sw.js with a fake global scope and returns the handlers it registered. */
function loadSw(fetchImpl: (input: any, init?: { cache?: string }) => Promise<Res>) {
  const cache = new FakeCache();
  const handlers: Record<string, (e: any) => void> = {};
  const scope = {
    addEventListener: (name: string, fn: (e: any) => void) => { handlers[name] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    location: { origin: "https://courtside-links.vercel.app" },
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
      match: async (req: any) => cache.match(req),
    },
    fetch: fetchImpl,
    URL,
  };
  const src = readFileSync(join(__dirname, "..", "public", "sw.js"), "utf8")
    .replace(/__SW_BUILD__/g, "test-build");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("self", "caches", "fetch", "URL", `${src}`)(
    scope, scope.caches, scope.fetch, URL,
  );
  return { handlers, cache };
}

/** Drives an install/fetch event and waits for whatever it promised. */
async function run(handler: (e: any) => void, event: Record<string, unknown>) {
  let pending: Promise<unknown> | undefined;
  let responded: Promise<Res> | undefined;
  handler({
    ...event,
    waitUntil: (p: Promise<unknown>) => { pending = p; },
    respondWith: (p: Promise<Res>) => { responded = p; },
  });
  if (pending) await pending;
  return responded ? await responded : undefined;
}

test("install does not precache the app shell under the entry-bundle URL", async () => {
  // The deploy-window race: index.html already names the new hash, but that
  // asset 404s at the edge and the rewrite answers with the shell at 200.
  const { handlers, cache } = loadSw(async (input: any) => {
    const url = typeof input === "string" ? input : input.url;
    if (url === "/") return { ...HTML(), text: async () => `<script src="${BUNDLE}"></script>` } as Res;
    return HTML();
  });

  await run(handlers.install, {});

  expect(cache.store.has(BUNDLE)).toBe(false);
});

test("install precaches the entry bundle when the edge really serves it", async () => {
  const { handlers, cache } = loadSw(async (input: any) => {
    const url = typeof input === "string" ? input : input.url;
    if (url === "/") return { ...HTML(), text: async () => `<script src="${BUNDLE}"></script>` } as Res;
    return JS();
  });

  await run(handlers.install, {});

  expect(cache.store.has(BUNDLE)).toBe(true);
});

test("a script request ignores a poisoned HTML cache entry and refetches", async () => {
  // This is the healing path: a browser that already holds the bad entry from
  // an older worker must not be left blank until some future deploy.
  let fetched = 0;
  const { handlers, cache } = loadSw(async () => { fetched++; return JS(); });
  await cache.put(BUNDLE, HTML());

  const out = await run(handlers.fetch, {
    request: {
      method: "GET",
      url: `https://courtside-links.vercel.app${BUNDLE}`,
      mode: "no-cors",
      destination: "script",
    },
  });

  expect(fetched).toBe(1);
  expect(out!.headers.get("content-type")).toContain("javascript");
  expect((await cache.match(BUNDLE))!.headers.get("content-type")).toContain("javascript");
});

test("the runtime cache refuses to store a shell response under a script URL", async () => {
  const { handlers, cache } = loadSw(async () => HTML());

  await run(handlers.fetch, {
    request: {
      method: "GET",
      url: `https://courtside-links.vercel.app${BUNDLE}`,
      mode: "no-cors",
      destination: "script",
    },
  });

  expect(cache.store.has(BUNDLE)).toBe(false);
});

test("a cached non-script asset is still served from the cache", async () => {
  const png = "https://courtside-links.vercel.app/icons/icon-192.png";
  let fetched = 0;
  const { handlers, cache } = loadSw(async () => { fetched++; return res("image/png"); });
  await cache.put(png, res("image/png"));

  const out = await run(handlers.fetch, {
    request: { method: "GET", url: png, mode: "no-cors", destination: "image" },
  });

  expect(fetched).toBe(0);
  expect(out!.headers.get("content-type")).toBe("image/png");
});

// The healing path for the browser's own HTTP cache. vercel.json marks
// /_expo/* immutable for a year, so an app shell served under a bundle URL is
// cached AS that bundle for a year — a plain refetch returns the same poison.
// Only a reload-mode request bypasses it, and going through the worker is the
// browser's one chance to notice and repair itself.
test("a script that comes back as HTML is refetched bypassing the HTTP cache", async () => {
  const modes: (string | undefined)[] = [];
  const { handlers, cache } = loadSw(async (_input: any, init?: { cache?: string }) => {
    modes.push(init && init.cache);
    return init && init.cache === "reload" ? JS() : HTML();
  });

  const out = await run(handlers.fetch, {
    request: {
      method: "GET",
      url: `https://courtside-links.vercel.app${BUNDLE}`,
      mode: "no-cors",
      destination: "script",
    },
  });

  expect(modes).toEqual([undefined, "reload"]);
  expect(out!.headers.get("content-type")).toContain("javascript");
  // and the repaired response is what gets cached
  expect((await cache.match(BUNDLE))!.headers.get("content-type")).toContain("javascript");
});
