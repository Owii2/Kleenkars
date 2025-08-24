// sw.js — kill switch to remove old caches & unregister this SW
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', async (e) => {
  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((c) => caches.delete(c)));
  } catch (err) {}
  // Unregister self
  if (self.registration && self.registration.unregister) {
    await self.registration.unregister();
  }
  // Take control of all pages so they stop using the old SW immediately
  self.clients.claim();
  // Tell pages to reload
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((client) => client.navigate(client.url));
});

// No offline handling anymore
self.addEventListener('fetch', () => {});
