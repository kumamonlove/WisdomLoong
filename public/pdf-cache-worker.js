const cacheName = "wisdomloong-papers-v1";
const pdfPath = /^\/api\/articles\/\d+\/pdf$/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !pdfPath.test(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cacheKey = new Request(url.origin + url.pathname);
    const range = event.request.headers.get("range");
    if (range) return fetch(event.request);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const response = await fetch(event.request);
    if (response.ok && response.status === 200) {
      event.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  })());
});
