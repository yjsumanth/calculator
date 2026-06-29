/* ============================================================
   Service worker — caches the app for offline use.
   Bump CACHE_VERSION whenever you change app files so users
   pick up the update on next launch.
   ============================================================ */

const CACHE_VERSION = 'calc-v2';
const CACHE_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

// Install: pre-cache the core files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(CACHE_FILES))
      .then(() => self.skipWaiting())
  );
});

// Activate: drop old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for the app shell, network fallback
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache same-origin successful responses
        if (
          response &&
          response.status === 200 &&
          response.type === 'basic'
        ) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached); // Offline fallback
    })
  );
});
