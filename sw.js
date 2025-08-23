const CACHE_NAME = "kleenkars-v2";  // ⬅️ change v1 → v2
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => self.clients.matchAll({ type: "window" }).then(clients => {
  clients.forEach(client => client.navigate(client.url));
}));

// Disable all caching:
self.addEventListener("fetch", e => {
  // Just pass through without caching
  return;
});// sw.js — minimal offline cache (optional)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('kleenkars-v1').then(cache =>
      cache.addAll([
        '/',               // homepage
        '/index.html',     // adjust if your index has a different path
        '/assets/logo.png' // small essentials; add more if you want
      ])
    )
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(resp => resp || fetch(event.request))
  );
});
