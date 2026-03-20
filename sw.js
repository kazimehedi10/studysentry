// ============================================================
// sw.js — StudySentry Service Worker (PWA Offline Support)
// ============================================================

const CACHE_NAME = "studysentry-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/app.js",
  "/firebase-config.js",
  "/manifest.json",
  "https://cdn.tailwindcss.com",
  "https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@300;400;500;600;700&family=Rajdhani:wght@500;600;700&display=swap"
];

// Install: cache core assets
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
});

// Activate: clean old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first, fallback to cache
self.addEventListener("fetch", event => {
  // Skip Firebase API requests (handled by Firestore offline persistence)
  if (event.request.url.includes("firestore.googleapis.com") ||
      event.request.url.includes("firebase") ||
      event.request.url.includes("anthropic")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
