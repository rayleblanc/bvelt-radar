const CACHE_NAME = 'bvelt-radar-shell-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/index.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
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
  
  // Do NOT cache API endpoints or service controls
  if (
    url.pathname.startsWith('/api/') || 
    url.pathname === '/run' || 
    url.pathname === '/stats' || 
    url.pathname === '/decision' || 
    url.pathname === '/health' ||
    url.pathname === '/telegram-webhook'
  ) {
    return; // Let the browser handle standard network request
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).catch(() => {
        // Fallback to index.html if request is navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      });
    })
  );
});
