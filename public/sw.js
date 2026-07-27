const CACHE_NAME = 'foxflix-v3';

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    // Network-first strategy to prevent stale code caching issues
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
