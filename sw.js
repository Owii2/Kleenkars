// sw.js — minimal offline cache (optional)
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
