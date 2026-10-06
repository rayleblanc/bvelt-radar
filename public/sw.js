const CACHE_NAME = 'bvelt-radar-shell-v2';

// Cache ONLY valid production shell assets (NEVER development /src/ paths)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clientsClaim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass caching for all API endpoints, auth, and dynamic actions
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/run' ||
    url.pathname === '/stats' ||
    url.pathname === '/prospects' ||
    url.pathname === '/health' ||
    url.pathname === '/decision' ||
    url.pathname === '/verify-key' ||
    url.pathname === '/logout' ||
    url.pathname === '/seeds' ||
    url.pathname.startsWith('/telegram')
  ) {
    return; // Pass through to network
  }

  // Cache-first strategy for bundled static /assets/ and precached icons
  if (url.pathname.startsWith('/assets/') || PRECACHE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Navigation requests: Network-first with fallback to cached shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html') || caches.match('/');
      })
    );
    return;
  }

  // Default network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
