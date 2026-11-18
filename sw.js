const CACHE_NAME = 'modb-ocr-cache-v9';
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
  if (event.request.url.includes('googleapis.com')) return;

  // Risponde subito dalla cache se presente (zero attesa di rete)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      // Se non è in cache, scarica con timeout massimo di 3 secondi
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      return fetch(event.request, { signal: controller.signal })
        .then((response) => {
          clearTimeout(timeoutId);
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => new Response('', { status: 408, statusText: 'Timeout rete' }));
    })
  );
});

