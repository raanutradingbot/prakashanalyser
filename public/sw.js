const CACHE = "prakash-analyser-shell-v2";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Only intervene for real page navigations and the known shell assets above.
// Everything else (JS chunks, images, and — critically — Next.js's RSC data
// fetches, which reuse the *same URL* as the page with different headers)
// passes straight through to the network untouched. Caching those under the
// plain URL would risk a corrupted/aborted RSC fetch later being served back
// as the full page for that route (this happened during desktop-app testing:
// a crashed render left a bad cache entry that made every /analyze/X page
// render as the homepage until the cache was cleared).
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const isNavigation = request.mode === "navigate";
  const isShellAsset = SHELL.some((path) => request.url.endsWith(path));
  if (request.method !== "GET" || (!isNavigation && !isShellAsset)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});
