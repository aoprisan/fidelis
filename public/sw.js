/*
 * Fidelis Backtester — service worker (hand-rolled, no build plugin).
 *
 * Strategy, kept deliberately simple and inspectable:
 *   - App shell (index, manifest, icons) is precached on install.
 *   - Navigations: network-first, falling back to the cached shell offline.
 *     This lets a new deploy's HTML (which references freshly-hashed assets)
 *     win when online, while still working with no network.
 *   - Same-origin assets (hashed JS/CSS/images): stale-while-revalidate —
 *     serve instantly from cache, refresh in the background. Safe because
 *     Vite's content-hashed filenames are immutable.
 *   - Cross-origin requests are ignored (e.g. the claude.ai deep-link opens
 *     in a new tab and is never intercepted here).
 *
 * Bump CACHE when the shell list or caching logic changes; old caches are
 * pruned on activate.
 */

const CACHE = "fidelis-v1";

// Relative to the SW's own URL, i.e. the registration scope root. Works on a
// GitHub Pages subpath (…/repo/) exactly as it does at the domain root.
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Tolerate a missing optional asset rather than failing the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't touch cross-origin

  // Navigations → network-first with an offline fallback to the app shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html"))),
    );
    return;
  }

  // Assets → stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
