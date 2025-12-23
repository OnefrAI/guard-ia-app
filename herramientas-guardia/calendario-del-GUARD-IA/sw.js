// ========================================
// Service Worker - Calendario GUARD-IA
// ========================================

const CACHE_NAME = 'calendario-guardia-v1';
const CACHE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    // CDN resources (will be cached on first load)
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Install event - cache assets
self.addEventListener('install', event => {
    console.log('[SW Calendario] Installing v1...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW Calendario] Caching app shell');
                return cache.addAll(CACHE_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch(err => console.error('[SW Calendario] Cache failed:', err))
    );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
    console.log('[SW Calendario] Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name.startsWith('calendario-guardia-') && name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW Calendario] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', event => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip Firebase/external API requests (let them go through normally)
    const url = new URL(event.request.url);
    if (url.hostname.includes('firebase') ||
        url.hostname.includes('googleapis') ||
        url.hostname.includes('gstatic')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Clone and cache successful responses
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache if network fails
                return caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // If not in cache and offline, return offline page for navigation
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

// Listen for skip waiting message
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
