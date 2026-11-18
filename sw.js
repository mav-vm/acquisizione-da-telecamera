const CACHE_NAME = 'modb-ocr-cache-v10';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './scannerIbrido.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Non intercettare le chiamate API di Gemini
  if (event.request.url.includes('googleapis.com')) return;

  // Per i file esterni (es. Tesseract CDN), scarica normalmente e salva in cache per l'offline
  if (!event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Per i file locali dell'app: Cache-First istantaneo
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
