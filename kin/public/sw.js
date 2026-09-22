/* Kin's service worker: enough offline to be useful, and no more.
 *
 * WHAT IS CACHED, AND WHY THE LIST IS SHORT
 *
 * Only the two screens the request named -- the lists and the calendar --
 * plus Today, and only pages this household has already opened. Everything
 * else goes to the network and fails honestly when there isn't one.
 *
 * The temptation is to cache every page, because it is one line. The reason
 * not to is that a cached page is a rendered page, sitting on the device's
 * disk, readable without signing in again. For a household's shopping list
 * that is a fair trade. For the rest of Kin it is not:
 *
 *   /family  -- holds the Documents segment. Caching it would hand back a
 *               folder list that had been unlocked earlier, offline, with
 *               no PIN and no fingerprint. That would quietly undo the lock
 *               rather than merely fail to help.
 *   /wealth  -- money.
 *   /api, /auth -- sessions, tokens, mutations. Never.
 *
 * So the allow list below is an allow list on purpose. Adding to it is a
 * decision about what may sit unencrypted on a phone somebody leaves on a
 * table, not a performance tweak.
 *
 * WRITES DO NOT QUEUE
 *
 * Ticking something off while offline does not save. Queuing mutations
 * means replaying them later against row-level security, against rows that
 * may have changed, with no way to tell the person what happened to their
 * change -- and a sync that silently loses an edit is worse than a button
 * that plainly did not work. The offline page says so in those words.
 */

const VERSION = "kin-v1";
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;

const OFFLINE_URL = "/offline";
const SHELL_ASSETS = [OFFLINE_URL, "/icon-192.png", "/icon-512.png"];

/** Only these, and only their exact paths or sub-paths. */
const CACHEABLE = ["/household", "/planner", "/today"];

function mayCache(url) {
  if (url.origin !== self.location.origin) return false;
  return CACHEABLE.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      // A missing asset must not wedge the install, or the worker never
      // activates and offline silently does nothing.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Signing out has to take the cached pages with it. Without this, the next
 * person to pick up the phone could read the last household's list while
 * offline. The app posts this message from its sign-out path. */
self.addEventListener("message", (event) => {
  if (event.data === "kin:clear-cache") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          // Network-first, so a household online always sees the real thing
          // and the cache is only ever a fallback.
          if (fresh.ok && mayCache(url)) {
            const copy = fresh.clone();
            caches.open(PAGES).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return fresh;
        } catch {
          const cached = await caches.match(request, { ignoreSearch: false });
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return offline ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Next's build output is content-hashed, so a hit is always the right file
  // and a miss simply goes to the network.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL).then((cache) => cache.put(request, copy)).catch(() => undefined);
            }
            return response;
          }),
      ),
    );
  }
});
