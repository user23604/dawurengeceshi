const CACHE_NAME = 'ipip-neo-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './data/questions.json',
    './data/scoring_keys.json',
    './data/results.json'
];

// Install Event: Cache all critical assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching all assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event: Stale-While-Revalidate strategy for API/GitHub, Cache First for local assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Bypass cache for GitHub API requests
    if (url.origin === 'https://api.github.com') {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached response immediately, but fetch a new one in the background (stale-while-revalidate)
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse.clone());
                        });
                    }
                }).catch(() => { /* Ignore background fetch failures */ });
                
                return cachedResponse;
            }

            // If not in cache, fallback to network
            return fetch(event.request).then((response) => {
                // If it's a valid local request (not a chrome-extension or data URI), cache it
                if (response && response.status === 200 && url.protocol.startsWith('http')) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            }).catch(() => {
                // Optional: Return a custom offline page if network fails and mostly looking for HTML
                // return caches.match('/offline.html');
            });
        })
    );
});
