importScripts('./version.js');

const CACHE_NAME = 'modb-ocr-cache-v' + APP_VERSION;

const ASSETS = [
    './',
    './index.html',
    './app.js',
    './scannerIbrido.js',
    './manifest.json',
    './version.js',
    './tesseract/tesseract.min.js',
    './tesseract/worker.min.js',
    './tesseract/tesseract-core.wasm.js',
    './tesseract/tesseract-core.wasm',
    './tesseract/ita.traineddata'
];

self.addEventListener('install', (event) => {

    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
    );

});

self.addEventListener('activate', (event) => {

    event.waitUntil(

        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())

    );

});

self.addEventListener('fetch', (event) => {

    if (event.request.method !== 'GET') return;

    if (event.request.url.includes('googleapis.com')) return;

    if (
        event.request.url.includes('version.js') ||
        event.request.url.includes('manifest.json')
    ) {

        event.respondWith(
            fetch(event.request, {
                cache: 'no-store'
            }).catch(() => caches.match(event.request))
        );

        return;
    }

    event.respondWith(

        caches.match(event.request)

            .then(cached => {

                if (cached) {

                    fetch(event.request)

                        .then(response => {

                            if (response && response.status === 200) {

                                const clone = response.clone();

                                caches.open(CACHE_NAME)
                                    .then(cache => cache.put(event.request, clone));

                            }

                        })

                        .catch(() => {});

                    return cached;
                }

                return fetch(event.request)

                    .then(response => {

                        if (response && response.status === 200) {

                            const clone = response.clone();

                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, clone));

                        }

                        return response;

                    });

            })

    );

});