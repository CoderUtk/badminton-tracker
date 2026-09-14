// Hand-written app-shell service worker. The web build is online-only (see the
// guest-match spec), so this caches only the shell — HTML, JS bundle, fonts,
// icons — for instant repeat launches and an offline launch that reaches the
// app rather than the browser's error page. It never touches Supabase or any
// cross-origin request.
//
// ponytail: cache name carries a build id stamped in by scripts/stamp-sw.js at
// deploy time, so every deploy self-invalidates. No manual version bumps.
const BUILD = '__SW_BUILD__';
const CACHE = 'courtside-shell-' + BUILD;

/**
 * True when a response really is JavaScript.
 *
 * vercel.json rewrites every unmatched path to "/", so a missing or
 * not-yet-propagated asset comes back as index.html with status 200 — `res.ok`
 * cannot tell "here is your file" from "here is the app shell". Caching one of
 * those under a .js URL serves HTML where the entry bundle should be and
 * blanks the app for that browser until the cache name changes, so every
 * write checks the type first.
 */
function isScript(res) {
  return !!res && res.ok && (res.headers.get('content-type') || '').includes('javascript');
}

// Cloudflare serves the document at `/` and 301-redirects `/index.html` → `/`,
// so `/index.html` is never precached (a redirected response is rejected for
// navigations). Only branch-owned, guaranteed files go in the atomic set.
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // /favicon.ico only exists because app.json sets web.favicon — best-effort.
      await cache.add('/favicon.ico').catch(() => {});
      // Precache the content-hashed entry bundle so an offline launch right
      // after a deploy isn't a blank shell. Discover it from the served HTML.
      try {
        const html = await (await fetch('/')).text();
        const m = html.match(/src="(\/_expo\/[^"]+\.js)"/);
        // NOT cache.add: vercel.json rewrites every unmatched path to "/", so a
        // bundle the edge has not propagated yet answers with index.html at
        // status 200 — which cache.add happily stores under the .js URL. The
        // fetch handler below is cache-first, so from then on the app's own
        // entry bundle is served as HTML and the page is blank forever. That
        // is exactly what happened on a deploy: the new index.html was live
        // naming a hash the edge had not caught up with yet.
        if (m) {
          const res = await fetch(m[1]);
          if (isScript(res)) await cache.put(m[1], res.clone()).catch(() => {});
        }
      } catch (e) {
        // best-effort — install still succeeds without the bundle precached
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch Supabase / cross-origin

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/').then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // A script request must never be answered from a cached HTML entry. An
  // older worker could cache one (the rewrite makes a missing asset a 200
  // app shell), and a browser holding that entry cannot run the app at all —
  // so distrusting the hit here is what heals those browsers rather than
  // leaving them blank until some future deploy rotates the cache name.
  const wantsScript = req.destination === 'script' || url.pathname.endsWith('.js');

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit && !(wantsScript && !isScript(hit))) return hit;
      return fetch(req).then((res) => {
        // Same guard on the way in: only store a script response that really
        // is a script, so the app shell can never be written under a .js URL.
        if (res.ok && res.type === 'basic' && (!wantsScript || isScript(res))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
