/* Kin's service worker: offline Kin, push notifications, and nothing else.
 *
 * WHAT OPENS OFFLINE, AND WHERE ITS DATA LIVES
 *
 * With no connection, any page of Kin opens the offline shell (app/offline):
 * one static page, cached here with the build files it needs, that shows
 * Today, the shopping list, this week's Planner, recent chat and the
 * emergency cards from the phone's own copy in IndexedDB
 * (lib/offline/store.ts).
 *
 * Rendered pages are no longer cached at all. The first version of this file
 * kept the last-seen HTML of the list, the Planner and Today, which put a
 * household's page on disk under a URL, for whoever held the phone next,
 * cleared only if somebody reached the sign-in screen. The copy in IndexedDB
 * is saved for one signed-in user, wiped when anyone else signs in, and built
 * from a fixed list of fields -- the vault, Documents and Wealth are never in
 * it. The shell itself holds no data, so caching it costs nothing.
 *
 * NEVER TOUCHED
 *
 * /api and /auth go straight to the network, always: sessions, tokens,
 * mutations, the snapshot and the replay. Nothing here stores a cookie or
 * a response that carries one.
 *
 * WRITES
 *
 * The first version refused to queue changes, because a replay that silently
 * loses an edit is worse than a button that plainly did not work. Offline
 * Kin now queues four -- tick, add to the list, mark a Today item done, send
 * to the household chat -- and says what happened to each when it syncs,
 * including the ones it did not apply and why (app/api/offline/replay). That
 * is the condition the first version set, met rather than dropped.
 */

const VERSION = "kin-v2";
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;

const OFFLINE_URL = "/offline";
const ICONS = ["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

/** A navigation that has not answered in this long is treated as offline:
 * a lift or a train gives a connection that is there and delivers nothing. */
const NAVIGATION_TIMEOUT_MS = 10000;

/** Caches the offline shell and every build file its HTML names -- scripts,
 * styles, fonts -- so it can start with no network at all. Written to a
 * fresh cache and swapped in only once complete, so a refresh that fails
 * half way never leaves a shell whose scripts are missing. */
async function cacheShell() {
  const res = await fetch(OFFLINE_URL, { cache: "no-store", credentials: "same-origin", redirect: "error" });
  if (!res.ok) throw new Error(`offline shell ${res.status}`);
  const html = await res.clone().text();
  const current = await (await caches.open(SHELL)).match(OFFLINE_URL);
  if (current && (await current.text()) === html) return;

  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? [])];
  const staticCache = await caches.open(STATIC);
  await Promise.all(
    assets.map(async (path) => {
      if (await staticCache.match(path)) return;
      const asset = await fetch(path, { credentials: "same-origin" });
      if (asset.ok) await staticCache.put(path, asset);
    }),
  );
  const next = await caches.open(`${SHELL}-next`);
  await next.put(OFFLINE_URL, res);
  await Promise.all(ICONS.map((icon) => next.add(icon).catch(() => undefined)));
  await caches.delete(SHELL);
  const fresh = await caches.open(SHELL);
  for (const req of await next.keys()) await fresh.put(req, await next.match(req));
  await caches.delete(`${SHELL}-next`);
  // A new shell means a new deploy: the old build's files are dead weight on
  // the phone. Pages re-cache what they use as they are opened.
  const keep = new Set(assets);
  for (const req of await staticCache.keys()) {
    if (!keep.has(new URL(req.url).pathname)) await staticCache.delete(req);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    cacheShell()
      // A shell that could not be fetched must not wedge the install, or the
      // worker never activates and push notifications stop with it. The app
      // asks again on its next load (components/offline-sync.tsx).
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // kin-v1's cache of rendered pages goes here, with everything else
      // that is not this version's.
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  // The app, online, after each load: fetch the shell again if a deploy has
  // changed it, so offline Kin is never more than one visit behind.
  if (event.data === "kin:refresh-shell") {
    event.waitUntil(cacheShell().catch(() => undefined));
  }
  // Kept for pages still running the old build. The shell holds no data, so
  // there is nothing personal left in these caches to clear; the offline
  // copy itself is cleared from the page (lib/offline/store.ts).
  if (event.data === "kin:clear-cache") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))));
  }
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Screens that must reach the network or say plainly that they cannot:
 * signing in with no connection is not something a cached page can fake. */
const NEVER_SHELL = ["/login", "/signup", "/verify", "/forgot-password", "/reset-password", "/subscribe", "/onboarding", "/join", "/connect"];

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Network first, always: online, Kin is the real thing, and the
          // shell is only ever the fallback.
          return await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
        } catch {
          const shell = await caches.match(OFFLINE_URL, { cacheName: SHELL });
          if (!shell || url.pathname === OFFLINE_URL) return shell ?? Response.error();
          if (NEVER_SHELL.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return shell;
          // Sent to the shell's own address, which carries where they were
          // going, so the shell opens on that screen and Next's router sees
          // the page it actually rendered.
          const to = new URL(OFFLINE_URL, self.location.origin);
          to.searchParams.set("from", url.pathname + url.search);
          return Response.redirect(to.href, 302);
        }
      })(),
    );
    return;
  }

  // Next's build output is content-hashed, so a hit is always the right file
  // and a miss goes to the network (and is kept for next time).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request, { cacheName: STATIC }).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC).then((cache) => cache.put(request, copy)).catch(() => undefined);
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (ICONS.includes(url.pathname)) {
    event.respondWith(caches.match(request, { cacheName: SHELL }).then((cached) => cached ?? fetch(request)));
  }
});

/** A notification from Kin (lib/push.ts). The payload is title, body, the
 * page to open and a tag, so a second message in the same chat replaces the
 * first rather than stacking. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Kin", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Kin", {
      body: data.body || "",
      // A call shows who is calling, like a phone's incoming-call banner.
      icon: data.icon || "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/today", call: data.call },
      // Answer and Decline on the notification itself, where the phone
      // supports buttons (Android; iPhones show the banner without them).
      ...(data.call
        ? {
            actions: [
              { action: "answer", title: "Answer" },
              { action: "decline", title: "Decline" },
            ],
          }
        : {}),
      // A ringing call stays on screen and buzzes again, where the phone
      // allows it, rather than sliding away like a chat message. The missed
      // call that follows it has the same tag, so it takes the ring's place.
      ...(data.ring ? { requireInteraction: true, renotify: true, vibrate: [800, 400, 800, 400, 800, 400, 800] } : {}),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const call = event.notification.data?.call;
  // Decline without opening Kin: the server tells the caller's phone, which
  // stops ringing and shows "declined" (28 September).
  if (call && event.action === "decline") {
    event.waitUntil(
      fetch("/api/calls/decline", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call: call.id, from: call.from }),
      }).catch(() => undefined),
    );
    return;
  }
  // Answer opens Kin and picks the call up as soon as its ring arrives.
  const path = call && event.action === "answer" ? `/chat?answer=${encodeURIComponent(call.id)}` : event.notification.data?.url || "/today";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of open) {
        if (client.url.startsWith(self.location.origin)) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
