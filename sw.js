const SHELL_CACHE = 'my-garden-shell-v2';
const THREE_CACHE = 'my-garden-three-v187';
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.webgpu.js';
const THREE_CORE_URL = 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.core.js';
const SHELL_FILES = [
  '/', '/index.html', '/styles.css', '/manifest.webmanifest', '/icon.svg',
  '/src/main.js', '/src/world.js', '/src/data.js', '/src/storage.js', '/src/terrain.js', '/src/ledger.js',
];

self.addEventListener('install', event => {
  event.waitUntil(Promise.allSettled([
    caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_FILES)),
    caches.open(THREE_CACHE).then(cache => Promise.allSettled([cache.add(THREE_URL), cache.add(THREE_CORE_URL)])),
  ]).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('my-garden-') && ![SHELL_CACHE, THREE_CACHE].includes(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;

  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        if (fresh.ok && (request.destination === 'script' || request.destination === 'style' || request.destination === 'document' || url.pathname.startsWith('/src/'))) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  if (url.hostname === 'cdn.jsdelivr.net' && request.destination === 'script') {
    event.respondWith((async () => {
      const cache = await caches.open(THREE_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })());
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if ('focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow('/');
  })());
});
